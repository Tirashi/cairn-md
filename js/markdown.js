// Rendu Markdown (aperçu) et coloration de l'éditeur.
import { marked } from 'https://cdn.jsdelivr.net/npm/marked@18.1.1/+esm';
import DOMPurify from 'https://cdn.jsdelivr.net/npm/dompurify@3.4.17/+esm';

marked.setOptions({ gfm: true, breaks: false });

// ---------- Liens [[Titre]] et [[Titre|texte]] ----------
// Le résolveur (fourni par ui.js) renvoie l'id de la note portant ce titre, ou null.
let resoudre = () => null;
export function definirResolveur(f) { resoudre = f; }

const echapperHtml = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

marked.use({
  extensions: [{
    name: 'lienNote',
    level: 'inline',
    start: (src) => { const i = src.indexOf('[['); return i < 0 ? undefined : i; },
    tokenizer(src) {
      const m = /^\[\[([^\[\]\n|]+?)(?:\|([^\[\]\n]+?))?\]\]/.exec(src);
      if (!m) return undefined;
      return { type: 'lienNote', raw: m[0], titre: m[1].trim(), texte: (m[2] || m[1]).trim() };
    },
    renderer({ titre, texte }) {
      const id = resoudre(titre);
      if (id) return `<a href="#/note/${encodeURIComponent(id)}" class="lien-note">${echapperHtml(texte)}</a>`;
      return `<a href="#/note/" class="lien-note lien-absent" data-titre="${echapperHtml(titre)}" title="Note inexistante : cliquer pour la créer">${echapperHtml(texte)}</a>`;
    },
  }],
});

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
  // Le code en ligne est laissé tel quel : pas de lien ni de gras à l'intérieur.
  return html.split(/(`[^`]+`)/).map((morceau, i) => (i % 2
    ? '<span class="md-code">' + morceau + '</span>'
    : morceau
      .replace(/(\[\[[^\]\n]+\]\])/g, '<span class="md-lien-note">$1</span>')
      .replace(/(\*\*[^*\n]+\*\*)/g, '<span class="md-gras">$1</span>'))).join('');
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
    // Une ligne vide doit garder sa hauteur, même dans un bloc de code (où `html` est
    // un <span> vide, donc pas une chaîne vide) : sinon le texte affiché se décale du curseur.
    return `<div class="ed-ligne">${ligne === '' ? '\u200b' : html}</div>`;
  }).join('');
}

/** Premier extrait lisible du contenu, pour la liste (liens [[…]] réduits à leur texte). */
export function extrait(markdown, longueur = 90) {
  for (const ligne of (markdown || '').split('\n')) {
    if (/^#{1,6}\s/.test(ligne)) continue;          // les titres répètent souvent le nom de la note
    const t = ligne.replace(/^\s*(#{1,6}|>|[-*+]|\d+[.)]|```.*)\s*/, '').trim();
    const lisible = t.replace(/\[\[([^\]|\n]+)(?:\|([^\]\n]+))?\]\]/g, (_, a, b) => b || a);
    if (lisible) return lisible.length > longueur ? lisible.slice(0, longueur - 1) + '…' : lisible;
  }
  return '';
}

export function compterMots(markdown) {
  const m = (markdown || '').match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu);
  return m ? m.length : 0;
}
