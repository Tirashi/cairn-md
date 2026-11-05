// Fenêtre d'import (direction A de la maquette) : récapitulatif, choix pour chaque conflit,
// « voir le détail » (comparaison des deux versions, direction C), puis application.
import { lireFichiers, analyser, appliquer, compterEcritures, comparer, exporterZip, telecharger, slug } from './export.js';
import { normaliserDossier } from './arbre.js';

const $ = (id) => document.getElementById(id);
const fmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const date = (iso) => (iso ? fmt.format(new Date(iso)) : 'date inconnue');
const pluriel = (n, mot) => n + ' ' + mot + (n > 1 ? 's' : '');

let etat = null;   // { elements, choix: Map, ignores, nom, notes, surFin }

function el(tag, classe, texte) {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (texte !== undefined) e.textContent = texte;
  return e;
}

function cheminAffiche(f) {
  return (f.folder ? f.folder + '/' : '') + slug(f.title) + '.md';
}

function vue(nom) {
  for (const v of ['resume', 'detail', 'travail']) $('import-' + v).hidden = v !== nom;
}

// ---------- Récapitulatif ----------

const CHOIX = [['cairn', 'garder Cairn'], ['fichier', 'prendre le fichier'], ['deux', 'les deux']];

function afficherResume() {
  const { elements, choix, ignores, nom } = etat;
  const compte = (t) => elements.filter((e) => e.type === t).length;
  $('import-nom').textContent = nom;
  $('import-lus').textContent = pluriel(elements.length, 'fichier') + ' .md lu' + (elements.length > 1 ? 's' : '') + ' · rien n\'est encore modifié.';
  $('import-n-nouvelles').textContent = compte('nouvelle');
  $('import-n-modifiees').textContent = compte('modifiee');
  $('import-n-conflits').textContent = compte('conflit');
  const autres = [];
  if (compte('identique')) autres.push(pluriel(compte('identique'), 'identique') + ', ignorée' + (compte('identique') > 1 ? 's' : ''));
  if (ignores.length) autres.push(pluriel(ignores.length, 'fichier') + ' non Markdown ignoré' + (ignores.length > 1 ? 's' : ''));
  $('import-autres').textContent = autres.join(' · ');
  $('import-autres').hidden = !autres.length;

  // Conflits.
  const ul = $('import-conflits');
  ul.replaceChildren();
  elements.forEach((e, i) => {
    if (e.type !== 'conflit') return;
    const li = el('li', 'conflit');
    li.append(el('span', 'conflit-nom', cheminAffiche(e.existante)));
    li.append(el('span', 'muet conflit-dates', 'Cairn : ' + date(e.existante.updated_at) + ' · fichier : ' + date(e.fichier.updated_at)));
    const groupe = el('div', 'choix-conflit');
    groupe.setAttribute('role', 'group');
    groupe.setAttribute('aria-label', 'Que garder pour ' + e.existante.title);
    for (const [valeur, libelle] of CHOIX) {
      const b = el('button', '', libelle);
      b.type = 'button';
      b.setAttribute('aria-pressed', String((choix.get(i) || 'cairn') === valeur));
      b.addEventListener('click', () => { choix.set(i, valeur); afficherResume(); });
      groupe.append(b);
    }
    const detail = el('button', 'bouton-lien', 'voir le détail');
    detail.type = 'button';
    detail.addEventListener('click', () => afficherDetail(i));
    li.append(groupe, detail);
    ul.append(li);
  });
  $('import-zone-conflits').hidden = !compte('conflit');

  // Liste des notes écrites (repliée).
  const liste = $('import-liste');
  liste.replaceChildren();
  for (const e of elements) {
    if (e.type !== 'nouvelle' && e.type !== 'modifiee') continue;
    const li = el('li');
    li.append(el('span', e.type === 'nouvelle' ? 'ok' : 'accent', e.type === 'nouvelle' ? '+ ' : '~ '), document.createTextNode(cheminAffiche(e.fichier)));
    liste.append(li);
  }
  $('import-details').hidden = !liste.children.length;
  $('import-details-titre').textContent = 'voir les ' + pluriel(liste.children.length, 'note');

  const n = compterEcritures(elements, choix);
  $('import-ok').textContent = n ? 'importer ' + pluriel(n, 'note') : 'rien à importer';
  $('import-ok').disabled = n === 0;
  vue('resume');
}

// ---------- Détail d'un conflit ----------

function bloc(titre, quand, lignes, classe) {
  const cadre = el('div', 'version');
  const tete = el('div', 'version-tete');
  tete.append(el('span', '', titre), el('span', '', quand));
  const pre = el('pre', 'version-texte');
  for (const { texte, propre } of lignes) {
    const ligne = el('span', propre ? 'ligne-propre ' + classe : '', (propre ? (classe === 'cote-cairn' ? '+ ' : '~ ') : '  ') + texte);
    pre.append(ligne, document.createTextNode('\n'));
  }
  cadre.append(tete, pre);
  return cadre;
}

function metaEnTexte(n) {
  return ['titre : ' + n.title, 'dossier : ' + (normaliserDossier(n.folder) || '~/'), 'tags : ' + ((n.tags || []).map((t) => '#' + t).join(' ') || '—')].join('\n');
}

function afficherDetail(i) {
  const e = etat.elements[i];
  const conflits = etat.elements.map((x, k) => (x.type === 'conflit' ? k : -1)).filter((k) => k >= 0);
  $('import-detail-titre').textContent = 'conflit ' + (conflits.indexOf(i) + 1) + '/' + conflits.length;
  $('import-detail-nom').textContent = cheminAffiche(e.existante);
  const meta = comparer(metaEnTexte(e.existante), metaEnTexte(e.fichier));
  const texte = comparer(e.existante.content || '', e.fichier.content || '');
  const zone = $('import-versions');
  zone.replaceChildren(
    bloc('dans Cairn', date(e.existante.updated_at), [...meta.a, { texte: '', propre: false }, ...texte.a], 'cote-cairn'),
    bloc('dans le fichier', date(e.fichier.updated_at), [...meta.b, { texte: '', propre: false }, ...texte.b], 'cote-fichier'),
  );
  const boutons = $('import-detail-choix');
  boutons.replaceChildren();
  for (const [valeur, libelle] of [['cairn', 'garder la version de Cairn'], ['fichier', 'prendre le fichier'], ['deux', 'garder les deux (copie « … (import) »)']]) {
    const b = el('button', (etat.choix.get(i) || 'cairn') === valeur ? 'bouton-principal' : 'bouton-discret', libelle);
    b.type = 'button';
    b.addEventListener('click', () => { etat.choix.set(i, valeur); afficherResume(); });
    boutons.append(b);
  }
  vue('detail');
  $('import-retour').focus();
}

// ---------- Application ----------

async function importer() {
  const { elements, choix, notes, surFin } = etat;
  vue('travail');
  $('import-progression').textContent = 'préparation…';
  $('import-fermer').hidden = true;
  try {
    if ($('import-sauvegarde').checked) {
      $('import-progression').textContent = 'sauvegarde .zip…';
      telecharger(await exporterZip(notes));
    }
  } catch {
    $('import-progression').textContent = 'La sauvegarde a échoué : import annulé, rien n\'a été modifié.';
    $('import-fermer').hidden = false;
    return;
  }
  const r = await appliquer(elements, choix, notes, (fait, total) => {
    $('import-progression').textContent = 'import… ' + fait + '/' + total;
  });
  const lignes = ['✓ ' + pluriel(r.crees, 'note') + ' créée' + (r.crees > 1 ? 's' : '') + ', ' + pluriel(r.modifies, 'note') + ' mise' + (r.modifies > 1 ? 's' : '') + ' à jour.'];
  if (r.echecs.length) {
    lignes.push('! ' + pluriel(r.echecs.length, 'échec') + ' :');
    for (const e of r.echecs.slice(0, 8)) lignes.push('  ' + e.chemin + (e.erreur === 'titre-pris' ? ' (titre déjà pris)' : e.erreur === 'reseau' ? ' (réseau)' : ''));
  }
  $('import-progression').textContent = lignes.join('\n');
  $('import-fermer').hidden = false;
  $('import-fermer').focus();
  await surFin(r);
}

// ---------- Points d'entrée ----------

export function brancherImport() {
  $('import-ok').addEventListener('click', importer);
  $('import-retour').addEventListener('click', afficherResume);
  $('import-annuler').addEventListener('click', () => $('dialogue-import').close());
  $('import-fermer').addEventListener('click', () => $('dialogue-import').close());
  // Échap pendant l'import : on ne ferme pas au milieu.
  $('dialogue-import').addEventListener('cancel', (e) => { if (!$('import-travail').hidden && $('import-fermer').hidden) e.preventDefault(); });
}

/**
 * Lit les fichiers choisis et ouvre le récapitulatif.
 * notes : notes actuelles ; surFin(resultat) : rechargée après l'import.
 */
export async function lancerImport(listeFichiers, { notes, surFin }) {
  const fichiers = [...listeFichiers];
  if (!fichiers.length) return;
  const dlg = $('dialogue-import');
  vue('travail');
  $('import-progression').textContent = 'lecture des fichiers…';
  $('import-fermer').hidden = true;
  if (!dlg.open) dlg.showModal();
  let lu;
  try {
    lu = await lireFichiers(fichiers);
  } catch {
    $('import-progression').textContent = 'Impossible de lire ces fichiers (zip abîmé, ou bibliothèque injoignable).';
    $('import-fermer').hidden = false;
    return;
  }
  const nom = fichiers.length === 1 ? fichiers[0].name
    : fichiers[0].webkitRelativePath ? fichiers[0].webkitRelativePath.split('/')[0] + '/'
      : pluriel(fichiers.length, 'fichier');
  if (!lu.fichiers.length) {
    $('import-progression').textContent = 'Aucun fichier .md trouvé dans « ' + nom + ' ».';
    $('import-fermer').hidden = false;
    return;
  }
  etat = { elements: analyser(lu.fichiers, notes), choix: new Map(), ignores: lu.ignores, nom, notes, surFin };
  $('import-sauvegarde').checked = true;
  afficherResume();
}

/** Exporte toutes les notes et propose le zip. Renvoie le nombre de notes. */
export async function lancerExport(notes) {
  telecharger(await exporterZip(notes));
  return notes.length;
}
