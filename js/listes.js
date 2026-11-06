// Listes dans l'éditeur : Entrée sur une ligne « - texte », « - [ ] texte » ou « 1. texte »
// continue la liste à la ligne suivante ; Entrée sur un élément vide termine la liste.
// Fonction pure (sans DOM), branchée dans ui.js.

const PUCE = /^(\s*)(?:([-*+])|(\d+)([.)]))(\s+)(\[[ xX]\](?:\s+|$))?/;

/**
 * Ce que doit faire Entrée à la position [debut, fin] de `valeur` :
 * { debut, fin, texte } (remplacer cette plage par `texte`), ou null (Entrée normale).
 */
export function continuerListe(valeur, debut, fin) {
  const ligneDebut = valeur.lastIndexOf('\n', debut - 1) + 1;
  let ligneFin = valeur.indexOf('\n', debut);
  if (ligneFin < 0) ligneFin = valeur.length;
  if (fin > ligneFin) return null;                          // sélection sur plusieurs lignes
  const ligne = valeur.slice(ligneDebut, ligneFin);
  const m = ligne.match(PUCE);
  if (!m || debut - ligneDebut < m[0].length) return null;  // curseur avant ou dans la puce
  // Pas dans un bloc de code (nombre impair de ``` avant la ligne).
  if ((valeur.slice(0, ligneDebut).match(/^\s*```/gm) || []).length % 2) return null;

  const [marque, retrait, tiret, numero, signe, espace, caseACocher] = m;
  // Élément vide : Entrée termine la liste (la puce disparaît).
  if (!ligne.slice(marque.length).trim()) return { debut: ligneDebut, fin: ligneFin, texte: '' };
  const puce = tiret || (Number(numero) + 1) + signe;
  return { debut, fin, texte: '\n' + retrait + puce + espace + (caseACocher ? '[ ] ' : '') };
}
