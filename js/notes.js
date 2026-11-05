// Accès aux notes : avec supabase.js, le seul fichier qui parle au backend.
// Renvoie des objets simples { id, title, content, folder, tags, created_at, updated_at }.
//
// Hors ligne (ou si le serveur ne répond pas), les écritures vont dans la copie locale
// (local.js, IndexedDB) et dans une file d'attente rejouée au retour du réseau. Une note
// modifiée ailleurs entre-temps devient un conflit : rien n'est écrasé sans choix.
// L'état (hors ligne, en attente, conflits) est annoncé par l'événement `cairn-sync`.
import { client } from './supabase.js';
import * as local from './local.js';

const COLONNES = 'id, title, content, folder, tags, created_at, updated_at';
const CHAMPS = ['title', 'content', 'folder', 'tags'];

/** Traduit une erreur du backend en code court. */
function codeErreur(error) {
  if (!error) return null;
  if (error.code === '23505') return 'titre-pris';          // index unique (user_id, lower(title))
  if (error.code === 'PGRST116') return 'introuvable';      // .single() sans ligne
  const msg = (error.message || '').toLowerCase();
  if (msg.includes('fetch') || msg.includes('network') || msg.includes('load failed')) return 'reseau';
  return 'inconnue';
}

const resultat = ({ data, error }) => (error ? { erreur: codeErreur(error) } : { note: data });
const reseauKo = () => ({ erreur: 'reseau' });
const garder = (champs) => Object.fromEntries(Object.entries(champs).filter(([k]) => CHAMPS.includes(k)));
const date = (iso) => Date.parse(iso || 0) || 0;

// ---------- État hors ligne ----------

const etat = {
  copie: false,          // copie locale ouverte (IndexedDB disponible)
  horsLigne: false,
  attente: new Set(),    // ids des notes à envoyer
  conflits: new Map(),   // id → { local, serveur }
  synchro: null,         // promesse de la synchronisation en cours
};

function annoncer(extra = {}) {
  document.dispatchEvent(new CustomEvent('cairn-sync', {
    detail: {
      horsLigne: etat.horsLigne,
      enAttente: [...etat.attente],
      conflits: [...etat.conflits.values()],
      ...extra,
    },
  }));
}

function passerHorsLigne() {
  if (!etat.horsLigne) { etat.horsLigne = true; annoncer(); }
}

const enLigne = () => navigator.onLine !== false;

/** À appeler à la connexion : ouvre la copie locale de cet utilisateur (une autre est effacée). */
export async function ouvrirCopie(idUtilisateur) {
  etat.copie = await local.disponible();
  etat.attente.clear();
  etat.conflits.clear();
  etat.horsLigne = !enLigne();
  if (!etat.copie) return;
  await local.definirProprietaire(idUtilisateur);
  for (const op of await local.lireAttente()) etat.attente.add(op.id);
  annoncer();
}

/** À la déconnexion : la copie locale est effacée. */
export async function fermerCopie() {
  etat.attente.clear();
  etat.conflits.clear();
  if (etat.copie) await local.toutEffacer().catch(() => {});
  etat.copie = false;
}

export const modificationsEnAttente = () => etat.attente.size;

// ---------- Serveur ----------

const serveur = {
  lister: () => client.from('notes').select(COLONNES).order('updated_at', { ascending: false }),
  lire: (id) => client.from('notes').select(COLONNES).eq('id', id).single(),
  creer: (champs) => client.from('notes').insert(champs).select(COLONNES).single(),
  modifier: (id, champs) => client.from('notes').update(champs).eq('id', id).select(COLONNES).single(),
  supprimer: (id) => client.from('notes').delete().eq('id', id),
};

/** Appel au serveur ; null si le réseau manque (au lieu d'une erreur). */
async function essayer(appel) {
  if (!enLigne()) return null;
  try {
    const r = await appel();
    if (r.error && codeErreur(r.error) === 'reseau') return null;
    return r;
  } catch {
    return null;
  }
}

// ---------- Lecture ----------

/** Toutes les notes, les plus récemment modifiées d'abord. */
export async function listerNotes() {
  if (!etat.copie) {
    const r = await essayer(serveur.lister);
    if (!r) return reseauKo();
    return r.error ? { erreur: codeErreur(r.error) } : { notes: r.data };
  }
  if (enLigne()) await synchroniser();
  const r = await essayer(serveur.lister);
  if (r && !r.error) {
    etat.horsLigne = false;
    // Les notes encore en attente (conflits, envois ratés) gardent leur version locale.
    const locales = new Map((await local.lireNotes()).map((n) => [n.id, n]));
    const notes = r.data.map((n) => (etat.attente.has(n.id) && locales.get(n.id)) || n);
    for (const id of etat.attente) {
      if (!notes.some((n) => n.id === id) && locales.get(id)) notes.push(locales.get(id));
    }
    await local.remplacerNotes(notes);
    annoncer();
    return { notes };
  }
  if (r && r.error) return { erreur: codeErreur(r.error) };
  passerHorsLigne();
  return { notes: await local.lireNotes(), horsLigne: true };
}

// ---------- Écriture (en ligne, sinon sur l'appareil) ----------

async function titrePrisLocalement(titre, sauf) {
  const t = titre.trim().toLowerCase();
  return (await local.lireNotes()).some((n) => n.id !== sauf && n.title.toLowerCase() === t);
}

function maintenant() {
  return new Date().toISOString();
}

export async function creerNote(champs) {
  if (!etat.copie) {
    const r = await essayer(() => serveur.creer(champs));
    return r ? resultat(r) : reseauKo();
  }
  const r = await essayer(() => serveur.creer(champs));
  if (r) {
    const res = resultat(r);
    if (res.note) await local.ecrireNote(res.note);
    return res;
  }
  // Hors ligne : la note naît sur l'appareil, avec son identifiant définitif.
  if (await titrePrisLocalement(champs.title || '', null)) return { erreur: 'titre-pris' };
  const t = maintenant();
  const note = { id: crypto.randomUUID(), title: '', content: '', folder: '', tags: [], ...garder(champs), created_at: t, updated_at: t };
  await local.ecrireNote(note);
  await local.mettreEnAttente({ id: note.id, type: 'creer', champs: { id: note.id, ...garder(note), created_at: t } });
  etat.attente.add(note.id);
  passerHorsLigne();
  annoncer();
  return { note, local: true };
}

/** Modifie les champs donnés (title, content, folder, tags). */
export async function modifierNote(id, champs) {
  if (!etat.copie) {
    const r = await essayer(() => serveur.modifier(id, champs));
    return r ? resultat(r) : reseauKo();
  }
  // Une note déjà en attente reste en attente : on ne double pas la file (et on ne contourne pas un conflit).
  if (!etat.attente.has(id)) {
    const r = await essayer(() => serveur.modifier(id, champs));
    if (r) {
      const res = resultat(r);
      if (res.note) await local.ecrireNote(res.note);
      return res;
    }
  }
  const ancienne = (await local.lireNotes()).find((n) => n.id === id);
  if (!ancienne) return { erreur: 'introuvable' };
  if ('title' in champs && await titrePrisLocalement(champs.title, id)) return { erreur: 'titre-pris' };
  const note = { ...ancienne, ...garder(champs), updated_at: maintenant() };
  await local.ecrireNote(note);
  await local.mettreEnAttente({ id, type: 'modifier', champs: garder(champs), base: ancienne.updated_at });
  etat.attente.add(id);
  if (!enLigne()) passerHorsLigne();
  annoncer();
  if (enLigne()) planifierSynchro();
  return { note, local: true };
}

export async function supprimerNote(id) {
  if (!etat.copie) {
    const r = await essayer(() => serveur.supprimer(id));
    if (!r) return reseauKo();
    return r.error ? { erreur: codeErreur(r.error) } : {};
  }
  if (!etat.attente.has(id)) {
    const r = await essayer(() => serveur.supprimer(id));
    if (r && !r.error) { await local.effacerNote(id); return {}; }
    if (r && r.error) return { erreur: codeErreur(r.error) };
  }
  const ancienne = (await local.lireNotes()).find((n) => n.id === id);
  await local.effacerNote(id);
  await local.mettreEnAttente({ id, type: 'supprimer', base: ancienne ? ancienne.updated_at : null });
  if ((await local.lireAttente()).some((op) => op.id === id)) etat.attente.add(id); else etat.attente.delete(id);
  etat.conflits.delete(id);
  passerHorsLigne();
  annoncer();
  return {};
}

// ---------- Synchronisation ----------

let minuteurSynchro = null;
function planifierSynchro(ms = 1500) {
  clearTimeout(minuteurSynchro);
  minuteurSynchro = setTimeout(() => { synchroniser(); }, ms);
}

/** Premier titre libre (casse ignorée) parmi les notes connues : « X », « X 2 », « X 3 »… */
async function titreLibre(titre) {
  const pris = new Set((await local.lireNotes()).map((n) => n.title.toLowerCase()));
  let t = titre;
  for (let i = 2; pris.has(t.toLowerCase()); i++) t = titre + ' ' + i;
  return t;
}

/** Envoie une opération. Renvoie 'ok', 'reseau', 'conflit' ou 'erreur'. */
async function rejouer(op) {
  const locale = (await local.lireNotes()).find((n) => n.id === op.id);

  if (op.type === 'supprimer') {
    const r = await essayer(() => serveur.supprimer(op.id));
    if (!r) return 'reseau';
    return r.error ? 'erreur' : 'ok';
  }

  if (op.type === 'creer') {
    let champs = { ...op.champs, ...(locale ? garder(locale) : {}) };
    let r = await essayer(() => serveur.creer(champs));
    if (r && codeErreur(r.error) === 'titre-pris') {
      // Titre pris entre-temps par une note créée ailleurs : on garde les deux.
      champs = { ...champs, title: await titreLibre(champs.title + ' (hors ligne)') };
      r = await essayer(() => serveur.creer(champs));
    }
    if (!r) return 'reseau';
    if (r.error) return 'erreur';
    await local.ecrireNote(r.data);
    return 'ok';
  }

  // modifier : la note a-t-elle changé sur le serveur depuis la version de départ ?
  const actuelle = await essayer(() => serveur.lire(op.id));
  if (!actuelle) return 'reseau';
  if (actuelle.error) {
    if (codeErreur(actuelle.error) !== 'introuvable' || !locale) return 'erreur';
    // Supprimée ailleurs : on la recrée pour ne pas perdre ce qui a été écrit.
    const r = await essayer(() => serveur.creer({ id: op.id, ...garder(locale) }));
    if (!r) return 'reseau';
    if (r.error) return 'erreur';
    await local.ecrireNote(r.data);
    return 'ok';
  }
  if (date(actuelle.data.updated_at) > date(op.base)) {
    etat.conflits.set(op.id, { id: op.id, local: locale, serveur: actuelle.data });
    return 'conflit';
  }
  const r = await essayer(() => serveur.modifier(op.id, locale ? garder(locale) : op.champs));
  if (!r) return 'reseau';
  if (r.error) return 'erreur';
  await local.ecrireNote(r.data);
  return 'ok';
}

/** Rejoue la file d'attente. Renvoie { envoyees, conflits }. */
export function synchroniser() {
  if (!etat.copie) return Promise.resolve({ envoyees: 0, conflits: 0 });
  etat.synchro ??= (async () => {
    let envoyees = 0;
    let coupe = false;
    try {
      for (const op of await local.lireAttente()) {
        if (etat.conflits.has(op.id)) continue;            // attend le choix de l'utilisateur
        const issue = await rejouer(op);
        if (issue === 'reseau') { coupe = true; break; }
        if (issue === 'ok') {
          await local.retirerAttente(op.id);
          etat.attente.delete(op.id);
          envoyees++;
        }
        // 'erreur' : l'opération reste en attente, on réessaiera.
      }
    } finally {
      etat.synchro = null;
    }
    etat.horsLigne = coupe || !enLigne();
    annoncer({ synchronisees: envoyees });
    return { envoyees, conflits: etat.conflits.size };
  })();
  return etat.synchro;
}

/**
 * Règle un conflit : 'appareil' (la version de cet appareil remplace celle du serveur),
 * 'serveur' (on abandonne la version de l'appareil) ou 'deux' (la version de l'appareil
 * devient une nouvelle note « … (appareil) »).
 */
export async function resoudreConflit(id, choix) {
  const conflit = etat.conflits.get(id);
  if (!conflit) return { erreur: 'introuvable' };
  if (choix === 'appareil') {
    const r = await essayer(() => serveur.modifier(id, garder(conflit.local)));
    if (!r) return reseauKo();
    if (r.error) return { erreur: codeErreur(r.error) };
    await local.ecrireNote(r.data);
  } else {
    if (choix === 'deux') {
      const titre = await titreLibre(conflit.local.title + ' (appareil)');
      const r = await essayer(() => serveur.creer({ ...garder(conflit.local), title: titre }));
      if (!r) return reseauKo();
      if (r.error) return { erreur: codeErreur(r.error) };
      await local.ecrireNote(r.data);
    }
    await local.ecrireNote(conflit.serveur);
  }
  await local.retirerAttente(id);
  etat.attente.delete(id);
  etat.conflits.delete(id);
  annoncer();
  return {};
}

// Retour du réseau : on envoie ce qui attend. Toutes les 30 s, on réessaie s'il reste quelque chose.
window.addEventListener('online', () => { synchroniser(); });
window.addEventListener('offline', () => passerHorsLigne());
setInterval(() => {
  if (etat.copie && etat.attente.size > etat.conflits.size && enLigne()) synchroniser();
}, 30000);
