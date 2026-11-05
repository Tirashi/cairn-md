// Liens entre notes [[Titre]] ou [[Titre|texte affiché]] : fonctions pures.
import { plier } from './arbre.js';

const echapperRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Expression qui trouve les liens vers `titre` (casse ignorée, texte affiché optionnel). */
function regexLien(titre, drapeaux = 'gi') {
  return new RegExp('\\[\\[\\s*' + echapperRegex(titre.trim()) + '\\s*(\\|[^\\]\\n]*)?\\]\\]', drapeaux);
}

/** La note `contenu` contient-elle un lien vers `titre` ? */
export function cite(contenu, titre) {
  return Boolean(titre) && regexLien(titre, 'i').test(contenu || '');
}

/** Remplace les liens vers `ancien` par des liens vers `nouveau` (le texte affiché est gardé). */
export function remplacerLien(contenu, ancien, nouveau) {
  return (contenu || '').replace(regexLien(ancien), (_, alias) => '[[' + nouveau + (alias || '') + ']]');
}

/** Notes (autres que `note`) qui citent `note`, avec la ligne qui cite. */
export function liensEntrants(notes, note) {
  if (!note) return [];
  const re = regexLien(note.title, 'i');
  const resultat = [];
  for (const n of notes) {
    if (n.id === note.id) continue;
    const ligne = (n.content || '').split('\n').find((l) => re.test(l));
    if (ligne !== undefined) resultat.push({ note: n, contexte: ligne.trim() });
  }
  return resultat;
}

/** Nombre de liens [[…]] dans un texte. */
export function compterLiens(contenu) {
  return ((contenu || '').match(/\[\[[^\[\]\n]+\]\]/g) || []).length;
}

/**
 * Amorce de lien en cours de frappe : texte entre `[[` et le curseur,
 * sur la même ligne et sans `]]`. Renvoie { debut, requete } ou null.
 */
export function amorceLien(texte, curseur) {
  const avant = texte.slice(0, curseur);
  const m = avant.match(/\[\[([^\[\]\n|]*)$/);
  return m ? { debut: curseur - m[1].length, requete: m[1] } : null;
}

/** Titres proposés pour une requête : ceux qui commencent par elle, puis ceux qui la contiennent. */
export function proposerTitres(titres, requete, max = 6) {
  const q = plier(requete.trim());
  const debut = [];
  const milieu = [];
  for (const t of titres) {
    const p = plier(t);
    if (!q || p.startsWith(q)) debut.push(t);
    else if (p.includes(q)) milieu.push(t);
  }
  return [...debut, ...milieu].slice(0, max);
}
