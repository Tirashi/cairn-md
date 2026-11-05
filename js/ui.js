// Interface de l'appli : liste, filtres, éditeur, aperçu, liens, sauvegarde automatique.
// Routage par hash : #/ (liste) et #/note/<id>.
import { listerNotes, creerNote, modifierNote, supprimerNote } from './notes.js';
import { rendre, colorer, extrait, compterMots, definirResolveur } from './markdown.js';
import { normaliserDossier, dossierExistant, dansDossier, listerDossiers, compterTags, filtrer } from './arbre.js';
import { cite, remplacerLien, liensEntrants } from './liens.js';
import { afficherNavigation } from './navigation.js';
import { brancherMeta, afficherMeta, majNomFichier } from './meta.js';
import { brancherPalette, ouvrirPalette } from './palette.js';
import { enrichir, brancherCopie } from './rendu-avance.js';
import { demander } from './dialogue.js';

const DELAI_SAUVEGARDE = 1000;
const CLE_MODE = 'cairn-mode';
const etroit = window.matchMedia('(max-width: 760px)');

const $ = (id) => document.getElementById(id);

const etat = {
  notes: [],          // toutes les notes, triées par updated_at décroissant
  courante: null,     // id de la note ouverte
  titreOuverture: '', // titre de la note à son ouverture (pour proposer de mettre à jour les liens)
  filtre: { dossier: '', tag: null, recherche: '' },
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

const noteCourante = () => etat.notes.find((n) => n.id === etat.courante) || null;
const parTitre = (titre) => etat.notes.find((n) => n.title.toLowerCase() === titre.trim().toLowerCase()) || null;
const pluriel = (n, mot) => n + ' ' + mot + (n > 1 ? 's' : '');

function remplacerNote(note) {
  const i = etat.notes.findIndex((n) => n.id === note.id);
  if (i >= 0) etat.notes[i] = note; else etat.notes.unshift(note);
  trier();
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

function afficherErreur(code) {
  $('note-message').textContent = MESSAGES[code] || MESSAGES.inconnue;
}

// ---------- Liste et navigation ----------

function afficherListe() {
  const visibles = filtrer(etat.notes, etat.filtre);
  const ul = $('liste-notes');
  ul.replaceChildren();
  for (const n of visibles) {
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

    // Dossier (s'il diffère du dossier affiché) et tags.
    const dossier = normaliserDossier(n.folder);
    const infos = [];
    if (dossier && dossier !== etat.filtre.dossier) infos.push(dossier + '/');
    for (const t of n.tags || []) infos.push('#' + t);
    if (infos.length) {
      const meta = document.createElement('span');
      meta.className = 'ln-meta';
      meta.textContent = infos.join(' ');
      a.append(meta);
    }
    li.append(a);
    ul.append(li);
  }

  const message = $('liste-message');
  if (etat.notes.length === 0) {
    message.hidden = false;
    message.textContent = 'aucune note — « + nouvelle » pour poser la première pierre';
  } else if (visibles.length === 0) {
    message.hidden = false;
    message.textContent = 'aucune note ne correspond';
  } else {
    message.hidden = true;
  }
  $('compte-liste').textContent = pluriel(visibles.length, 'note');
}

function rafraichir() {
  afficherNavigation({ notes: etat.notes, filtre: etat.filtre, surFiltre: changerFiltre, surRenommer: renommerDossier });
  afficherListe();
}

function changerFiltre(changement) {
  Object.assign(etat.filtre, changement);
  rafraichir();
  // Sur téléphone, choisir un dossier ou un tag ramène à la liste.
  if (etroit.matches && etat.courante && ('dossier' in changement || 'tag' in changement)) location.hash = '#/';
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
  $('etat-mots').textContent = pluriel(compterMots(texte), 'mot');
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
      enrichir(apercu);                       // code coloré et diagrammes mermaid
    } else {
      apercu.textContent = '// note vide';
      apercu.classList.add('apercu-vide');
    }
  });
}

function afficherLiensEntrants() {
  const note = noteCourante();
  const entrants = liensEntrants(etat.notes, note);
  const ul = $('liens-entrants-liste');
  ul.replaceChildren();
  for (const { note: n, contexte } of entrants) {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = '#/note/' + n.id;
    const nom = document.createElement('span');
    nom.textContent = slug(n.title) + '.md';
    const ctx = document.createElement('span');
    ctx.className = 'muet';
    ctx.textContent = ' « ' + (contexte.length > 90 ? contexte.slice(0, 89) + '…' : contexte) + ' »';
    a.append(nom, ctx);
    li.append(a);
    ul.append(li);
  }
  $('liens-entrants').hidden = entrants.length === 0;
  $('liens-entrants-titre').textContent = '← LIENS ENTRANTS (' + entrants.length + ')';
  $('etat-liens').textContent = !note ? ''
    : entrants.length ? '← ' + pluriel(entrants.length, 'lien') + ' entrant' + (entrants.length > 1 ? 's' : '')
      : '← aucun lien entrant';
}

function afficherNote(note) {
  $('note-vide').hidden = Boolean(note);
  $('note').hidden = !note;
  $('note-message').textContent = '';
  $('note-renommage').hidden = true;
  if (!note) {
    $('etat-mots').textContent = '';
    $('etat-liens').textContent = '';
    return;
  }
  etat.titreOuverture = note.title;
  $('note-titre').value = note.title;
  $('note-titre').removeAttribute('aria-invalid');
  $('note-contenu').value = note.content;
  afficherMeta(note, slug(note.title) + '.md');
  appliquerMode();
  majEditeur();
  majApercu();
  afficherLiensEntrants();
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

    remplacerNote(r.note);
    rafraichir();
    if (!titreRefuse) {
      $('note-titre').removeAttribute('aria-invalid');
      $('note-message').textContent = '';
    }
    if (etat.courante === id) {
      if ('title' in champs && !titreRefuse) {
        majNomFichier(slug(r.note.title) + '.md');
        proposerRenommageLiens();
        afficherLiensEntrants();
      }
      if ('content' in champs) majApercu();        // les liens [[…]] peuvent avoir changé de cible
    }
    if (Object.keys(etat.enAttente).length === 0) {
      etatSauvegarde(titreRefuse
        ? '<span class="erreur">!</span> titre refusé'
        : '<span class="ok">●</span> enregistré ' + fmtHeure.format(new Date(r.note.updated_at)));
    }
  })();

  try { await etat.sauvegarde; } finally { etat.sauvegarde = null; }
}

// ---------- Renommages ----------

/** Après un changement de titre : proposer de mettre à jour les [[ancien titre]] des autres notes. */
function proposerRenommageLiens() {
  const note = noteCourante();
  const ancien = etat.titreOuverture;
  if (!note || !ancien || ancien.toLowerCase() === note.title.toLowerCase()) {
    $('note-renommage').hidden = true;
    return;
  }
  const citantes = etat.notes.filter((n) => n.id !== note.id && cite(n.content, ancien));
  if (!citantes.length) {
    etat.titreOuverture = note.title;
    $('note-renommage').hidden = true;
    return;
  }
  $('renommage-texte').textContent = pluriel(citantes.length, 'note') + ' cite' + (citantes.length > 1 ? 'nt' : '')
    + ' [[' + ancien + ']]. Mettre à jour vers [[' + note.title + ']] ?';
  $('note-renommage').hidden = false;
}

async function mettreAJourLiens() {
  const note = noteCourante();
  if (!note) return;
  const ancien = etat.titreOuverture;
  const nouveau = note.title;
  $('note-renommage').hidden = true;
  const citantes = etat.notes.filter((n) => n.id !== note.id && cite(n.content, ancien));
  let echecs = 0;
  for (const n of citantes) {
    const r = await modifierNote(n.id, { content: remplacerLien(n.content, ancien, nouveau) }).catch(() => ({ erreur: 'reseau' }));
    if (r.erreur) echecs++; else remplacerNote(r.note);
  }
  etat.titreOuverture = nouveau;
  rafraichir();
  afficherLiensEntrants();
  $('note-message').textContent = echecs
    ? pluriel(echecs, 'note') + ' n\'ont pas pu être mises à jour.'
    : '';
  etatSauvegarde('<span class="ok">●</span> ' + pluriel(citantes.length - echecs, 'lien') + ' mis à jour');
}

async function renommerDossier(ancien) {
  const saisi = await demander({
    commande: '$ mv', nom: ancien + '/',
    texte: 'Nouveau chemin du dossier. Ses sous-dossiers suivent.',
    champ: 'nouveau chemin', valeur: ancien, ok: 'renommer',
  });
  if (saisi === null) return;
  const nouveau = dossierExistant(saisi, etat.notes);
  if (!nouveau || nouveau === ancien) return;

  await sauvegarder();
  const concernees = etat.notes.filter((n) => dansDossier(normaliserDossier(n.folder), ancien));
  let echecs = 0;
  etatSauvegarde('<span class="accent">…</span> déplacement');
  for (const n of concernees) {
    const dossier = nouveau + normaliserDossier(n.folder).slice(ancien.length);
    const r = await modifierNote(n.id, { folder: dossier }).catch(() => ({ erreur: 'reseau' }));
    if (r.erreur) echecs++; else remplacerNote(r.note);
  }
  etat.filtre.dossier = nouveau;
  rafraichir();
  const note = noteCourante();
  if (note) afficherMeta(note, slug(note.title) + '.md');
  etatSauvegarde(echecs
    ? '<span class="erreur">!</span> ' + pluriel(echecs, 'note') + ' non déplacée' + (echecs > 1 ? 's' : '')
    : '<span class="ok">●</span> ' + pluriel(concernees.length, 'note') + ' déplacée' + (concernees.length > 1 ? 's' : ''));
}

// ---------- Actions ----------

function titreLibre() {
  const pris = new Set(etat.notes.map((n) => n.title.toLowerCase()));
  if (!pris.has('sans titre')) return 'sans titre';
  let i = 2;
  while (pris.has('sans titre ' + i)) i++;
  return 'sans titre ' + i;
}

async function ouvrirNouvelle(champs, { focusTitre }) {
  await sauvegarder();
  const r = await creerNote({ content: '', ...champs }).catch(() => ({ erreur: 'reseau' }));
  if (r.erreur) {
    alert(MESSAGES[r.erreur] || MESSAGES.inconnue);
    return;
  }
  remplacerNote(r.note);
  if (etat.mode === 'view') { etat.mode = 'edit'; ecrireMode('edit'); }
  location.hash = '#/note/' + r.note.id;
  requestAnimationFrame(() => {
    const champ = focusTitre ? $('note-titre') : $('note-contenu');
    champ.focus();
    if (focusTitre) champ.select();
  });
}

function nouvelleNote() {
  // La note naît dans le dossier et avec le tag affichés.
  return ouvrirNouvelle({
    title: titreLibre(),
    folder: etat.filtre.dossier,
    tags: etat.filtre.tag ? [etat.filtre.tag] : [],
  }, { focusTitre: true });
}

async function creerDepuisLien(titre) {
  const existante = parTitre(titre);
  if (existante) { location.hash = '#/note/' + existante.id; return; }
  const ok = await demander({
    commande: '$ touch', nom: slug(titre) + '.md',
    texte: '« ' + titre + ' » n\'existe pas encore. Créer la note ?', ok: 'créer',
  });
  if (!ok) return;
  const courante = noteCourante();
  await ouvrirNouvelle({ title: titre, folder: courante ? courante.folder : etat.filtre.dossier }, { focusTitre: false });
}

async function demanderSuppression() {
  const note = noteCourante();
  if (!note) return;
  const ok = await demander({
    commande: '$ rm', nom: slug(note.title) + '.md',
    texte: 'Supprimer définitivement cette note ? Penser à exporter avant en cas de doute.',
    ok: 'supprimer', danger: true,
  });
  if (!ok) return;

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

// ---------- Palette « lier une note » ----------

/**
 * Ouvre la palette ; le lien choisi remplace le texte entre `debut` et `fin`.
 * Sans choix, rien ne change et le curseur revient où il était.
 */
function lierNote(debut, fin, requete = '') {
  const zone = $('note-contenu');
  let insere = false;
  ouvrirPalette({
    requete,
    surChoix: (titre) => {
      // Si des ]] suivent déjà (fermeture automatique), on les remplace aussi.
      const fermeDeja = zone.value.slice(fin, fin + 2) === ']]';
      zone.focus();
      zone.setRangeText('[[' + titre + ']]', debut, fermeDeja ? fin + 2 : fin, 'end');
      insere = true;
      zone.dispatchEvent(new Event('input'));
    },
    surFermeture: () => {
      zone.focus();
      if (!insere) zone.selectionStart = zone.selectionEnd = fin;
    },
  });
}

/** Bouton [[ ]] ou Ctrl+Maj+L : la sélection éventuelle sert de recherche et est remplacée. */
function lierSelection() {
  if (!etat.courante) return;
  if (modeEffectif() === 'view') { etat.mode = etroit.matches ? 'edit' : 'split'; ecrireMode(etat.mode); appliquerMode(); }
  const zone = $('note-contenu');
  const { selectionStart: d, selectionEnd: f } = zone;
  const choisi = zone.value.slice(d, f);
  lierNote(d, f, choisi.includes('\n') ? '' : choisi.trim());
}

// ---------- Routage ----------

async function router() {
  const m = location.hash.match(/^#\/note\/([0-9a-f-]+)$/i);
  const id = m ? m[1] : null;

  if (id !== etat.courante) {
    await sauvegarder();
    etat.courante = id;
    if (id && !noteCourante()) {
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

  definirResolveur((titre) => parTitre(titre)?.id || null);

  window.addEventListener('hashchange', router);
  $('bouton-nouvelle').addEventListener('click', nouvelleNote);
  $('bouton-supprimer').addEventListener('click', demanderSuppression);
  $('renommage-oui').addEventListener('click', mettreAJourLiens);
  $('renommage-non').addEventListener('click', () => {
    etat.titreOuverture = noteCourante()?.title || '';
    $('note-renommage').hidden = true;
  });
  $('bouton-effacer-filtres').addEventListener('click', () => {
    $('recherche').value = '';
    changerFiltre({ dossier: '', tag: null, recherche: '' });
  });

  // Recherche dans les titres et le contenu.
  const recherche = $('recherche');
  recherche.addEventListener('input', () => {
    etat.filtre.recherche = recherche.value;
    rafraichir();
    if (etroit.matches && etat.courante) location.hash = '#/';
  });
  recherche.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { recherche.value = ''; etat.filtre.recherche = ''; rafraichir(); recherche.blur(); }
    if (e.key === 'Enter') {
      const premier = document.querySelector('#liste-notes a');
      if (premier) { e.preventDefault(); location.hash = premier.getAttribute('href'); }
    }
  });

  // Dossier et tags de la note.
  brancherMeta({
    dossiers: () => listerDossiers(etat.notes),
    tags: () => compterTags(etat.notes).map((t) => t.tag),
    resoudreDossier: (chemin) => dossierExistant(chemin, etat.notes),
    surDossier: (folder) => { etat.enAttente.folder = folder; sauvegarder(); },
    surTags: (tags) => { etat.enAttente.tags = tags; sauvegarder(); },
  });

  // Contenu. Taper [[ ouvre la palette « lier une note ».
  const zone = $('note-contenu');
  brancherPalette({ notes: () => etat.notes, courante: noteCourante });
  zone.addEventListener('input', (e) => {
    etat.enAttente.content = zone.value;
    majEditeur();
    planifierSauvegarde();
    const c = zone.selectionStart;
    const frappe = /^insert(Text|CompositionText|ReplacementText)$/.test(e.inputType || '');
    if (frappe && zone.selectionEnd === c
        && zone.value.slice(c - 2, c) === '[[' && zone.value[c - 3] !== '[') {
      lierNote(c - 2, c);
    }
  });
  $('bouton-lier').addEventListener('click', lierSelection);

  // Titre.
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

  // Liens [[…]] de l'aperçu vers une note qui n'existe pas encore.
  brancherCopie($('note-apercu'));
  // Changer de thème redessine les diagrammes aux bonnes couleurs.
  document.addEventListener('cairn-theme', () => { if (etat.courante) majApercu(); });
  $('note-apercu').addEventListener('click', (e) => {
    const a = e.target.closest('a.lien-absent');
    if (!a) return;
    e.preventDefault();
    creerDepuisLien(a.dataset.titre || a.textContent);
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
    if ($('ecran-appli').hidden || !(e.ctrlKey || e.metaKey)) return;
    const k = e.key.toLowerCase();
    if (k === 's') { e.preventDefault(); sauvegarder(); }
    if (k === 'l' && e.shiftKey) { e.preventDefault(); lierSelection(); }
    if (k === 'k') { e.preventDefault(); if (etroit.matches && etat.courante) location.hash = '#/'; recherche.focus(); recherche.select(); }
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
  etat.filtre = { dossier: '', tag: null, recherche: '' };
  $('recherche').value = '';
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
  rafraichir();
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
  for (const id of ['arbre', 'nuage-tags', 'ariane', 'sous-dossiers', 'tags-mobile']) $(id).replaceChildren();
}
