// Aperçu enrichi : coloration du code (highlight.js) et diagrammes (mermaid).
// Les deux bibliothèques ne sont chargées que si une note en a besoin.
// Tout HTML produit repasse par DOMPurify.
import DOMPurify from 'https://cdn.jsdelivr.net/npm/dompurify@3.4.17/+esm';

const URL_HLJS = 'https://cdn.jsdelivr.net/npm/@highlightjs/cdn-assets@11.12.0/es/highlight.min.js';
const URL_MERMAID = 'https://cdn.jsdelivr.net/npm/mermaid@12.2.0/dist/mermaid.esm.min.mjs';

let hljs = null;            // module chargé
let promesseHljs = null;
let mermaid = null;
let promesseMermaid = null;
let themeMermaid = '';
let numero = 0;

// Bloc sans langage : on ne devine que parmi les langages courants (sinon SQL → « vbnet »…).
const LANGUES_DEVINEES = ['javascript', 'typescript', 'python', 'bash', 'shell', 'json', 'sql', 'css', 'xml',
  'yaml', 'java', 'c', 'cpp', 'csharp', 'go', 'rust', 'php', 'ruby', 'diff', 'ini', 'markdown'];

const cacheCode = new Map();     // `${langue}\n${texte}` → { html, langue }
const cacheMermaid = new Map();  // `${theme}\n${source}` → { svg } ou { erreur }

function memoriser(cache, cle, valeur) {
  if (cache.size > 300) cache.delete(cache.keys().next().value);
  cache.set(cle, valeur);
}

function chargerHljs() {
  promesseHljs ??= import(URL_HLJS).then((m) => { hljs = m.default; return hljs; });
  return promesseHljs;
}

function chargerMermaid() {
  promesseMermaid ??= import(URL_MERMAID).then((m) => { mermaid = m.default; return mermaid; });
  return promesseMermaid;
}

// ---------- Code ----------

function langueDe(code) {
  const m = (code.className || '').match(/language-([\w+#.-]+)/);
  return m ? m[1].toLowerCase() : '';
}

/** Entoure un <pre> d'un cadre avec le nom du langage et un bouton « copier ». */
function encadrer(pre, langue) {
  const figure = document.createElement('figure');
  figure.className = 'bloc-code';
  const legende = document.createElement('figcaption');
  const nom = document.createElement('span');
  nom.className = 'bloc-langue';
  nom.textContent = langue || 'texte';
  const copier = document.createElement('button');
  copier.type = 'button';
  copier.className = 'bouton-copier';
  copier.textContent = 'copier';
  legende.append(nom, copier);
  pre.replaceWith(figure);
  figure.append(legende, pre);
  return nom;
}

function colorer(code, etiquette) {
  const texte = code.textContent;
  const demandee = langueDe(code);
  const cle = demandee + '\n' + texte;
  let r = cacheCode.get(cle);
  if (!r) {
    let resultat = null;
    if (demandee && hljs.getLanguage(demandee)) {
      resultat = hljs.highlight(texte, { language: demandee, ignoreIllegals: true });
    } else if (!demandee && texte.length < 20000) {
      resultat = hljs.highlightAuto(texte, LANGUES_DEVINEES);
      if (resultat.relevance < 3) resultat = null;      // devinette trop incertaine : on laisse brut
    }
    r = resultat ? { html: DOMPurify.sanitize(resultat.value), langue: demandee || resultat.language } : { html: null, langue: demandee };
    memoriser(cacheCode, cle, r);
  }
  if (r.html !== null) {
    code.innerHTML = r.html;
    code.classList.add('hljs');
  }
  if (r.langue) etiquette.textContent = r.langue;
}

// ---------- Mermaid ----------

function variable(nom) {
  return getComputedStyle(document.documentElement).getPropertyValue(nom).trim();
}

/** Thème mermaid tiré des couleurs de Cairn (sombre ou clair). */
function preparerMermaid() {
  const sombre = document.documentElement.getAttribute('data-theme') !== 'light';
  const theme = sombre ? 'sombre' : 'clair';
  if (theme === themeMermaid) return theme;
  themeMermaid = theme;
  const pierre = sombre ? '#5b5f66' : '#9aa0a8';
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    htmlLabels: false,
    flowchart: { htmlLabels: false, curve: 'basis' },
    theme: 'base',
    fontFamily: "'JetBrains Mono', ui-monospace, monospace",
    themeVariables: {
      darkMode: sombre,
      fontFamily: "'JetBrains Mono', ui-monospace, monospace",
      fontSize: '13px',
      background: variable('--bg'),
      primaryColor: variable('--surface'),
      primaryTextColor: variable('--text'),
      primaryBorderColor: pierre,
      secondaryColor: variable('--surface'),
      secondaryTextColor: variable('--text'),
      secondaryBorderColor: variable('--accent'),
      tertiaryColor: variable('--bg'),
      tertiaryTextColor: variable('--text'),
      tertiaryBorderColor: pierre,
      lineColor: variable('--muted'),
      textColor: variable('--text'),
      mainBkg: variable('--surface'),
      nodeBorder: pierre,
      clusterBkg: variable('--bg'),
      clusterBorder: variable('--border'),
      edgeLabelBackground: variable('--bg'),
      noteBkgColor: variable('--surface'),
      noteTextColor: variable('--text'),
      noteBorderColor: variable('--accent'),
      actorBkg: variable('--surface'),
      actorBorder: pierre,
      actorTextColor: variable('--text'),
      signalColor: variable('--muted'),
      signalTextColor: variable('--text'),
    },
  });
  return theme;
}

function assainirSvg(svg) {
  return DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true }, ADD_TAGS: ['style'] });
}

function placerDiagramme(cadre, resultat) {
  cadre.replaceChildren();
  if (resultat.erreur) {
    cadre.classList.add('bloc-mermaid-erreur');
    const p = document.createElement('p');
    p.textContent = 'mermaid : ' + resultat.erreur;
    cadre.append(p);
    return;
  }
  const zone = document.createElement('div');
  zone.className = 'mermaid-svg';
  zone.innerHTML = resultat.svg;          // déjà passé par DOMPurify
  // Taille réelle (texte lisible) ; le cadre défile si le diagramme est plus large que l'aperçu.
  const svg = zone.querySelector('svg');
  const vb = svg && svg.viewBox && svg.viewBox.baseVal;
  if (vb && vb.width) {
    svg.setAttribute('width', String(Math.ceil(vb.width)));
    svg.setAttribute('height', String(Math.ceil(vb.height)));
    svg.style.maxWidth = 'none';
  }
  cadre.append(zone);
  // Un peu trop large : on réduit (jusqu'à 60 %) ; beaucoup trop large : le cadre défile.
  const dispo = cadre.clientWidth - 34;
  if (vb && vb.width > dispo && dispo > 0 && dispo / vb.width >= 0.6) {
    svg.setAttribute('width', String(dispo));
    svg.setAttribute('height', String(Math.ceil(vb.height * dispo / vb.width)));
  }
}

async function dessiner(source, theme) {
  const cle = theme + '\n' + source;
  if (cacheMermaid.has(cle)) return cacheMermaid.get(cle);
  const id = 'cairn-mermaid-' + (++numero);
  let resultat;
  try {
    const { svg } = await mermaid.render(id, source);
    resultat = { svg: assainirSvg(svg) };
  } catch (e) {
    const message = String((e && (e.str || e.message)) || e).split('\n')[0];
    resultat = { erreur: message.length > 160 ? message.slice(0, 159) + '…' : message };
  }
  // mermaid laisse parfois un élément temporaire dans la page après une erreur.
  document.getElementById(id)?.remove();
  document.getElementById('d' + id)?.remove();
  memoriser(cacheMermaid, cle, resultat);
  return resultat;
}

// ---------- Point d'entrée ----------

const jetons = new WeakMap();

/**
 * À appeler juste après avoir rempli `conteneur` avec le HTML de l'aperçu.
 * Colore le code et dessine les diagrammes (sans bloquer : les bibliothèques arrivent ensuite).
 */
export function enrichir(conteneur) {
  const jeton = (jetons.get(conteneur) || 0) + 1;
  jetons.set(conteneur, jeton);
  const aJour = () => jetons.get(conteneur) === jeton;

  const codes = [];
  const diagrammes = [];
  for (const code of conteneur.querySelectorAll('pre > code')) {
    const pre = code.parentElement;
    if (langueDe(code) === 'mermaid') {
      const cadre = document.createElement('figure');
      cadre.className = 'bloc-mermaid';
      cadre.dataset.source = code.textContent;
      const attente = document.createElement('p');
      attente.className = 'muet';
      attente.textContent = 'diagramme…';
      cadre.append(attente);
      pre.replaceWith(cadre);
      diagrammes.push(cadre);
    } else {
      codes.push({ code, etiquette: encadrer(pre, langueDe(code)) });
    }
  }

  if (codes.length) {
    const colorerTout = () => { if (aJour()) for (const c of codes) colorer(c.code, c.etiquette); };
    if (hljs) colorerTout();                       // déjà chargé : tout de suite, sans clignotement
    else chargerHljs().then(colorerTout).catch(() => { /* hors ligne : le code reste lisible, sans couleurs */ });
  }

  if (diagrammes.length) {
    const toutDessiner = async () => {
      if (!aJour()) return;
      const theme = preparerMermaid();
      for (const cadre of diagrammes) {
        const deja = cacheMermaid.get(theme + '\n' + cadre.dataset.source);
        if (deja) { placerDiagramme(cadre, deja); continue; }
        const r = await dessiner(cadre.dataset.source, theme);
        if (!aJour()) return;
        placerDiagramme(cadre, r);
      }
    };
    if (mermaid) toutDessiner();
    else {
      chargerMermaid().then(toutDessiner).catch(() => {
        if (!aJour()) return;
        for (const c of diagrammes) placerDiagramme(c, { erreur: 'bibliothèque injoignable (hors ligne ?)' });
      });
    }
  }
}

/** Gère les clics sur « copier » dans un conteneur d'aperçu. */
export function brancherCopie(conteneur) {
  conteneur.addEventListener('click', async (e) => {
    const bouton = e.target.closest('.bouton-copier');
    if (!bouton) return;
    const code = bouton.closest('.bloc-code')?.querySelector('code');
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code.textContent);
      bouton.textContent = 'copié ✓';
    } catch {
      bouton.textContent = 'impossible';
    }
    setTimeout(() => { bouton.textContent = 'copier'; }, 1500);
  });
}
