// Cases à cocher de l'aperçu : retrouver dans le Markdown la n-ième tâche « - [ ] texte »
// (fonctions pures). marked ne fait une case que si « [ ] » est suivi d'un espace puis de
// texte ; les blocs de code ``` / ~~~ sont ignorés, comme dans l'aperçu.

const TACHE = /^((?:[ \t]*>)*[ \t]*(?:[-*+]|\d+[.)])[ \t]+\[)([ xX])\][ \t]+\S/;
const CLOTURE = /^[ \t]*(```|~~~)/;

/** Tâches de `markdown`, dans l'ordre : { position (caractère entre crochets), faite, texte }. */
export function listerTaches(markdown) {
  const taches = [];
  let dansCode = null;
  let debut = 0;
  for (const ligne of markdown.split('\n')) {
    const cloture = ligne.match(CLOTURE);
    if (cloture) {
      if (!dansCode) dansCode = cloture[1];
      else if (cloture[1] === dansCode) dansCode = null;
    } else if (!dansCode) {
      const m = ligne.match(TACHE);
      if (m) {
        taches.push({
          position: debut + m[1].length,
          faite: m[2] !== ' ',
          texte: ligne.slice(m[0].length - 1).trim(),
        });
      }
    }
    debut += ligne.length + 1;
  }
  return taches;
}

/** Position, dans `markdown`, du caractère entre crochets de chaque tâche, dans l'ordre. */
export function positionsDesCases(markdown) {
  return listerTaches(markdown).map((t) => t.position);
}

/** Coche ou décoche la n-ième tâche ; null si elle n'existe pas. */
export function basculerCase(markdown, n) {
  const p = positionsDesCases(markdown)[n];
  if (p === undefined) return null;
  return markdown.slice(0, p) + (markdown[p] === ' ' ? 'x' : ' ') + markdown.slice(p + 1);
}
