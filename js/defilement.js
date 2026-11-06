// Défilement lié en mode split : faire défiler l'éditeur fait défiler l'aperçu, et l'inverse.
// Chaque bloc de l'aperçu est accroché à la ligne du Markdown où il commence ; entre deux
// blocs, la position est interpolée. Si l'aperçu ne correspond pas bloc à bloc (HTML brut),
// on se contente d'une position proportionnelle.
import { debutsDesBlocs } from './markdown.js';

let actif = () => false;
let source = null;          // panneau que l'utilisateur fait défiler
let finSource = 0;
let memo = { texte: null, debuts: [] };   // débuts des blocs du dernier texte lu

function hauteur(el, panneau) {
  return el.getBoundingClientRect().top - panneau.getBoundingClientRect().top + panneau.scrollTop;
}

function calculerPoints(edition, apercu, texte) {
  const maxE = Math.max(0, edition.scrollHeight - edition.clientHeight);
  const maxA = Math.max(0, apercu.scrollHeight - apercu.clientHeight);
  const pts = [[0, 0]];
  const lignes = document.getElementById('editeur-fond').children;
  const blocs = document.getElementById('note-apercu').children;
  if (memo.texte !== texte) memo = { texte, debuts: debutsDesBlocs(texte) };
  const debuts = memo.debuts;
  if (debuts.length === blocs.length) {
    debuts.forEach((l, i) => {
      if (!lignes[l]) return;
      const e = hauteur(lignes[l], edition);
      const a = hauteur(blocs[i], apercu);
      const [pe, pa] = pts[pts.length - 1];
      if (e > pe && a > pa && e < maxE && a < maxA) pts.push([e, a]);
    });
  }
  pts.push([maxE, maxA]);
  return pts;
}

/** Position dans l'autre panneau, par interpolation entre les points (sens 0 : éditeur → aperçu). */
export function correspondance(pts, y, sens) {
  const autre = 1 - sens;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    if (y <= b[sens] || i === pts.length - 1) {
      const ecart = b[sens] - a[sens];
      const t = ecart > 0 ? Math.min(1, Math.max(0, (y - a[sens]) / ecart)) : 0;
      return a[autre] + t * (b[autre] - a[autre]);
    }
  }
  return 0;
}

/** `estActif()` : vrai quand les deux panneaux sont visibles côte à côte. */
export function brancherDefilement(estActif) {
  actif = estActif;
  const edition = document.querySelector('.panneau-edition');
  const apercu = document.querySelector('.panneau-apercu');
  const saisie = document.getElementById('note-contenu');
  const suivre = (depuis, vers, sens) => () => {
    if (!actif()) return;
    // Le défilement qu'on provoque déclenche aussi un événement : on l'ignore.
    if (source && source !== depuis && performance.now() < finSource) return;
    source = depuis;
    finSource = performance.now() + 150;
    // Recalculé à chaque fois : un diagramme ou une image peut changer de taille après coup.
    const points = calculerPoints(edition, apercu, saisie.value);
    vers.scrollTop = correspondance(points, depuis.scrollTop, sens);
  };
  edition.addEventListener('scroll', suivre(edition, apercu, 0), { passive: true });
  apercu.addEventListener('scroll', suivre(apercu, edition, 1), { passive: true });
}
