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
