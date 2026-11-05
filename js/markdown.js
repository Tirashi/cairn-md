// Rendu Markdown (aperçu) et coloration de l'éditeur.
import { marked } from 'https://cdn.jsdelivr.net/npm/marked@18.1.1/+esm';
import DOMPurify from 'https://cdn.jsdelivr.net/npm/dompurify@3.4.17/+esm';

marked.setOptions({ gfm: true, breaks: false });

// Les liens externes s'ouvrent dans un nouvel onglet, sans accès à la page d'origine.
DOMPurify.addHook('afterSanitizeAttributes', (noeud) => {
  if (noeud.tagName === 'A' && /^https?:/i.test(noeud.getAttribute('href') || '')) {
    noeud.setAttribute('target', '_blank');
    noeud.setAttribute('rel', 'noopener noreferrer');
  }
});

/** Markdown → HTML assaini. Toujours passer par ici pour afficher du Markdown. */
export function rendre(markdown) {
  return DOMPurify.sanitize(marked.parse(markdown || ''));
}

// ---------- Coloration de l'éditeur ----------
// Ligne par ligne, sans changer la largeur des caractères (couleurs seulement),
// pour que le texte coloré reste exactement sous le <textarea> transparent.

function echapper(texte) {
  return texte.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function colorerEnLigne(html) {
  return html
    .replace(/(`[^`]+`)/g, '<span class="md-code">$1</span>')
    .replace(/(\[\[[^\]\n]+\]\])/g, '<span class="md-lien-note">$1</span>')
    .replace(/(\*\*[^*\n]+\*\*)/g, '<span class="md-gras">$1</span>');
}

/** Renvoie le HTML des lignes colorées (une <div> par ligne logique). */
export function colorer(texte) {
  const lignes = texte.split('\n');
  let dansCode = false;
  return lignes.map((ligne) => {
    const brut = echapper(ligne);
    let html;
    if (/^\s*(```|~~~)/.test(ligne)) {
      dansCode = !dansCode;
      html = `<span class="md-marque">${brut}</span>`;
    } else if (dansCode) {
      html = `<span class="md-code">${brut}</span>`;
    } else if (/^#{1,6}\s/.test(ligne)) {
      html = `<span class="md-titre">${brut}</span>`;
    } else if (/^\s*&gt;/.test(brut)) {
      html = brut.replace(/^(\s*&gt;)(.*)$/, (_, m, r) => `<span class="md-marque">${m}</span><span class="md-citation">${colorerEnLigne(r)}</span>`);
    } else if (/^\s*([-*+]|\d+[.)])\s/.test(ligne)) {
      html = brut.replace(/^(\s*(?:[-*+]|\d+[.)]))/, '<span class="md-marque">$1</span>');
      html = html.replace(/(<\/span>)(.*)$/, (_, f, r) => f + colorerEnLigne(r));
    } else {
      html = colorerEnLigne(brut);
    }
    // Une ligne vide doit garder sa hauteur.
    return `<div class="ed-ligne">${html || '​'}</div>`;
  }).join('');
}

/** Premier extrait lisible du contenu, pour la liste. */
export function extrait(markdown, longueur = 90) {
  for (const ligne of (markdown || '').split('\n')) {
    if (/^#{1,6}\s/.test(ligne)) continue;          // les titres répètent souvent le nom de la note
    const t = ligne.replace(/^\s*(#{1,6}|>|[-*+]|\d+[.)]|```.*)\s*/, '').trim();
    if (t) return t.length > longueur ? t.slice(0, longueur - 1) + '…' : t;
  }
  return '';
}

export function compterMots(markdown) {
  const m = (markdown || '').match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu);
  return m ? m.length : 0;
}
