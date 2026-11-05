// Palette « lier une note » (direction A de la maquette) : fenêtre avec recherche,
// filtres partout / même dossier / récentes, et lien vers une nouvelle note.
import { plier, normaliserDossier } from './arbre.js';
import { creerSuggestions } from './suggestions.js';

const $ = (id) => document.getElementById(id);
const MAX = 50;

let source = null;          // { notes(), courante() }
let surChoixCourant = null;
let filtre = 'partout';
let sugg = null;

// ---------- Recherche ----------

/** Positions [début, fin[ des mots de `jetons` dans `texte`, accents et casse ignorés. */
function plages(texte, jetons) {
  let plie = '';
  const origine = [];
  for (let i = 0; i < texte.length; i++) {
    const f = plier(texte[i]);
    for (let k = 0; k < f.length; k++) { plie += f[k]; origine.push(i); }
  }
  const resultat = [];
  for (const j of jetons) {
    let depart = 0;
    for (;;) {
      const p = plie.indexOf(j, depart);
      if (p < 0 || !j) break;
      resultat.push([origine[p], origine[p + j.length - 1] + 1]);
      depart = p + j.length;
    }
  }
  return resultat.sort((a, b) => a[0] - b[0]);
}

/** Nœuds de texte avec les passages trouvés en <mark>. */
function surligner(texte, jetons) {
  const noeuds = [];
  let pos = 0;
  for (const [d, f] of plages(texte, jetons)) {
    if (d < pos) continue;
    if (d > pos) noeuds.push(document.createTextNode(texte.slice(pos, d)));
    const m = document.createElement('mark');
    m.textContent = texte.slice(d, f);
    noeuds.push(m);
    pos = f;
  }
  if (pos < texte.length) noeuds.push(document.createTextNode(texte.slice(pos)));
  return noeuds;
}

function extraitAutour(contenu, jeton) {
  const lignes = (contenu || '').split('\n');
  const ligne = lignes.find((l) => plier(l).includes(jeton)) || '';
  const p = plier(ligne).indexOf(jeton);
  const debut = Math.max(0, p - 30);
  return (debut > 0 ? '…' : '') + ligne.slice(debut, debut + 80).trim() + (ligne.length > debut + 80 ? '…' : '');
}

/**
 * Résultats pour une requête : d'abord les titres (et dossiers) qui contiennent tous les mots,
 * ceux qui commencent par le premier mot en tête ; puis les notes dont seul le contenu correspond.
 */
export function chercher(notes, requete, { filtre: f = 'partout', dossier = '', exclure = null } = {}) {
  const jetons = plier(requete).split(/\s+/).filter(Boolean);
  let candidates = notes.filter((n) => n.id !== exclure);
  if (f === 'dossier') candidates = candidates.filter((n) => normaliserDossier(n.folder) === dossier);
  const recent = (a, b) => (a.note.updated_at < b.note.updated_at ? 1 : -1);

  if (!jetons.length) {
    return candidates.map((note) => ({ note, type: 'titre' })).sort(recent);
  }
  const titres = [];
  const contenus = [];
  for (const note of candidates) {
    const t = plier(note.title);
    const td = t + ' ' + plier(note.folder);
    if (jetons.every((j) => td.includes(j))) {
      titres.push({ note, type: 'titre', debut: t.startsWith(jetons[0]) });
    } else if (jetons.every((j) => plier(note.content).includes(j))) {
      contenus.push({ note, type: 'contenu', extrait: extraitAutour(note.content, jetons[0]) });
    }
  }
  if (f === 'recentes') return [...titres, ...contenus].sort(recent);
  titres.sort((a, b) => (a.debut === b.debut ? recent(a, b) : a.debut ? -1 : 1));
  contenus.sort(recent);
  return [...titres, ...contenus];
}

// ---------- Affichage ----------

const fmtJour = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });

function rendu(o) {
  const jetons = plier($('palette-champ').value).split(/\s+/).filter(Boolean);
  if (o.nouvelle) {
    const s = document.createElement('span');
    s.className = 'pal-nouvelle';
    s.textContent = '+ lien vers une nouvelle note « ' + o.valeur + ' »';
    return [s];
  }
  const { note, type, extrait } = o.resultat;
  const haut = document.createElement('span');
  haut.className = 'pal-haut';
  const titre = document.createElement('span');
  titre.className = 'pal-titre';
  titre.append(...surligner(note.title, jetons));
  const date = document.createElement('span');
  date.className = 'pal-date';
  date.textContent = fmtJour.format(new Date(note.updated_at));
  haut.append(titre, date);
  const bas = document.createElement('span');
  bas.className = 'pal-bas';
  const dossier = normaliserDossier(note.folder);
  if (type === 'contenu') {
    bas.append(document.createTextNode((dossier ? dossier + '/ · ' : '') + 'contenu : '), ...surligner(extrait, jetons));
  } else {
    bas.textContent = (dossier ? dossier + '/' : '~/') + (note.tags?.length ? ' · #' + note.tags.join(' #') : '');
  }
  return [haut, bas];
}

function actualiser() {
  const q = $('palette-champ').value;
  const courante = source.courante();
  const tous = source.notes();
  const resultats = chercher(tous, q, {
    filtre,
    dossier: courante ? normaliserDossier(courante.folder) : '',
    exclure: courante ? courante.id : null,
  });
  const options = resultats.slice(0, MAX).map((r) => ({ valeur: r.note.title, resultat: r }));
  const propre = q.trim();
  if (propre && !tous.some((n) => n.title.toLowerCase() === propre.toLowerCase())) {
    options.push({ valeur: propre, nouvelle: true });
  }
  sugg.afficher(options);
  $('palette-vide').hidden = options.length > 0;
  const total = tous.length - (courante ? 1 : 0);
  $('palette-compte').textContent = resultats.length + ' sur ' + total + ' note' + (total > 1 ? 's' : '')
    + (resultats.length > MAX ? ' (50 premières)' : '');
  for (const b of document.querySelectorAll('#palette-filtres button')) {
    b.setAttribute('aria-pressed', String(b.dataset.filtre === filtre));
  }
}

// ---------- Ouverture ----------

export function brancherPalette(options) {
  source = options;
  const champ = $('palette-champ');
  sugg = creerSuggestions($('palette-resultats'), champ, (o) => {
    const choix = surChoixCourant;
    surChoixCourant = null;
    $('palette-liens').close('ok');
    if (choix) choix(o.valeur);
  }, rendu);

  champ.addEventListener('input', actualiser);
  champ.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); sugg.deplacer(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sugg.deplacer(-1); }
    else if (e.key === 'Enter') { e.preventDefault(); sugg.choisirActive(); }
  });
  for (const b of document.querySelectorAll('#palette-filtres button')) {
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', () => { filtre = b.dataset.filtre; actualiser(); champ.focus(); });
  }
  // Clic sur le fond : fermer.
  $('palette-liens').addEventListener('click', (e) => { if (e.target === $('palette-liens')) $('palette-liens').close(); });
}

/**
 * Ouvre la palette. surChoix(titre) est appelé si une note est choisie ;
 * surFermeture() dans tous les cas, après la fermeture.
 */
export function ouvrirPalette({ requete = '', surChoix, surFermeture }) {
  const dlg = $('palette-liens');
  surChoixCourant = surChoix;
  $('palette-champ').value = requete;
  dlg.returnValue = '';
  dlg.showModal();
  actualiser();
  $('palette-champ').focus();
  dlg.addEventListener('close', () => {
    sugg.cacher();
    if (surFermeture) surFermeture(dlg.returnValue === 'ok');
  }, { once: true });
}
