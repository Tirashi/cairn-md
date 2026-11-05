// Export et import des notes en Markdown (zip, fichiers .md ou dossier).
// Format d'un fichier : en-tête YAML (id, title, folder, tags, created_at, updated_at) puis le contenu.
import { creerNote, modifierNote } from './notes.js';
import { normaliserDossier, normaliserTag } from './arbre.js';

const URL_JSZIP = 'https://cdn.jsdelivr.net/npm/jszip@3.10.2/+esm';
let promesseJSZip = null;
const chargerJSZip = () => (promesseJSZip ??= import(URL_JSZIP).then((m) => m.default));

// ---------- Nom des fichiers ----------

export function slug(titre) {
  const s = (titre || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s || 'sans-titre';
}

function dateDuJour(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// ---------- En-tête (frontmatter) ----------

/** Texte YAML d'une note : les chaînes sont écrites en JSON (sous-ensemble valide de YAML). */
export function versMarkdown(note) {
  return [
    '---',
    'id: ' + note.id,
    'title: ' + JSON.stringify(note.title),
    'folder: ' + JSON.stringify(normaliserDossier(note.folder)),
    'tags: ' + JSON.stringify(note.tags || []),
    'created_at: ' + note.created_at,
    'updated_at: ' + note.updated_at,
    '---',
    note.content || '',
  ].join('\n');
}

function valeurSimple(brut) {
  const v = brut.trim();
  if (v.startsWith('"')) { try { return JSON.parse(v); } catch { return v.slice(1, -1); } }
  if (v.startsWith("'") && v.endsWith("'") && v.length > 1) return v.slice(1, -1).replace(/''/g, "'");
  return v;
}

function liste(brut) {
  const v = brut.trim();
  if (v.startsWith('[')) {
    try { const l = JSON.parse(v); if (Array.isArray(l)) return l.map(String); } catch { /* écrit à la main */ }
    return v.slice(1, v.lastIndexOf(']') > 0 ? v.lastIndexOf(']') : undefined)
      .split(',').map(valeurSimple).filter(Boolean);
  }
  return v ? v.split(',').map(valeurSimple).filter(Boolean) : [];
}

/**
 * Sépare l'en-tête du contenu. Comprend aussi un en-tête écrit à la main ou par un autre outil :
 * valeurs entre guillemets ou non, listes [a, b] ou en lignes « - a ».
 * Renvoie { meta, contenu } ; meta est vide s'il n'y a pas d'en-tête.
 */
export function lireMarkdown(texte) {
  const t = texte.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const m = t.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
  if (!m) return { meta: {}, contenu: t };
  const meta = {};
  let cleListe = null;
  for (const ligne of m[1].split('\n')) {
    const element = ligne.match(/^\s*-\s+(.*)$/);
    if (element && cleListe) { meta[cleListe].push(valeurSimple(element[1])); continue; }
    const kv = ligne.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
    if (!kv) continue;
    const [, cle, valeur] = kv;
    cleListe = null;
    if (cle === 'tags') {
      if (valeur.trim() === '') { meta.tags = []; cleListe = 'tags'; } else meta.tags = liste(valeur);
    } else {
      meta[cle] = valeurSimple(valeur);
    }
  }
  return { meta, contenu: t.slice(m[0].length) };
}

// ---------- Export ----------

/** Fabrique le zip : un .md par note, rangé dans les dossiers. Renvoie { blob, nom }. */
export async function exporterZip(notes) {
  const JSZip = await chargerJSZip();
  const zip = new JSZip();
  const pris = new Set();
  for (const n of notes) {
    const dossier = normaliserDossier(n.folder);
    const base = (dossier ? dossier + '/' : '') + slug(n.title);
    let chemin = base + '.md';
    for (let i = 2; pris.has(chemin.toLowerCase()); i++) chemin = base + '-' + i + '.md';
    pris.add(chemin.toLowerCase());
    zip.file(chemin, versMarkdown(n), { date: new Date(n.updated_at) });
  }
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  return { blob, nom: 'cairn-' + dateDuJour() + '.zip' };
}

/** Propose le fichier au téléchargement. */
export function telecharger({ blob, nom }) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nom;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// ---------- Lecture des fichiers à importer ----------

const ignore = (chemin) => chemin.split('/').some((p) => p.startsWith('.') || p === '__MACOSX');

/**
 * Lit un .zip, des .md, ou les fichiers d'un dossier (webkitRelativePath).
 * Renvoie { fichiers: [{ chemin, texte }], ignores: [chemin] }.
 */
export async function lireFichiers(listeFichiers) {
  const fichiers = [];
  const ignores = [];
  for (const f of listeFichiers) {
    const nom = f.webkitRelativePath || f.name;
    if (/\.zip$/i.test(f.name)) {
      const JSZip = await chargerJSZip();
      let zip;
      try { zip = await JSZip.loadAsync(f); } catch { ignores.push(nom); continue; }
      for (const entree of Object.values(zip.files)) {
        if (entree.dir || ignore(entree.name)) continue;
        if (!/\.(md|markdown)$/i.test(entree.name)) { ignores.push(entree.name); continue; }
        fichiers.push({ chemin: entree.name, texte: await entree.async('string') });
      }
    } else if (/\.(md|markdown)$/i.test(f.name) && !ignore(nom)) {
      // Dossier choisi : le premier niveau est le nom du dossier lui-même, on l'enlève.
      const chemin = f.webkitRelativePath ? nom.split('/').slice(1).join('/') : nom;
      fichiers.push({ chemin, texte: await f.text() });
    } else if (!ignore(nom)) {
      ignores.push(nom);
    }
  }
  return { fichiers, ignores };
}

// ---------- Analyse : nouvelles, modifiées, conflits, identiques ----------

/** Note telle que décrite par un fichier : le frontmatter fait foi, sinon le chemin. */
export function noteDuFichier({ chemin, texte }) {
  const { meta, contenu } = lireMarkdown(texte);
  const morceaux = chemin.split('/');
  const nomFichier = morceaux.pop().replace(/\.(md|markdown)$/i, '');
  return {
    id: typeof meta.id === 'string' && meta.id ? meta.id : null,
    title: (typeof meta.title === 'string' && meta.title.trim()) || nomFichier,
    folder: normaliserDossier(typeof meta.folder === 'string' ? meta.folder : morceaux.join('/')),
    tags: [...new Set((Array.isArray(meta.tags) ? meta.tags : []).map(normaliserTag).filter(Boolean))],
    content: contenu,
    updated_at: typeof meta.updated_at === 'string' ? meta.updated_at : null,
    chemin,
  };
}

const memeNote = (a, b) => a.title === b.title && (a.content || '') === (b.content || '')
  && normaliserDossier(a.folder) === normaliserDossier(b.folder)
  && JSON.stringify(a.tags || []) === JSON.stringify(b.tags || []);

/**
 * Compare les fichiers aux notes existantes. Chaque élément : { fichier, existante?, type }
 * type : 'nouvelle' | 'modifiee' | 'conflit' | 'identique'.
 * Conflit : la note a été modifiée dans Cairn après l'export (ou on ne peut pas le savoir),
 * ou un fichier sans id porte le titre d'une note existante.
 */
export function analyser(fichiers, notes) {
  const parId = new Map(notes.map((n) => [n.id, n]));
  const parTitre = new Map(notes.map((n) => [n.title.toLowerCase(), n]));
  return fichiers.map(noteDuFichier).map((fichier) => {
    const existante = (fichier.id && parId.get(fichier.id)) || (!fichier.id && parTitre.get(fichier.title.toLowerCase())) || null;
    if (!existante) return { fichier, type: 'nouvelle' };
    if (memeNote(fichier, existante)) return { fichier, existante, type: 'identique' };
    const modifieeDepuis = !fichier.id || !fichier.updated_at || existante.updated_at > fichier.updated_at;
    return { fichier, existante, type: modifieeDepuis ? 'conflit' : 'modifiee' };
  });
}

// ---------- Comparaison ligne à ligne (détail d'un conflit) ----------

/**
 * Lignes propres à chaque version : { a: [{ texte, propre }], b: [...] }.
 * Plus longue sous-suite commune ; au-delà de 600 lignes, tout est marqué « propre ».
 */
export function comparer(texteA, texteB) {
  const a = texteA.split('\n');
  const b = texteB.split('\n');
  if (a.length * b.length > 360000) {
    return { a: a.map((t) => ({ texte: t, propre: true })), b: b.map((t) => ({ texte: t, propre: true })) };
  }
  const L = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    }
  }
  const communA = new Set();
  const communB = new Set();
  for (let i = 0, j = 0; i < a.length && j < b.length;) {
    if (a[i] === b[j]) { communA.add(i++); communB.add(j++); } else if (L[i + 1][j] >= L[i][j + 1]) i++; else j++;
  }
  return {
    a: a.map((t, i) => ({ texte: t, propre: !communA.has(i) })),
    b: b.map((t, j) => ({ texte: t, propre: !communB.has(j) })),
  };
}

// ---------- Application ----------

/** « X (import) », puis « X (import) 2 », « X (import) 3 »… jusqu'à un titre libre. */
function titreLibre(titre, titresPris) {
  let t = titre;
  for (let i = 2; titresPris.has(t.toLowerCase()); i++) t = titre + ' ' + i;
  return t;
}

/**
 * Applique l'import. elements : sortie d'analyser() ; choix : Map(index → 'cairn'|'fichier'|'deux')
 * pour les conflits. progression(fait, total) est appelée au fil de l'eau.
 * Renvoie { crees, modifies, echecs: [{ chemin, erreur }] }.
 */
export async function appliquer(elements, choix, notes, progression = () => {}) {
  const titresPris = new Set(notes.map((n) => n.title.toLowerCase()));
  const travail = [];
  elements.forEach((el, i) => {
    if (el.type === 'nouvelle') travail.push({ el, action: 'creer' });
    else if (el.type === 'modifiee') travail.push({ el, action: 'modifier' });
    else if (el.type === 'conflit') {
      const c = choix.get(i) || 'cairn';
      if (c === 'fichier') travail.push({ el, action: 'modifier' });
      if (c === 'deux') travail.push({ el, action: 'copie' });
    }
  });

  const resultat = { crees: 0, modifies: 0, echecs: [] };
  let fait = 0;
  for (const { el, action } of travail) {
    const f = el.fichier;
    const champs = { title: f.title, content: f.content, folder: f.folder, tags: f.tags };
    let r;
    try {
      if (action === 'modifier') {
        r = await modifierNote(el.existante.id, champs);
        if (r.note) resultat.modifies++;
      } else {
        let titre = f.title;
        if (action === 'copie') titre = titreLibre(f.title + ' (import)', titresPris);
        else if (titresPris.has(titre.toLowerCase())) titre = titreLibre(f.title + ' (import)', titresPris);
        r = await creerNote({ ...champs, title: titre });
        if (r.note) { resultat.crees++; titresPris.add(titre.toLowerCase()); }
      }
    } catch {
      r = { erreur: 'reseau' };
    }
    if (r.erreur) resultat.echecs.push({ chemin: f.chemin, erreur: r.erreur });
    progression(++fait, travail.length);
  }
  return resultat;
}

/** Nombre de notes écrites par l'import selon les choix (pour le bouton « importer N notes »). */
export function compterEcritures(elements, choix) {
  return elements.reduce((n, el, i) => {
    if (el.type === 'nouvelle' || el.type === 'modifiee') return n + 1;
    if (el.type === 'conflit' && (choix.get(i) || 'cairn') !== 'cairn') return n + 1;
    return n;
  }, 0);
}
