// Interface de l'appli : liste, éditeur, aperçu, sauvegarde automatique.
// Routage par hash : #/ (liste) et #/note/<id>.
import { listerNotes, creerNote, modifierNote, supprimerNote } from './notes.js';
import { rendre, colorer, extrait, compterMots } from './markdown.js';

const DELAI_SAUVEGARDE = 1000;
const CLE_MODE = 'cairn-mode';
const etroit = window.matchMedia('(max-width: 760px)');

const $ = (id) => document.getElementById(id);

const etat = {
  notes: [],          // triées par updated_at décroissant
  courante: null,     // id de la note ouverte
  enAttente: {},      // champs modifiés pas encore envoyés
  minuteur: null,
  sauvegarde: null,   // promesse de la sauvegarde en cours
  mode: lireMode(),
  branche: false,
};

// ---------- Outils ----------

function lireMode() {
  try {
    const m = localStorage.getItem(CLE_MODE);
    if (m === 'edit' || m === 'split' || m === 'view') return m;
  } catch { /* préférences indisponibles */ }
  return 'split';
}

function ecrireMode(m) {
  try { localStorage.setItem(CLE_MODE, m); } catch { /* tant pis */ }
}

export function slug(titre) {
  const s = (titre || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s || 'sans-titre';
}

const fmtHeure = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });
const fmtJour = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });
const fmtJourAn = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });

function dateCourte(iso) {
  const d = new Date(iso);
  const maintenant = new Date();
  const jour = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const ecart = Math.round((jour(maintenant) - jour(d)) / 86400000);
  if (ecart === 0) return fmtHeure.format(d);
  if (ecart === 1) return 'hier';
  return d.getFullYear() === maintenant.getFullYear() ? fmtJour.format(d) : fmtJourAn.format(d);
}

function trier() {
  etat.notes.sort((a, b) => (a.updated_at < b.updated_at ? 1 : a.updated_at > b.updated_at ? -1 : 0));
}

function noteCourante() {
  return etat.notes.find((n) => n.id === etat.courante) || null;
}

function etatSauvegarde(html) {
  $('etat-sauvegarde').innerHTML = html;
}

const MESSAGES = {
  'titre-pris': 'Une note porte déjà ce titre : il n\'a pas été enregistré.',
  'titre-vide': 'Le titre ne peut pas être vide.',
  'reseau': 'Serveur injoignable : la note sera enregistrée au retour du réseau.',
  'introuvable': 'Cette note n\'existe plus.',
  'inconnue': 'Erreur inattendue du serveur.',
};

// ---------- Liste ----------

function afficherListe() {
  const ul = $('liste-notes');
  ul.replaceChildren();
  for (const n of etat.notes) {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = '#/note/' + n.id;
    a.dataset.id = n.id;
    if (n.id === etat.courante) a.setAttribute('aria-current', 'true');

    const haut = document.createElement('span');
    haut.className = 'ln-haut';
    const nom = document.createElement('span');
    nom.className = 'ln-nom';
    nom.textContent = slug(n.title) + '.md';
    nom.title = n.title;
    const date = document.createElement('span');
    date.className = 'ln-date';
    date.textContent = dateCourte(n.updated_at);
    haut.append(nom, date);

    const ext = document.createElement('span');
    ext.className = 'ln-extrait';
    ext.textContent = extrait(n.content) || '(vide)';

    a.append(haut, ext);
    li.append(a);
    ul.append(li);
  }
  const vide = etat.notes.length === 0;
  $('liste-message').hidden = !vide;
  if (vide) $('liste-message').textContent = 'aucune note — « + nouvelle » pour poser la première pierre';
  $('compte-liste').textContent = etat.notes.length + (etat.notes.length > 1 ? ' notes' : ' note');
  $('compte-notes').textContent = etat.notes.length;
}

// ---------- Note ouverte ----------

function modeEffectif() {
  return etroit.matches && etat.mode === 'split' ? 'view' : etat.mode;
}

function appliquerMode() {
  const m = modeEffectif();
  $('note').dataset.mode = m;
  for (const b of document.querySelectorAll('.bascule button')) {
    b.setAttribute('aria-pressed', String(b.dataset.mode === m));
  }
}

function majEditeur() {
  const texte = $('note-contenu').value;
  $('editeur-fond').innerHTML = colorer(texte);
  if (modeEffectif() !== 'edit') majApercu();
  $('etat-mots').textContent = compterMots(texte) + ' mots';
}

let apercuDemande = false;
function majApercu() {
  if (apercuDemande) return;
  apercuDemande = true;
  requestAnimationFrame(() => {
    apercuDemande = false;
    const texte = $('note-contenu').value;
    const apercu = $('note-apercu');
    if (texte.trim()) {
      apercu.innerHTML = rendre(texte);       // rendre() passe toujours par DOMPurify
      apercu.classList.remove('apercu-vide');
    } else {
      apercu.textContent = '// note vide';
      apercu.classList.add('apercu-vide');
    }
  });
}

function afficherNote(note) {
  $('note-vide').hidden = Boolean(note);
  $('note').hidden = !note;
  $('note-message').textContent = '';
  if (!note) {
    $('etat-mots').textContent = '';
    return;
  }
  $('note-titre').value = note.title;
  $('note-contenu').value = note.content;
  appliquerMode();
  majEditeur();
  majApercu();
  etatSauvegarde('<span class="ok">●</span> enregistré');
}

// ---------- Sauvegarde ----------

function planifierSauvegarde() {
  etatSauvegarde('<span class="accent">○</span> modifié');
  clearTimeout(etat.minuteur);
  etat.minuteur = setTimeout(sauvegarder, DELAI_SAUVEGARDE);
}

/** Envoie les modifications en attente. Renvoie quand tout est enregistré (ou a échoué). */
async function sauvegarder() {
  clearTimeout(etat.minuteur);
  etat.minuteur = null;
  if (etat.sauvegarde) await etat.sauvegarde;     // une seule sauvegarde à la fois
  const id = etat.courante;
  const champs = etat.enAttente;
  if (!id || Object.keys(champs).length === 0) return;
  etat.enAttente = {};

  etat.sauvegarde = (async () => {
    etatSauvegarde('<span class="accent">…</span> enregistrement');
    const envoyer = (c) => modifierNote(id, c).catch(() => ({ erreur: 'reseau' }));
    let r = await envoyer(champs);
    let titreRefuse = false;

    if (r.erreur === 'titre-pris' && 'title' in champs) {
      titreRefuse = true;
      afficherErreur('titre-pris');
      $('note-titre').setAttribute('aria-invalid', 'true');
      const { title, ...reste } = champs;
      if (Object.keys(reste).length === 0) {
        etatSauvegarde('<span class="erreur">!</span> titre refusé');
        return;
      }
      r = await envoyer(reste);
    }

    if (r.erreur) {
      // Les champs repartent en attente pour un prochain essai (sauf un titre refusé).
      etat.enAttente = { ...champs, ...etat.enAttente };
      if (titreRefuse) delete etat.enAttente.title;
      afficherErreur(r.erreur);
      etatSauvegarde('<span class="erreur">!</span> non enregistré');
      if (r.erreur === 'reseau') etat.minuteur = setTimeout(sauvegarder, 5000);
      return;
    }

    const i = etat.notes.findIndex((n) => n.id === id);
    if (i >= 0) etat.notes[i] = r.note;
    trier();
    afficherListe();
    if (!titreRefuse) {
      $('note-titre').removeAttribute('aria-invalid');
      $('note-message').textContent = '';
    }
    if (Object.keys(etat.enAttente).length === 0) {
      etatSauvegarde(titreRefuse
        ? '<span class="erreur">!</span> titre refusé'
        : '<span class="ok">●</span> enregistré ' + fmtHeure.format(new Date(r.note.updated_at)));
    }
  })();

  try { await etat.sauvegarde; } finally { etat.sauvegarde = null; }
}

function afficherErreur(code) {
  $('note-message').textContent = MESSAGES[code] || MESSAGES.inconnue;
}

// ---------- Actions ----------

function titreLibre() {
  const pris = new Set(etat.notes.map((n) => n.title.toLowerCase()));
  if (!pris.has('sans titre')) return 'sans titre';
  let i = 2;
  while (pris.has('sans titre ' + i)) i++;
  return 'sans titre ' + i;
}

async function nouvelleNote() {
  await sauvegarder();
  const r = await creerNote({ title: titreLibre(), content: '' }).catch(() => ({ erreur: 'reseau' }));
  if (r.erreur) {
    alert(MESSAGES[r.erreur] || MESSAGES.inconnue);
    return;
  }
  etat.notes.unshift(r.note);
  if (etat.mode === 'view') { etat.mode = 'edit'; ecrireMode('edit'); }
  location.hash = '#/note/' + r.note.id;
  // La route ouvre la note ; on place ensuite le curseur dans le titre.
  requestAnimationFrame(() => { $('note-titre').focus(); $('note-titre').select(); });
}

async function demanderSuppression() {
  const note = noteCourante();
  if (!note) return;
  const dlg = $('dialogue-suppression');
  $('dialogue-nom').textContent = slug(note.title) + '.md';
  dlg.returnValue = '';
  dlg.showModal();
  await new Promise((ok) => dlg.addEventListener('close', ok, { once: true }));
  if (dlg.returnValue !== 'supprimer') return;

  clearTimeout(etat.minuteur);
  etat.enAttente = {};
  if (etat.sauvegarde) await etat.sauvegarde;
  const r = await supprimerNote(note.id).catch(() => ({ erreur: 'reseau' }));
  if (r.erreur) { afficherErreur(r.erreur); return; }
  etat.notes = etat.notes.filter((n) => n.id !== note.id);
  etat.courante = null;
  location.hash = '#/';
  router();
}

// ---------- Routage ----------

async function router() {
  const m = location.hash.match(/^#\/note\/([0-9a-f-]+)$/i);
  const id = m ? m[1] : null;

  if (id !== etat.courante) {
    await sauvegarder();
    etat.courante = id;
    const note = noteCourante();
    if (id && !note) {
      history.replaceState(null, '', '#/');
      etat.courante = null;
    }
    afficherNote(noteCourante());
  }
  $('ecran-appli').dataset.vue = etat.courante ? 'note' : 'liste';
  afficherListe();
}

// ---------- Branchement ----------

function brancher() {
  if (etat.branche) return;
  etat.branche = true;

  window.addEventListener('hashchange', router);
  $('bouton-nouvelle').addEventListener('click', nouvelleNote);
  $('bouton-supprimer').addEventListener('click', demanderSuppression);

  $('note-contenu').addEventListener('input', () => {
    etat.enAttente.content = $('note-contenu').value;
    majEditeur();
    planifierSauvegarde();
  });

  $('note-titre').addEventListener('input', () => {
    const t = $('note-titre').value.trim();
    $('note-titre').removeAttribute('aria-invalid');
    if (!t) {
      delete etat.enAttente.title;
      afficherErreur('titre-vide');
      return;
    }
    $('note-message').textContent = '';
    etat.enAttente.title = t;
    planifierSauvegarde();
  });
  $('note-titre').addEventListener('blur', () => {
    const note = noteCourante();
    if (note && !$('note-titre').value.trim()) {
      $('note-titre').value = note.title;      // titre vide : on remet l'ancien
      $('note-message').textContent = '';
    }
  });
  $('note-titre').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); $('note-contenu').focus(); }
  });

  for (const b of document.querySelectorAll('.bascule button')) {
    b.addEventListener('click', () => {
      etat.mode = b.dataset.mode;
      ecrireMode(etat.mode);
      appliquerMode();
      majApercu();
    });
  }
  etroit.addEventListener('change', appliquerMode);

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && !$('ecran-appli').hidden) {
      e.preventDefault();
      sauvegarder();
    }
  });
  // Ne rien perdre en quittant ou en changeant d'onglet.
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') sauvegarder(); });
  window.addEventListener('pagehide', () => { sauvegarder(); });
}

/** Appelée à chaque connexion. */
export async function demarrerAppli() {
  brancher();
  etat.courante = null;
  etat.enAttente = {};
  $('liste-message').hidden = false;
  $('liste-message').innerHTML = 'chargement<span class="curseur">_</span>';
  $('liste-notes').replaceChildren();
  afficherNote(null);

  const r = await listerNotes().catch(() => ({ erreur: 'reseau' }));
  if (r.erreur) {
    $('liste-message').textContent = MESSAGES[r.erreur] || MESSAGES.inconnue;
    return;
  }
  etat.notes = r.notes;
  trier();
  await router();
}

/** Envoie ce qui reste à enregistrer (avant une déconnexion). */
export const toutEnregistrer = () => sauvegarder();

/** Appelée à la déconnexion : on oublie tout ce qui est en mémoire. */
export function arreterAppli() {
  clearTimeout(etat.minuteur);
  etat.notes = [];
  etat.courante = null;
  etat.enAttente = {};
  $('liste-notes').replaceChildren();
  afficherNote(null);
}
