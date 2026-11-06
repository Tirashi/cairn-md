// Essai de bout en bout : node outils/essai.js [--captures <dossier>]
// Sert le dépôt en local, remplace supabase-js (CDN) par outils/faux-supabase.js,
// sert marked et DOMPurify depuis le registre npm (mis en cache dans outils/.cache/),
// et vérifie connexion, thème, notes (création, édition, sauvegarde, suppression), aperçu assaini.
const http = require('http');
const https = require('https');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
// Pour que les routes de l'essai servent aussi les requêtes du service worker.
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = '1';
const { chromium } = require('playwright');

const RACINE = path.resolve(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };

function serveur() {
  return http.createServer((req, res) => {
    const chemin = path.join(RACINE, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!chemin.startsWith(RACINE)) { res.writeHead(403); return res.end(); }
    const fichier = fs.existsSync(chemin) && fs.statSync(chemin).isDirectory() ? path.join(chemin, 'index.html') : chemin;
    fs.readFile(fichier, (err, data) => {
      if (err) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(fichier)] || 'application/octet-stream' });
      res.end(data);
    });
  });
}

// ---------- Bibliothèques du CDN, prises sur le registre npm (même version) ----------
const CACHE = path.join(__dirname, '.cache');
const BIBLIOTHEQUES = [
  // [motif dans js/*.js (version en 1er groupe), paquet npm, fichier ES du paquet ou null]
  // null : tout le paquet est servi sous l'URL du CDN (modules découpés en morceaux, comme mermaid).
  [/cdn\.jsdelivr\.net\/npm\/marked@([\d.]+)\/\+esm/, 'marked', 'lib/marked.esm.js'],
  [/cdn\.jsdelivr\.net\/npm\/dompurify@([\d.]+)\/\+esm/, 'dompurify', 'dist/purify.es.mjs'],
  [/cdn\.jsdelivr\.net\/npm\/@highlightjs\/cdn-assets@([\d.]+)\/es\/highlight\.min\.js/, '@highlightjs/cdn-assets', 'es/highlight.min.js'],
  [/cdn\.jsdelivr\.net\/npm\/mermaid@([\d.]+)\/dist\/mermaid\.esm\.min\.mjs/, 'mermaid', null],
  // JSZip n'existe qu'en UMD : on ajoute l'export que fabrique « +esm » sur jsDelivr.
  [/cdn\.jsdelivr\.net\/npm\/jszip@([\d.]+)\/\+esm/, 'jszip', 'dist/jszip.min.js', '\nexport default window.JSZip;'],
];

function telecharger(url, dest) {
  return new Promise((ok, ko) => {
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) return telecharger(res.headers.location, dest).then(ok, ko);
      if (res.statusCode !== 200) return ko(new Error(url + ' : HTTP ' + res.statusCode));
      const f = fs.createWriteStream(dest);
      res.pipe(f);
      f.on('finish', () => f.close(ok));
    }).on('error', ko);
  });
}

/**
 * Renvoie les routes à installer : { url, corps } (un fichier) ou { prefixe, dossier } (tout un paquet),
 * pour chaque bibliothèque utilisée par js/, à la version écrite dans le code.
 */
async function preparerBibliotheques() {
  const sources = fs.readdirSync(path.join(RACINE, 'js')).map((f) => fs.readFileSync(path.join(RACINE, 'js', f), 'utf8')).join('\n');
  const routes = [];
  for (const [motif, paquet, fichier, suffixe = ''] of BIBLIOTHEQUES) {
    const m = sources.match(motif);
    if (!m) continue;
    const version = m[1];
    const nomCourt = paquet.split('/').pop();
    const dossier = path.join(CACHE, nomCourt + '-' + version);
    const temoin = path.join(dossier, 'package.json');
    if (!fs.existsSync(temoin)) {
      fs.mkdirSync(dossier, { recursive: true });
      const tgz = path.join(dossier, 'paquet.tgz');
      await telecharger(`https://registry.npmjs.org/${paquet}/-/${nomCourt}-${version}.tgz`, tgz);
      execFileSync('tar', ['xzf', tgz, '-C', dossier, '--strip-components=1']);
      fs.unlinkSync(tgz);
    }
    if (fichier) routes.push({ url: `https://${m[0]}`, corps: fs.readFileSync(path.join(dossier, fichier), 'utf8') + suffixe, dossier });
    else routes.push({ prefixe: `https://cdn.jsdelivr.net/npm/${paquet}@${version}/`, dossier });
  }
  return routes;
}

let routesBibliotheques = [];

let echecs = 0;
function verifier(condition, libelle) {
  console.log((condition ? '  ok   ' : '  ÉCHEC ') + libelle);
  if (!condition) echecs++;
}

async function nouvellePage(navigateur, base, { configure, schema = 'dark', sw = false }) {
  // Le service worker intercepterait les requêtes avant les routes de l'essai : bloqué ici, testé à part.
  const contexte = await navigateur.newContext({ colorScheme: schema, serviceWorkers: sw ? 'allow' : 'block' });
  const page = await contexte.newPage();
  const r = contexte;   // routes au niveau du contexte : elles servent aussi le service worker
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(e.message));
  await r.route('https://fonts.googleapis.com/**', (r) => r.abort());
  await r.route('https://fonts.gstatic.com/**', (r) => r.abort());
  await r.route('https://cdn.jsdelivr.net/npm/@supabase/**', (r) =>
    r.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(path.join(__dirname, 'faux-supabase.js'), 'utf8') }));
  for (const route of routesBibliotheques) {
    if (route.url) {
      await r.route(route.url, (r) => r.fulfill({ contentType: 'text/javascript', body: route.corps }));
    } else {
      await r.route(route.prefixe + '**', (r) => {
        const relatif = decodeURIComponent(r.request().url().slice(route.prefixe.length).split('?')[0]);
        const chemin = path.join(route.dossier, relatif);
        if (!chemin.startsWith(route.dossier) || !fs.existsSync(chemin)) return r.fulfill({ status: 404, body: '' });
        r.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(chemin) });
      });
    }
  }
  // La vraie config n'est jamais utilisée par l'essai : remplie (faux projet) ou vide.
  await r.route(base + '/js/config.js', (r) => r.fulfill({
    contentType: 'text/javascript',
    body: configure
      ? "export const SUPABASE_URL = 'https://faux.supabase.co'; export const SUPABASE_ANON_KEY = 'faux';"
      : "export const SUPABASE_URL = ''; export const SUPABASE_ANON_KEY = '';",
  }));
  return { page, erreurs };
}

const visible = (page, id) => page.locator('#' + id).isVisible();

(async () => {
  const srv = serveur().listen(0);
  const base = 'http://127.0.0.1:' + srv.address().port;
  routesBibliotheques = await preparerBibliotheques();
  const navigateur = await chromium.launch();

  try {
    console.log('Configuration vide');
    {
      const { page, erreurs } = await nouvellePage(navigateur, base, { configure: false });
      await page.goto(base + '/');
      await page.waitForSelector('#ecran-config:not([hidden])');
      verifier(await visible(page, 'ecran-config'), 'écran « configuration manquante »');
      verifier(!(await visible(page, 'ecran-connexion')), 'pas d\'écran de connexion');
      verifier(erreurs.length === 0, 'aucune erreur JS ' + erreurs.join(' | '));
    }

    console.log('Préférence claire du système');
    {
      const { page } = await nouvellePage(navigateur, base, { configure: false, schema: 'light' });
      await page.goto(base + '/');
      verifier((await page.getAttribute('html', 'data-theme')) === 'light', 'sans choix enregistré, suit prefers-color-scheme');
    }

    console.log('Connexion');
    {
      const { page, erreurs } = await nouvellePage(navigateur, base, { configure: true });
      await page.goto(base + '/');
      await page.waitForSelector('#ecran-connexion:not([hidden])');
      verifier(!(await visible(page, 'ecran-appli')), 'appli cachée tant que non connecté');
      verifier(page.url().endsWith('#/connexion'), 'adresse #/connexion');
      verifier((await page.getAttribute('html', 'data-theme')) === 'dark', 'thème sombre par défaut');

      await page.click('#connexion-bouton');
      verifier((await page.textContent('#connexion-message')).includes('Renseigner'), 'champs vides refusés');

      await page.fill('#connexion-email', 'essai@cairn.local');
      await page.fill('#connexion-mdp', 'mauvais');
      await page.click('#connexion-bouton');
      await page.waitForFunction(() => document.getElementById('connexion-message').textContent.includes('incorrect'));
      verifier(true, 'mauvais mot de passe : « Email ou mot de passe incorrect. »');

      await page.fill('#connexion-mdp', 'secret');
      await page.press('#connexion-mdp', 'Enter');
      await page.waitForSelector('#ecran-appli:not([hidden])');
      verifier(await visible(page, 'ecran-appli'), 'connexion réussie : appli affichée');
      verifier((await page.textContent('#etat-utilisateur')) === 'essai@cairn.local', 'email dans la barre d\'état');
      verifier(page.url().endsWith('#/'), 'adresse #/');

      await page.reload();
      await page.waitForSelector('#ecran-appli:not([hidden])');
      verifier(true, 'session gardée après rechargement');

      await page.click('#ecran-appli [data-action="theme"]');
      verifier((await page.getAttribute('html', 'data-theme')) === 'light', 'bascule vers le thème clair');
      await page.reload();
      await page.waitForSelector('#ecran-appli:not([hidden])');
      verifier((await page.getAttribute('html', 'data-theme')) === 'light', 'thème clair retenu après rechargement');
      verifier((await page.getAttribute('meta[name="theme-color"]', 'content')) === '#f6f6f4', 'theme-color mis à jour');

      await page.click('#bouton-deconnexion');
      await page.waitForSelector('#ecran-connexion:not([hidden])');
      verifier(!(await visible(page, 'ecran-appli')), 'déconnexion : retour à l\'écran de connexion');
      verifier((await page.inputValue('#connexion-mdp')) === '', 'mot de passe effacé');

      await page.setViewportSize({ width: 390, height: 844 });
      const largeur = await page.evaluate(() => document.documentElement.scrollWidth);
      verifier(largeur <= 390, 'pas de défilement horizontal sur téléphone (' + largeur + ' px)');

      verifier(erreurs.length === 0, 'aucune erreur JS ' + erreurs.join(' | '));

      if (process.argv.includes('--captures')) {
        const dossier = process.argv[process.argv.indexOf('--captures') + 1] || '.';
        await page.screenshot({ path: path.join(dossier, 'connexion-mobile.png') });
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.fill('#connexion-email', 'essai@cairn.local');
        await page.fill('#connexion-mdp', 'secret');
        await page.click('#connexion-bouton');
        await page.waitForSelector('#ecran-appli:not([hidden])');
        await page.click('#ecran-appli [data-action="theme"]');
        await page.screenshot({ path: path.join(dossier, 'appli-desktop.png') });
      }
    }

    console.log('Notes');
    {
      const { page, erreurs } = await nouvellePage(navigateur, base, { configure: true });
      const enregistre = () => page.waitForFunction(() => /● enregistré \d/.test(document.getElementById('etat-sauvegarde').textContent));
      await page.goto(base + '/');
      await page.fill('#connexion-email', 'essai@cairn.local');
      await page.fill('#connexion-mdp', 'secret');
      await page.click('#connexion-bouton');
      await page.waitForSelector('#ecran-appli:not([hidden])');
      await page.waitForFunction(() => document.getElementById('liste-message').textContent.includes('aucune note'));
      verifier(true, 'liste vide : message d\'accueil');

      await page.click('#bouton-nouvelle');
      await page.waitForSelector('#note:not([hidden])');
      verifier((await page.inputValue('#note-titre')) === 'sans titre', 'nouvelle note « sans titre »');
      verifier(/^#\/note\/[0-9a-f-]+$/.test(new URL(page.url()).hash), 'adresse #/note/<id>');
      verifier(await page.evaluate(() => document.activeElement.id === 'note-titre'), 'curseur dans le titre');

      await page.fill('#note-titre', 'Cairn — plan V1');
      await page.press('#note-titre', 'Enter');
      verifier(await page.evaluate(() => document.activeElement.id === 'note-contenu'), 'Entrée passe au contenu');
      const md = [
        '# Cairn — plan V1', '', 'Front **statique** et `code` en ligne, voir [[Modèle de données]].', '',
        '- un', '- deux', '', '> citation', '', '```js', 'const a = 1;', '```', '',
        '<img src="x" onerror="window.__xss = 1"><script>window.__xss = 2</script>',
        '[piège](javascript:window.__xss=3) [site](https://example.org)',
        'Une très longue ligne pour vérifier que le texte coloré et la zone de saisie se coupent exactement au même endroit, même sur un écran étroit, sans décalage du curseur.',
      ].join('\n');
      await page.fill('#note-contenu', md);
      await enregistre();
      verifier(true, 'sauvegarde automatique : « ● enregistré HH:MM »');
      verifier((await page.textContent('#liste-notes')).includes('cairn-plan-v1.md'), 'liste : cairn-plan-v1.md');

      verifier((await page.textContent('#note-apercu h1')) === 'Cairn — plan V1', 'aperçu : titre rendu');
      verifier((await page.locator('#note-apercu li').count()) === 2, 'aperçu : liste rendue');
      verifier((await page.locator('#note-apercu pre code').count()) === 1, 'aperçu : bloc de code');
      verifier((await page.locator('#note-apercu script, #note-apercu [onerror]').count()) === 0, 'aperçu assaini : ni <script> ni onerror');
      verifier((await page.locator('#note-apercu a[href^="javascript"]').count()) === 0, 'aperçu assaini : pas de lien javascript:');
      verifier((await page.getAttribute('#note-apercu a[href^="https"]', 'rel')) === 'noopener noreferrer', 'lien externe : rel noopener');
      verifier(await page.evaluate(() => window.__xss === undefined), 'aucun code injecté exécuté');

      const lignes = md.split('\n').length;
      verifier((await page.locator('#editeur-fond .ed-ligne').count()) === lignes, 'éditeur : une ligne colorée par ligne (' + lignes + ')');
      verifier((await page.locator('#editeur-fond .md-titre').count()) === 1 && (await page.locator('#editeur-fond .md-lien-note').count()) === 1, 'éditeur : titre et [[lien]] colorés');

      await page.click('.bascule [data-mode="view"]');
      verifier(!(await page.locator('.panneau-edition').isVisible()) && (await page.locator('.panneau-apercu').isVisible()), 'mode view : aperçu seul');
      await page.click('.bascule [data-mode="edit"]');
      verifier((await page.locator('.panneau-edition').isVisible()) && !(await page.locator('.panneau-apercu').isVisible()), 'mode edit : éditeur seul');
      await page.click('.bascule [data-mode="split"]');
      verifier((await page.locator('.panneau-edition').isVisible()) && (await page.locator('.panneau-apercu').isVisible()), 'mode split : les deux');
      if (process.argv.includes('--captures')) {
        await page.screenshot({ path: path.join(process.argv[process.argv.indexOf('--captures') + 1] || '.', 'note-desktop.png') });
      }

      const premiere = new URL(page.url()).hash;
      await page.reload();
      await page.waitForSelector('#note:not([hidden])');
      verifier((await page.inputValue('#note-contenu')) === md && (await page.inputValue('#note-titre')) === 'Cairn — plan V1', 'après rechargement : note rouverte intacte');

      await page.click('#bouton-nouvelle');
      await page.waitForFunction((h) => location.hash !== h, premiere);
      await page.fill('#note-titre', 'cairn — PLAN v1');
      await page.waitForFunction(() => document.getElementById('note-message').textContent.includes('déjà ce titre'));
      verifier(true, 'titre déjà pris (casse ignorée) : refusé avec message');
      await page.fill('#note-titre', 'Deuxième');
      await enregistre();
      verifier(!(await page.textContent('#note-message')), 'titre corrigé : message effacé');
      const noms = await page.locator('.ln-nom').allTextContents();
      verifier(noms[0] === 'deuxieme.md' && noms[1] === 'cairn-plan-v1.md', 'liste triée par modification (' + noms.join(', ') + ')');

      // Serveur injoignable : la note est gardée sur l'appareil, puis envoyée au retour du réseau.
      await page.evaluate(() => localStorage.setItem('faux-supabase-panne', '1'));
      await page.fill('#note-contenu', 'écrit pendant la panne');
      await page.waitForFunction(() => document.getElementById('etat-sauvegarde').textContent.includes("enregistré sur l'appareil"));
      verifier(true, 'panne réseau : « enregistré sur l\'appareil »');
      await page.waitForFunction(() => /hors ligne · 1 en attente/.test(document.getElementById('etat-reseau').textContent));
      verifier((await page.locator('.ln-attente').count()) === 1, 'panne réseau : barre d\'état « hors ligne · 1 en attente » et • sur la note');
      await page.evaluate(() => { localStorage.removeItem('faux-supabase-panne'); window.dispatchEvent(new Event('online')); });
      await page.waitForFunction(() => /1 note synchronisée/.test(document.getElementById('etat-reseau').textContent), null, { timeout: 8000 });
      const envoyee = await page.evaluate(() => JSON.parse(localStorage.getItem('faux-supabase-notes')).find((n) => n.title === 'Deuxième').content);
      verifier(envoyee === 'écrit pendant la panne' && (await page.locator('.ln-attente').count()) === 0, 'retour du réseau : note envoyée, « 1 note synchronisée »');

      await page.click('#bouton-supprimer');
      await page.click('#dialogue button[value="annuler"]');
      verifier((await page.locator('.ln-nom').count()) === 2, 'suppression annulée : note gardée');
      await page.click('#bouton-supprimer');
      await page.click('#dialogue button[value="ok"]');
      await page.waitForFunction(() => document.querySelectorAll('.ln-nom').length === 1);
      verifier(new URL(page.url()).hash === '#/', 'suppression : retour à la liste');

      await page.setViewportSize({ width: 390, height: 844 });
      verifier((await page.locator('.col-liste').isVisible()) && !(await page.locator('.col-note').isVisible()), 'téléphone : la liste seule');
      await page.click('.liste-notes a');
      await page.waitForSelector('#note:not([hidden])');
      verifier(!(await page.locator('.col-liste').isVisible()) && (await page.locator('.bouton-retour').isVisible()), 'téléphone : la note seule, avec ←');
      verifier((await page.getAttribute('#note', 'data-mode')) === 'view', 'téléphone : split devient view');
      await page.click('.bascule [data-mode="edit"]');
      const ecart = await page.evaluate(() => Math.abs(document.getElementById('editeur-fond').offsetHeight - document.getElementById('note-contenu').scrollHeight));
      verifier(ecart <= 2, 'éditeur : texte coloré et saisie de même hauteur (écart ' + ecart + ' px)');
      const largeur = await page.evaluate(() => document.documentElement.scrollWidth);
      verifier(largeur <= 390, 'téléphone : pas de défilement horizontal (' + largeur + ' px)');
      if (process.argv.includes('--captures')) {
        const dossier = process.argv[process.argv.indexOf('--captures') + 1] || '.';
        await page.screenshot({ path: path.join(dossier, 'note-mobile.png') });
      }
      await page.click('.bouton-retour');
      await page.waitForFunction(() => document.getElementById('ecran-appli').dataset.vue === 'liste');
      verifier(await page.locator('.col-liste').isVisible(), 'téléphone : ← revient à la liste');

      await page.setViewportSize({ width: 1440, height: 900 });
      await page.click('#bouton-deconnexion');
      await page.waitForSelector('#ecran-connexion:not([hidden])');
      verifier((await page.locator('.ln-nom').count()) === 0, 'déconnexion : notes effacées de l\'écran');

      verifier(erreurs.length === 0, 'aucune erreur JS ' + erreurs.join(' | '));
    }

    console.log('Dossiers, tags, recherche et liens');
    {
      const { page, erreurs } = await nouvellePage(navigateur, base, { configure: true });
      const enregistre = () => page.waitForFunction(() => /● (enregistré \d|\d+ (lien|note))/.test(document.getElementById('etat-sauvegarde').textContent));
      const stockees = () => page.evaluate(() => JSON.parse(localStorage.getItem('faux-supabase-notes')));
      const parTitre = async (t) => (await stockees()).find((n) => n.title === t);
      const noms = () => page.locator('.ln-nom').allTextContents();
      const ouvrir = async (titre) => {
        const id = (await parTitre(titre)).id;
        await page.evaluate((i) => { location.hash = '#/note/' + i; }, id);
        await page.waitForFunction((t) => document.getElementById('note-titre').value === t, titre);
      };

      await page.goto(base + '/');
      await page.evaluate(() => {
        const moi = '00000000-0000-0000-0000-000000000001';
        const n = (i, title, folder, tags, content) => ({ id: '0000000' + i + '-0000-4000-8000-00000000000' + i, user_id: moi, title, folder, tags, content,
          created_at: '2026-11-0' + i + 'T10:00:00.000Z', updated_at: '2026-11-0' + i + 'T10:00:00.000Z' });
        localStorage.setItem('faux-supabase-notes', JSON.stringify([
          n(1, 'Cairn — plan V1', 'Travail/Projets', ['dev', 'idée'], '# Cairn\n\nVoir [[Modèle de données]] et [[Idée absente]].\n\n`[[pas un lien]]`'),
          n(2, 'Modèle de données', 'Travail/Projets', ['dev', 'supabase'], 'Une table notes.'),
          n(3, 'Réunion du 4 novembre', 'Travail/Réunions', [], 'Point sur [[cairn — plan v1|le plan]].'),
          n(4, 'Pain au levain', 'Perso', ['recette'], 'Farine, eau, sel.'),
        ]));
      });
      await page.fill('#connexion-email', 'essai@cairn.local');
      await page.fill('#connexion-mdp', 'secret');
      await page.click('#connexion-bouton');
      await page.waitForSelector('#ecran-appli:not([hidden])');
      await page.waitForFunction(() => document.querySelectorAll('.ln-nom').length === 4);

      const arbre = (await page.locator('#arbre').innerText()).replace(/\s+/g, ' ');
      verifier(/~\/ ?4/.test(arbre) && arbre.includes('Perso/') && arbre.includes('Travail/') && arbre.includes('Projets/') && arbre.includes('Réunions/'), 'arbre des dossiers (' + arbre + ')');
      verifier(arbre.includes('├─') && arbre.includes('└─'), 'arbre : préfixes ├─ └─');

      await page.click('#arbre button:has-text("Travail/")');
      verifier((await noms()).length === 3, 'filtre dossier Travail/ : 3 notes (sous-dossiers compris)');
      verifier((await page.textContent('#filtre-actif')) === '~/Travail/', 'en-tête : ~/Travail/');
      await page.click('#nuage-tags button:has-text("#dev")');
      verifier((await noms()).length === 2, 'filtre dossier + tag #dev : 2 notes');
      await page.click('#nuage-tags button:has-text("#dev")');
      verifier((await noms()).length === 3, 'second clic sur #dev : filtre retiré');
      await page.click('#bouton-effacer-filtres');
      verifier((await noms()).length === 4 && (await page.locator('#bouton-effacer-filtres').isHidden()), '× filtres : tout réaffiché');

      await page.fill('#recherche', 'LEVAIN');
      verifier((await noms()).join() === 'pain-au-levain.md', 'recherche dans le titre (casse ignorée)');
      await page.fill('#recherche', 'reunion');
      verifier((await noms()).join() === 'reunion-du-4-novembre.md', 'recherche sans accents');
      await page.fill('#recherche', 'farine');
      verifier((await noms()).join() === 'pain-au-levain.md', 'recherche dans le contenu');
      await page.press('#recherche', 'Escape');
      verifier((await noms()).length === 4, 'Échap vide la recherche');
      await page.keyboard.press('Control+k');
      verifier(await page.evaluate(() => document.activeElement.id === 'recherche'), 'Ctrl+K : curseur dans la recherche');
      await page.keyboard.press('Escape');

      await ouvrir('Cairn — plan V1');
      await page.click('.bascule [data-mode="split"]');
      await page.waitForSelector('#note-apercu a.lien-note');
      const idModele = (await parTitre('Modèle de données')).id;
      verifier((await page.getAttribute('#note-apercu a.lien-note:not(.lien-absent)', 'href')) === '#/note/' + idModele, '[[Modèle de données]] : lien vers la note');
      verifier((await page.locator('#note-apercu a.lien-absent').count()) === 1, '[[Idée absente]] : lien « à créer »');
      verifier((await page.locator('#note-apercu code a').count()) === 0, 'pas de lien dans le code en ligne');
      verifier((await page.textContent('#liens-entrants')).includes('reunion-du-4-novembre.md'), 'liens entrants : la réunion (alias [[…|le plan]], casse ignorée)');
      verifier((await page.textContent('#etat-liens')) === '← 1 lien entrant', 'barre d\'état : ← 1 lien entrant');
      verifier((await page.inputValue('#note-dossier')) === 'Travail/Projets' && (await page.locator('#note-tags .puce').count()) === 2, 'dossier et tags de la note affichés');

      await page.click('#note-apercu a.lien-note:not(.lien-absent)');
      await page.waitForFunction(() => document.getElementById('note-titre').value === 'Modèle de données');
      verifier(true, 'clic sur un lien : la note liée s\'ouvre');

      await ouvrir('Cairn — plan V1');
      await page.click('#note-apercu a.lien-absent');
      await page.waitForSelector('#dialogue[open]');
      verifier((await page.textContent('#dialogue-nom')) === 'idee-absente.md', 'lien absent : proposition de créer idee-absente.md');
      await page.click('#dialogue button[value="ok"]');
      await page.waitForFunction(() => document.getElementById('note-titre').value === 'Idée absente');
      verifier((await page.inputValue('#note-dossier')) === 'Travail/Projets', 'note créée dans le dossier de la note d\'origine');
      await ouvrir('Cairn — plan V1');
      await page.waitForFunction(() => document.querySelectorAll('#note-apercu a.lien-note').length === 2);
      verifier((await page.locator('#note-apercu a.lien-absent').count()) === 0, 'le lien n\'est plus « à créer »');

      // Dossier : saisie libre, casse d'un dossier existant reprise.
      await ouvrir('Pain au levain');
      await page.click('#note-dossier');
      await page.fill('#note-dossier', 'travail/pro');
      verifier((await page.locator('#suggestions-dossiers li').first().textContent()) === 'Travail/Projets/', 'suggestion de dossier existant');
      verifier((await page.locator('#suggestions-dossiers li').last().textContent()).includes('nouveau dossier'), 'proposition « nouveau dossier »');
      await page.fill('#note-dossier', 'travail/projets');
      await page.press('#note-dossier', 'Enter');
      await enregistre();
      verifier((await parTitre('Pain au levain')).folder === 'Travail/Projets', 'dossier enregistré avec la casse existante (Travail/Projets)');
      await page.click('#note-dossier');
      await page.fill('#note-dossier', ' Cuisine / Pains/ ');
      await page.press('#note-dossier', 'Enter');
      await enregistre();
      verifier((await parTitre('Pain au levain')).folder === 'Cuisine/Pains', 'nouveau dossier, chemin nettoyé (Cuisine/Pains)');
      await page.click('#note-dossier');
      await page.fill('#note-dossier', 'Perso');
      await page.press('#note-dossier', 'Escape');
      verifier((await page.inputValue('#note-dossier')) === 'Cuisine/Pains', 'Échap annule le changement de dossier');

      // Tags.
      await page.click('#bouton-ajout-tag');
      await page.fill('#note-tag', '#Pain');
      await page.press('#note-tag', 'Enter');
      await page.type('#note-tag', 'fait maison,');
      await page.press('#note-tag', 'Escape');
      await enregistre();
      verifier(JSON.stringify((await parTitre('Pain au levain')).tags) === '["recette","pain","fait-maison"]', 'tags ajoutés et nettoyés (#Pain → pain, « fait maison » → fait-maison)');
      await page.click('#note-tags button[aria-label="Retirer le tag recette"]');
      await enregistre();
      verifier(JSON.stringify((await parTitre('Pain au levain')).tags) === '["pain","fait-maison"]', 'tag retiré');

      // Renommer une note : proposer de mettre à jour les liens.
      await ouvrir('Modèle de données');
      await page.fill('#note-titre', 'Schéma de la base');
      await page.waitForSelector('#note-renommage:not([hidden])');
      verifier((await page.textContent('#renommage-texte')).includes('1 note cite [[Modèle de données]]'), 'renommage : « 1 note cite [[Modèle de données]] »');
      await page.click('#renommage-oui');
      await page.waitForFunction(() => /lien mis à jour/.test(document.getElementById('etat-sauvegarde').textContent));
      verifier((await parTitre('Cairn — plan V1')).content.includes('[[Schéma de la base]]'), 'lien mis à jour dans l\'autre note');

      // Palette « lier une note » : ouverte en tapant [[.
      await ouvrir('Cairn — plan V1');
      await page.click('.bascule [data-mode="edit"]');
      await page.focus('#note-contenu');
      await page.evaluate(() => { const z = document.getElementById('note-contenu'); z.selectionStart = z.selectionEnd = z.value.length; });
      await page.keyboard.type('\n[[');
      await page.waitForSelector('#palette-liens[open]');
      verifier(await page.evaluate(() => document.activeElement.id === 'palette-champ'), 'taper [[ ouvre la palette, curseur dans sa recherche');
      verifier((await page.textContent('#palette-compte')) === '4 sur 4 notes', 'palette : 4 sur 4 notes (la note ouverte exclue)');
      await page.keyboard.type('pai');
      verifier((await page.locator('#palette-resultats .pal-titre').first().textContent()) === 'Pain au levain', 'palette : « pai » → Pain au levain');
      verifier((await page.locator('#palette-resultats mark').first().textContent()) === 'Pai', 'palette : lettres trouvées surlignées');
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => !document.getElementById('palette-liens').open);
      verifier((await page.inputValue('#note-contenu')).endsWith('\n[[Pain au levain]]'), 'Entrée insère [[Pain au levain]] à la place de [[');
      verifier(await page.evaluate(() => document.activeElement.id === 'note-contenu'), 'retour dans l\'éditeur après le choix');
      await enregistre();

      await page.click('#bouton-lier');
      await page.waitForSelector('#palette-liens[open]');
      await page.keyboard.type('table notes');
      verifier((await page.locator('#palette-resultats .pal-bas').first().textContent()).includes('contenu : '), 'palette : recherche aussi dans le contenu (plusieurs mots)');
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.getElementById('palette-liens').open);
      verifier((await page.inputValue('#note-contenu')).endsWith('\n[[Pain au levain]]'), 'Échap : rien n\'est inséré');

      await page.keyboard.press('Control+Shift+L');
      await page.waitForSelector('#palette-liens[open]');
      await page.click('#palette-filtres [data-filtre="dossier"]');
      const memeDossier = await page.locator('#palette-resultats .pal-titre').allTextContents();
      verifier(memeDossier.sort().join() === 'Idée absente,Schéma de la base', 'Ctrl+Maj+L, filtre « même dossier » (' + memeDossier.join(', ') + ')');
      await page.click('#palette-filtres [data-filtre="partout"]');
      await page.fill('#palette-champ', 'Zorglub');
      verifier((await page.locator('#palette-resultats li').count()) === 1 && (await page.textContent('#palette-resultats li')).includes('nouvelle note « Zorglub »'), 'palette : proposer un lien vers une nouvelle note');
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => !document.getElementById('palette-liens').open);
      verifier((await page.inputValue('#note-contenu')).endsWith('[[Pain au levain]][[Zorglub]]'), 'lien vers une note à créer inséré');
      await enregistre();

      // Renommer un dossier.
      await page.click('#arbre button:has-text("Travail/")');
      await page.click('#arbre .bouton-mv');
      await page.waitForSelector('#dialogue[open]');
      await page.fill('#dialogue-champ', 'Boulot');
      await page.press('#dialogue-champ', 'Enter');
      await page.waitForFunction(() => /déplacée/.test(document.getElementById('etat-sauvegarde').textContent));
      const dossiers = (await stockees()).map((n) => n.folder).sort();
      verifier(JSON.stringify(dossiers) === '["Boulot/Projets","Boulot/Projets","Boulot/Projets","Boulot/Réunions","Cuisine/Pains"]', 'dossier renommé, sous-dossiers compris (' + dossiers.join(', ') + ')');
      verifier((await page.textContent('#filtre-actif')) === '~/Boulot/' && !(await page.textContent('#arbre')).includes('Travail'), 'arbre et filtre suivent le renommage');

      // Téléphone.
      await page.setViewportSize({ width: 390, height: 844 });
      await page.evaluate(() => { location.hash = '#/'; });
      await page.waitForFunction(() => document.getElementById('ecran-appli').dataset.vue === 'liste');
      verifier(await page.locator('.nav-mobile').isVisible(), 'téléphone : fil d\'Ariane visible');
      verifier((await page.locator('#ariane .miette').allTextContents()).join('') === '~/Boulot/', 'téléphone : ~/ › Boulot/');
      verifier((await page.locator('#sous-dossiers button').count()) === 2, 'téléphone : sous-dossiers Projets/ et Réunions/');
      await page.click('#ariane .miette >> nth=0');
      verifier((await noms()).length === 5, 'téléphone : ~/ revient à la racine');
      await page.click('.liste-notes a >> nth=0');
      await page.waitForSelector('#note:not([hidden])');
      const largeur = await page.evaluate(() => document.documentElement.scrollWidth);
      verifier(largeur <= 390, 'téléphone : note sans défilement horizontal (' + largeur + ' px)');
      if (process.argv.includes('--captures')) {
        const dossier = process.argv[process.argv.indexOf('--captures') + 1] || '.';
        await page.screenshot({ path: path.join(dossier, 'etape4-mobile-note.png') });
        await page.evaluate(() => { location.hash = '#/'; });
        await page.click('#ariane .miette >> nth=0');
        await page.screenshot({ path: path.join(dossier, 'etape4-mobile-liste.png') });
        await page.setViewportSize({ width: 1440, height: 900 });
        await ouvrir('Cairn — plan V1');
        await page.click('.bascule [data-mode="split"]');
        await page.screenshot({ path: path.join(dossier, 'etape4-desktop.png') });
      }

      verifier(erreurs.length === 0, 'aucune erreur JS ' + erreurs.join(' | '));
    }

    console.log('Code coloré et mermaid');
    {
      const { page, erreurs } = await nouvellePage(navigateur, base, { configure: true });
      await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base });
      await page.goto(base + '/');
      await page.fill('#connexion-email', 'essai@cairn.local');
      await page.fill('#connexion-mdp', 'secret');
      await page.click('#connexion-bouton');
      await page.waitForSelector('#ecran-appli:not([hidden])');
      await page.click('#bouton-nouvelle');
      await page.waitForSelector('#note:not([hidden])');
      await page.click('.bascule [data-mode="split"]');
      const md = [
        '```js', 'async function sauver(id) {', '  // une seule à la fois', "  return client.from('notes').eq('id', id) + 5000;", '}', '```', '',
        '```', 'SELECT nom, prix FROM produits WHERE prix > 10 ORDER BY nom;', '```', '',
        '```mermaid', 'flowchart LR', '  A[frappe] --> B{supabase}', '  B -->|ok| C[enregistré]', '  B -->|erreur| D[réessai]', '```', '',
        '```mermaid', 'ceci n est pas un diagramme', '```',
      ].join('\n');
      // Lignes vides dans un bloc de code : l'éditeur doit rester aligné ligne par ligne.
      await page.click('.bascule [data-mode="edit"]');
      // (note plus haute que l'écran, pour que la zone de saisie ait la hauteur de son contenu)
      await page.fill('#note-contenu', '```cs\nint banane = 2;\n\n\n\nd\n```\nfin' + '\nligne'.repeat(40));
      const alignement = await page.evaluate(() => {
        const lignes = [...document.querySelectorAll('#editeur-fond .ed-ligne')];
        const hauteurs = lignes.map((l) => l.getBoundingClientRect().height);
        const zone = document.getElementById('note-contenu');
        return { nulles: hauteurs.filter((h) => h < 1).length, n: lignes.length,
          ecart: Math.abs(document.getElementById('editeur-fond').offsetHeight - zone.scrollHeight) };
      });
      verifier(alignement.n === 48 && alignement.nulles === 0 && alignement.ecart <= 2,
        'lignes vides dans un bloc de code : hauteur gardée, éditeur aligné (' + JSON.stringify(alignement) + ')');
      await page.click('.bascule [data-mode="split"]');

      // Défilement lié : la section en haut de l'éditeur est aussi en haut de l'aperçu, dans les deux sens.
      const sections = [];
      for (let i = 1; i <= 30; i++) sections.push('## Section ' + i, '', ('mot ' + i + ' ').repeat(i % 3 ? 8 : 60), '', '- a\n- b\n- c', '');
      await page.fill('#note-contenu', sections.join('\n'));
      await page.waitForFunction(() => document.querySelectorAll('#note-apercu h2').length === 30);
      const decalage = async (depuis, numero) => page.evaluate(async ([depuis, numero]) => {
        const ed = document.querySelector('.panneau-edition'), ap = document.querySelector('.panneau-apercu');
        const haut = (el, p) => el.getBoundingClientRect().top - p.getBoundingClientRect().top;
        const ligne = [...document.querySelectorAll('#editeur-fond .ed-ligne')].find((l) => l.textContent === '## Section ' + numero);
        const titre = [...document.querySelectorAll('#note-apercu h2')].find((h) => h.textContent === 'Section ' + numero);
        if (depuis === 'edition') ed.scrollTop += haut(ligne, ed); else ap.scrollTop += haut(titre, ap);
        await new Promise((r) => setTimeout(r, 200));
        return Math.round(depuis === 'edition' ? haut(titre, ap) : haut(ligne, ed));
      }, [depuis, numero]);
      const versApercu = await decalage('edition', 17);
      await page.waitForTimeout(200);
      const versEditeur = await decalage('apercu', 8);
      verifier(Math.abs(versApercu) <= 4 && Math.abs(versEditeur) <= 4,
        'split : l\'aperçu suit le défilement de l\'éditeur, et l\'inverse (écarts ' + versApercu + ' et ' + versEditeur + ' px)');

      await page.fill('#note-contenu', md);
      await page.waitForSelector('#note-apercu .hljs-keyword', { timeout: 15000 });
      verifier(true, 'code coloré (highlight.js chargé à la demande)');
      const langues = await page.locator('#note-apercu .bloc-langue').allTextContents();
      verifier(langues[0] === 'js' && langues[1] === 'sql', 'langage affiché, deviné pour le bloc sans langage (' + langues.join(', ') + ')');
      verifier((await page.locator('#note-apercu .hljs-string').count()) >= 2 && (await page.locator('#note-apercu .hljs-comment').count()) === 1 && (await page.locator('#note-apercu .hljs-number').count()) >= 1, 'chaînes, commentaire et nombres colorés');
      const couleur = await page.evaluate(() => getComputedStyle(document.querySelector('#note-apercu .hljs-keyword')).color);
      verifier(couleur === 'rgb(240, 180, 90)', 'mots-clés en ambre (' + couleur + ')');

      await page.click('#note-apercu .bouton-copier >> nth=0');
      await page.waitForFunction(() => document.querySelector('#note-apercu .bouton-copier').textContent === 'copié ✓');
      const copie = await page.evaluate(() => navigator.clipboard.readText());
      verifier(copie.startsWith('async function sauver(id) {') && copie.includes('+ 5000;'), 'bouton copier : le code brut est copié');

      await page.waitForSelector('#note-apercu .mermaid-svg svg', { timeout: 30000 });
      verifier(true, 'diagramme mermaid dessiné (chargé à la demande)');
      const textes = await page.locator('#note-apercu .mermaid-svg svg').innerHTML();
      const largeurSvg = await page.evaluate(() => document.querySelector('#note-apercu .mermaid-svg svg').getBoundingClientRect().width);
      verifier(largeurSvg > 500, 'diagramme à sa taille réelle, pas rétréci (' + Math.round(largeurSvg) + ' px)');
      verifier(textes.includes('frappe') && textes.includes('enregistré') && textes.includes('réessai'), 'étiquettes du diagramme présentes');
      verifier((await page.locator('#note-apercu .mermaid-svg script, #note-apercu .mermaid-svg foreignObject').count()) === 0, 'SVG assaini (ni script ni foreignObject)');
      await page.waitForSelector('#note-apercu .bloc-mermaid-erreur', { timeout: 15000 });
      verifier((await page.textContent('#note-apercu .bloc-mermaid-erreur')).startsWith('mermaid : '), 'diagramme invalide : message d\'erreur à sa place');
      verifier(await page.evaluate(() => !document.querySelector('body > [id^="dcairn-mermaid"], body > svg[id^="cairn-mermaid"]')), 'pas de reste de mermaid dans la page');

      await page.click('#ecran-appli [data-action="theme"]');
      await page.waitForFunction(() => getComputedStyle(document.querySelector('#note-apercu .hljs-keyword')).color === 'rgb(138, 90, 18)', null, { timeout: 15000 });
      verifier(true, 'thème clair : couleurs du code adaptées');
      await page.waitForSelector('#note-apercu .mermaid-svg svg', { timeout: 15000 });
      verifier(true, 'thème clair : diagramme redessiné');
      if (process.argv.includes('--captures')) {
        const dossier = process.argv[process.argv.indexOf('--captures') + 1] || '.';
        await page.click('#ecran-appli [data-action="theme"]');
        await page.waitForSelector('#note-apercu .mermaid-svg svg', { timeout: 15000 });
        await page.waitForTimeout(300);
        await page.screenshot({ path: path.join(dossier, 'code-mermaid.png') });
        await page.click('#bouton-lier');
        await page.waitForSelector('#palette-liens[open]');
        await page.setViewportSize({ width: 390, height: 844 });
        await page.screenshot({ path: path.join(dossier, 'palette-mobile.png') });
        await page.keyboard.press('Escape');
      }
      verifier(erreurs.length === 0, 'aucune erreur JS ' + erreurs.join(' | '));
    }

    console.log('Export et import');
    {
      const { page, erreurs } = await nouvellePage(navigateur, base, { configure: true });
      const JSZip = require(path.join(routesBibliotheques.find((r) => r.url && r.url.includes('jszip')).dossier, 'dist/jszip.min.js'));
      const stockees = () => page.evaluate(() => JSON.parse(localStorage.getItem('faux-supabase-notes')));
      const parTitre = async (t) => (await stockees()).find((n) => n.title === t);
      const menu = async (action) => { await page.click('#bouton-menu'); await page.click(`#menu-principal [data-menu="${action}"]`); };

      await page.goto(base + '/');
      await page.evaluate(() => {
        const moi = '00000000-0000-0000-0000-000000000001';
        const n = (i, title, folder, tags, content) => ({ id: '0000000' + i + '-0000-4000-8000-00000000000' + i, user_id: moi, title, folder, tags, content,
          created_at: '2026-11-0' + i + 'T10:00:00.000Z', updated_at: '2026-11-0' + i + 'T10:00:00.000Z' });
        localStorage.setItem('faux-supabase-notes', JSON.stringify([
          n(1, 'Cairn — plan V1', 'Travail/Projets', ['dev'], '# Cairn\n\nVoir [[Modèle de données]].'),
          n(2, 'Modèle de données', 'Travail/Projets', ['dev'], 'Une table notes.'),
          n(3, 'Pain au levain', 'Perso', ['recette'], 'Farine, eau, sel.\n\n---\n\nTitre: "piège": oui'),
        ]));
      });
      await page.fill('#connexion-email', 'essai@cairn.local');
      await page.fill('#connexion-mdp', 'secret');
      await page.click('#connexion-bouton');
      await page.waitForFunction(() => document.querySelectorAll('.ln-nom').length === 3);

      // En-tête : aller-retour avec des caractères piégeux, et en-têtes écrits à la main.
      const allerRetour = await page.evaluate(async () => {
        const m = await import('/js/export.js');
        const note = { id: 'x', title: 'Titre: "guillemets" #1 — été', folder: 'A/B', tags: ['dev', 'idée'], content: '---\nnon: en-tête\n---\ncorps', created_at: 'c', updated_at: 'u' };
        const lu = m.lireMarkdown(m.versMarkdown(note));
        const main = m.lireMarkdown('---\ntitle: Ma note\nfolder: perso/idées\ntags:\n  - un\n  - "deux"\n---\nTexte');
        const crochets = m.lireMarkdown("---\ntitle: 'L''été'\ntags: [a, 'b c']\n---\n");
        const sans = m.noteDuFichier({ chemin: 'perso/journal.md', texte: '# Journal\nRien.' });
        return { lu, main, crochets, sans };
      });
      verifier(allerRetour.lu.meta.title === 'Titre: "guillemets" #1 — été' && allerRetour.lu.meta.folder === 'A/B'
        && JSON.stringify(allerRetour.lu.meta.tags) === '["dev","idée"]' && allerRetour.lu.contenu === '---\nnon: en-tête\n---\ncorps', 'en-tête : aller-retour exact (guillemets, deux-points, accents, --- dans le contenu)');
      verifier(allerRetour.main.meta.title === 'Ma note' && allerRetour.main.meta.folder === 'perso/idées' && JSON.stringify(allerRetour.main.meta.tags) === '["un","deux"]', 'en-tête écrit à la main (liste en « - »)');
      verifier(allerRetour.crochets.meta.title === "L'été" && JSON.stringify(allerRetour.crochets.meta.tags) === '["a","b c"]', 'en-tête avec apostrophes et liste [a, \'b c\']');
      verifier(allerRetour.sans.title === 'journal' && allerRetour.sans.folder === 'perso' && allerRetour.sans.content === '# Journal\nRien.', 'fichier sans en-tête : titre et dossier tirés du chemin');

      // Export.
      const [telechargement] = await Promise.all([page.waitForEvent('download'), menu('export')]);
      verifier(/^cairn-\d{4}-\d{2}-\d{2}\.zip$/.test(telechargement.suggestedFilename()), 'export : ' + telechargement.suggestedFilename());
      const zipExport = await JSZip.loadAsync(fs.readFileSync(await telechargement.path()));
      const noms = Object.keys(zipExport.files).filter((n) => !zipExport.files[n].dir).sort();
      verifier(JSON.stringify(noms) === '["Perso/pain-au-levain.md","Travail/Projets/cairn-plan-v1.md","Travail/Projets/modele-de-donnees.md"]', 'export : un .md par note, rangé par dossier (' + noms.join(', ') + ')');
      const texteModele = await zipExport.file('Travail/Projets/modele-de-donnees.md').async('string');
      verifier(texteModele.startsWith('---\nid: 00000002-0000-4000-8000-000000000002\ntitle: "Modèle de données"\nfolder: "Travail/Projets"\ntags: ["dev"]\n'), 'export : en-tête id, title, folder, tags');
      await page.waitForFunction(() => /exportée/.test(document.getElementById('etat-sauvegarde').textContent));

      // On modifie « Modèle de données » dans Cairn après l'export : il sera en conflit.
      const idModele = (await parTitre('Modèle de données')).id;
      await page.evaluate((i) => { location.hash = '#/note/' + i; }, idModele);
      await page.waitForFunction(() => document.getElementById('note-titre').value === 'Modèle de données');
      await page.fill('#note-contenu', 'Une table notes, modifiée dans Cairn.');
      await page.waitForFunction(() => /● enregistré \d/.test(document.getElementById('etat-sauvegarde').textContent));

      // Le zip « retouché par Claude ».
      const zip = new JSZip();
      const plan = await zipExport.file('Travail/Projets/cairn-plan-v1.md').async('string');
      zip.file('Travail/Projets/cairn-plan-v1.md', plan.replace('tags: ["dev"]', 'tags: ["dev", "Relu"]').replace('Voir [[Modèle de données]].', 'Voir [[Modèle de données]]. Retouché par Claude.'));
      zip.file('Travail/Projets/modele-de-donnees.md', texteModele.replace('Une table notes.', 'Une table notes (version du fichier).'));
      zip.file('Perso/pain-au-levain.md', await zipExport.file('Perso/pain-au-levain.md').async('string'));
      zip.file('idees/liste-de-courses.md', '---\ntitle: Liste de courses\ntags:\n  - courses\n  - Drive\n---\n- pain\n- lait');
      zip.file('perso/journal.md', '# Journal\nRien.');
      zip.file('images/photo.png', 'pas une note');
      zip.file('__MACOSX/._journal.md', 'ignoré');
      const tampon = await zip.generateAsync({ type: 'nodebuffer' });

      await page.setInputFiles('#import-fichier', { name: 'cairn-retouche.zip', mimeType: 'application/zip', buffer: tampon });
      await page.waitForSelector('#import-resume:not([hidden])');
      const compte = async (id) => Number(await page.textContent('#import-n-' + id));
      verifier(await compte('nouvelles') === 2 && await compte('modifiees') === 1 && await compte('conflits') === 1,
        'import : 2 nouvelles, 1 modifiée, 1 conflit');
      const autres = await page.textContent('#import-autres');
      verifier(autres.includes('1 identique') && autres.includes('1 fichier non Markdown'), 'import : identiques et fichiers non Markdown signalés (' + autres + ')');
      verifier((await page.textContent('#import-ok')) === 'importer 3 notes', 'bouton : importer 3 notes (le conflit garde Cairn par défaut)');

      await page.click('#import-conflits .bouton-lien');
      await page.waitForSelector('#import-detail:not([hidden])');
      verifier((await page.textContent('#import-detail-nom')) === 'Travail/Projets/modele-de-donnees.md', 'détail du conflit : la bonne note');
      const propres = await page.locator('#import-versions .ligne-propre').allTextContents();
      verifier(propres.some((t) => t.includes('modifiée dans Cairn')) && propres.some((t) => t.includes('version du fichier')), 'détail : les lignes différentes sont surlignées');
      await page.click('#import-detail-choix button:has-text("garder les deux")');
      await page.waitForSelector('#import-resume:not([hidden])');
      verifier((await page.getAttribute('#import-conflits button[aria-pressed="true"]', 'aria-pressed')) === 'true'
        && (await page.textContent('#import-conflits button[aria-pressed="true"]')) === 'les deux', 'retour au récapitulatif, choix « les deux » retenu');
      verifier((await page.textContent('#import-ok')) === 'importer 4 notes', 'bouton : importer 4 notes');

      const [sauvegarde] = await Promise.all([page.waitForEvent('download'), page.click('#import-ok')]);
      verifier(/^cairn-.*\.zip$/.test(sauvegarde.suggestedFilename()), 'sauvegarde .zip téléchargée avant l\'import');
      await page.waitForFunction(() => document.getElementById('import-progression').textContent.startsWith('✓'));
      verifier((await page.textContent('#import-progression')).startsWith('✓ 3 notes créées, 1 note mise à jour.'), 'résultat : ' + (await page.textContent('#import-progression')).split('\n')[0]);
      await page.click('#import-fermer');

      const planApres = await parTitre('Cairn — plan V1');
      verifier(planApres.content.includes('Retouché par Claude.') && JSON.stringify(planApres.tags) === '["dev","relu"]', 'note modifiée : contenu et tags du fichier (tag nettoyé « relu »)');
      verifier((await parTitre('Modèle de données')).content === 'Une table notes, modifiée dans Cairn.', 'conflit : la version de Cairn est gardée');
      verifier((await parTitre('Modèle de données (import)'))?.content === 'Une table notes (version du fichier).', 'conflit : la version du fichier en copie « (import) »');
      const courses = await parTitre('Liste de courses');
      verifier(courses && courses.folder === 'idees' && JSON.stringify(courses.tags) === '["courses","drive"]', 'nouvelle note : dossier et tags de l\'en-tête');
      verifier((await parTitre('journal'))?.folder === 'perso', 'nouvelle note sans en-tête : titre et dossier du chemin');
      verifier((await page.locator('.ln-nom').count()) === 6, 'la liste montre les 6 notes après l\'import');
      verifier((await page.textContent('#note-contenu')) === 'Une table notes, modifiée dans Cairn.' || (await page.inputValue('#note-contenu')) === 'Une table notes, modifiée dans Cairn.', 'la note ouverte reste à jour');

      // Réimporter le même zip : tout est identique sauf ce qui a bougé.
      await page.setInputFiles('#import-fichier', { name: 'cairn-retouche.zip', mimeType: 'application/zip', buffer: tampon });
      await page.waitForSelector('#import-resume:not([hidden])');
      verifier(await compte('nouvelles') === 0, 'réimport : plus aucune nouvelle (titres déjà présents → conflits ou identiques)');
      await page.click('#import-annuler');

      // Téléphone : menu ⋯ avec thème et logout.
      await page.setViewportSize({ width: 390, height: 844 });
      await page.evaluate(() => { location.hash = '#/'; });
      verifier(!(await page.locator('.barre-haut #bouton-deconnexion').isVisible()), 'téléphone : logout rangé dans le menu');
      await page.click('#bouton-menu');
      verifier(await page.locator('#menu-principal [data-menu="logout"]').isVisible() && await page.locator('#menu-principal [data-menu="theme"]').isVisible(), 'téléphone : menu ⋯ avec thème et logout');
      await page.click('#menu-principal [data-menu="theme"]');
      verifier((await page.getAttribute('html', 'data-theme')) === 'light', 'téléphone : thème changé depuis le menu');
      if (process.argv.includes('--captures')) {
        const dossier = process.argv[process.argv.indexOf('--captures') + 1] || '.';
        await page.click('#ecran-appli .barre-haut [data-action="theme"]', { force: true }).catch(() => {});
        await page.evaluate(() => document.querySelector('.barre-haut [data-action="theme"]').click());
        await page.setInputFiles('#import-fichier', { name: 'cairn-retouche.zip', mimeType: 'application/zip', buffer: tampon });
        await page.waitForSelector('#import-resume:not([hidden])');
        await page.screenshot({ path: path.join(dossier, 'import-mobile.png') });
        await page.click('#import-conflits .bouton-lien');
        await page.screenshot({ path: path.join(dossier, 'import-detail-mobile.png') });
        await page.keyboard.press('Escape');
      }
      verifier(erreurs.length === 0, 'aucune erreur JS ' + erreurs.join(' | '));
    }

    console.log('Hors ligne et synchronisation');
    {
      const { page, erreurs } = await nouvellePage(navigateur, base, { configure: true });
      const contexte = page.context();
      const serveur = () => page.evaluate(() => JSON.parse(localStorage.getItem('faux-supabase-notes')));
      const surServeur = async (t) => (await serveur()).find((n) => n.title === t);
      const reseau = () => page.textContent('#etat-reseau');
      const couper = async () => { await page.evaluate(() => localStorage.setItem('faux-supabase-panne', '1')); await contexte.setOffline(true); };
      const retablir = async () => { await contexte.setOffline(false); await page.evaluate(() => { localStorage.removeItem('faux-supabase-panne'); window.dispatchEvent(new Event('online')); }); };
      const ouvrir = async (titre) => {
        const id = await page.evaluate((t) => [...document.querySelectorAll('.liste-notes a')].find((a) => a.querySelector('.ln-nom').title === t).dataset.id, titre);
        await page.evaluate((i) => { location.hash = '#/note/' + i; }, id);
        await page.waitForFunction((t) => document.getElementById('note-titre').value === t, titre);
      };

      await page.goto(base + '/');
      await page.evaluate(() => {
        const moi = '00000000-0000-0000-0000-000000000001';
        const n = (i, title, content) => ({ id: '0000000' + i + '-0000-4000-8000-00000000000' + i, user_id: moi, title, folder: '', tags: [], content,
          created_at: '2026-11-0' + i + 'T10:00:00.000Z', updated_at: '2026-11-0' + i + 'T10:00:00.000Z' });
        localStorage.setItem('faux-supabase-notes', JSON.stringify([n(1, 'Courses', 'pain'), n(2, 'Plan', 'version 1')]));
      });
      await page.fill('#connexion-email', 'essai@cairn.local');
      await page.fill('#connexion-mdp', 'secret');
      await page.click('#connexion-bouton');
      await page.waitForFunction(() => document.querySelectorAll('.ln-nom').length === 2);
      verifier(await page.locator('#etat-reseau').isHidden(), 'en ligne, rien en attente : indicateur caché');

      await couper();
      await page.waitForFunction(() => /hors ligne/.test(document.getElementById('etat-reseau').textContent));
      verifier(true, 'coupure : « ○ hors ligne » dans la barre d\'état');

      // Hors ligne : créer, modifier.
      await page.click('#bouton-nouvelle');
      await page.waitForSelector('#note:not([hidden])');
      await page.fill('#note-titre', 'Note du train');
      await page.press('#note-titre', 'Enter');
      await page.fill('#note-contenu', 'écrite sans réseau');
      await page.waitForFunction(() => /enregistré sur l'appareil/.test(document.getElementById('etat-sauvegarde').textContent));
      await ouvrir('Courses');
      await page.fill('#note-contenu', 'pain, lait');
      await page.waitForFunction(() => /2 en attente/.test(document.getElementById('etat-reseau').textContent));
      verifier((await page.locator('.ln-attente').count()) === 2, 'hors ligne : 2 notes en attente, marquées •');
      verifier(!(await surServeur('Note du train')) && (await surServeur('Courses')).content === 'pain', 'rien n\'est parti vers le serveur');

      // Conflit préparé : « Plan » modifiée sur l'appareil, et ailleurs sur le serveur.
      await ouvrir('Plan');
      await page.fill('#note-contenu', 'version 2 (téléphone)');
      await page.waitForFunction(() => /3 en attente/.test(document.getElementById('etat-reseau').textContent));
      await page.evaluate(() => {
        const notes = JSON.parse(localStorage.getItem('faux-supabase-notes'));
        const plan = notes.find((n) => n.title === 'Plan');
        plan.content = 'version 2 (ordinateur)';
        plan.updated_at = new Date(Date.now() + 1000).toISOString();
        localStorage.setItem('faux-supabase-notes', JSON.stringify(notes));
      });

      // Recharger avec le serveur toujours injoignable : les notes viennent de la copie locale.
      // (Recharger la page elle-même sans réseau demande le service worker : testé plus bas.)
      await page.evaluate(() => { location.hash = '#/'; });
      await contexte.setOffline(false);
      await page.reload();
      await page.waitForSelector('#ecran-appli:not([hidden])');
      await page.waitForFunction(() => document.querySelectorAll('.ln-nom').length === 3);
      verifier((await page.locator('.ln-attente').count()) === 3, 'rechargé, serveur injoignable : 3 notes (dont la nouvelle), toujours en attente');

      // Retour du réseau.
      await retablir();
      await page.waitForSelector('#dialogue-sync[open]', { timeout: 10000 });
      verifier((await page.textContent('#sync-nom')) === 'plan.md a changé ailleurs', 'conflit : la fenêtre s\'ouvre d\'elle-même');
      const propres = await page.locator('#sync-versions .ligne-propre').allTextContents();
      verifier(propres.some((t) => t.includes('téléphone')) && propres.some((t) => t.includes('ordinateur')), 'conflit : les deux versions comparées');
      verifier((await surServeur('Courses')).content === 'pain, lait' && (await surServeur('Note du train'))?.content === 'écrite sans réseau', 'synchronisé : modification et création envoyées');
      const idLocal = await page.evaluate(() => [...document.querySelectorAll('.liste-notes a')].find((a) => a.querySelector('.ln-nom').title === 'Note du train').dataset.id);
      verifier((await surServeur('Note du train')).id === idLocal, 'la note créée hors ligne garde son identifiant');
      await page.click('#sync-choix button:has-text("les deux")');
      await page.waitForFunction(() => !document.getElementById('dialogue-sync').open);
      verifier((await surServeur('Plan')).content === 'version 2 (ordinateur)' && (await surServeur('Plan (appareil)'))?.content === 'version 2 (téléphone)', 'conflit « les deux » : version du serveur gardée, celle de l\'appareil en copie');
      await page.waitForFunction(() => document.querySelectorAll('.ln-nom').length === 4 && !document.querySelector('.ln-attente'));
      verifier(true, 'liste à jour, plus rien en attente');
      const attente = await page.evaluate(() => new Promise((ok) => {
        const r = indexedDB.open('cairn');
        r.onsuccess = () => { const q = r.result.transaction('attente').objectStore('attente').count(); q.onsuccess = () => ok(q.result); };
      }));
      verifier(attente === 0, 'file d\'attente locale vide');

      // Déconnexion avec une modification hors ligne : avertissement.
      await couper();
      await ouvrir('Courses');
      await page.fill('#note-contenu', 'pain, lait, œufs');
      await page.waitForFunction(() => /1 en attente/.test(document.getElementById('etat-reseau').textContent));
      await page.evaluate(() => document.getElementById('bouton-deconnexion').click());
      await page.waitForSelector('#dialogue[open]');
      verifier((await page.textContent('#dialogue-texte')).includes('pas encore été envoyée'), 'déconnexion : avertissement des modifications en attente');
      await page.click('#dialogue button[value="annuler"]');
      verifier(await page.locator('#ecran-appli').isVisible(), 'déconnexion annulée : on reste connecté');
      await retablir();
      await page.waitForFunction(() => !document.querySelector('.ln-attente'), null, { timeout: 10000 });
      verifier((await surServeur('Courses')).content === 'pain, lait, œufs', 'retour du réseau : envoyée');
      verifier(erreurs.length === 0, 'aucune erreur JS ' + erreurs.join(' | '));
    }

    console.log('Application installable');
    {
      // Toute nouvelle page de l'application doit être dans la liste du service worker.
      const sw = fs.readFileSync(path.join(RACINE, 'sw.js'), 'utf8');
      const absents = fs.readdirSync(path.join(RACINE, 'js')).filter((f) => !sw.includes("'js/" + f + "'"));
      verifier(absents.length === 0, 'sw.js : tous les fichiers de js/ sont dans la coquille' + (absents.length ? ' (manquent : ' + absents.join(', ') + ')' : ''));
      const manifeste = JSON.parse(fs.readFileSync(path.join(RACINE, 'manifest.webmanifest'), 'utf8'));
      const icones = manifeste.icons.filter((i) => i.type === 'image/png');
      verifier(manifeste.display === 'standalone' && icones.some((i) => i.sizes === '192x192') && icones.some((i) => i.sizes === '512x512')
        && icones.every((i) => fs.existsSync(path.join(RACINE, i.src))), 'manifeste : plein écran, icônes 192 et 512 présentes');

      const { page, erreurs } = await nouvellePage(navigateur, base, { configure: true, sw: true });
      await page.goto(base + '/');
      await page.fill('#connexion-email', 'essai@cairn.local');
      await page.fill('#connexion-mdp', 'secret');
      await page.click('#connexion-bouton');
      await page.waitForSelector('#ecran-appli:not([hidden])');
      await page.click('#bouton-nouvelle');
      await page.waitForSelector('#note:not([hidden])');
      await page.fill('#note-titre', 'Note en cache');
      await page.waitForFunction(() => /● enregistré \d/.test(document.getElementById('etat-sauvegarde').textContent));
      const etatSw = await page.evaluate(async () => {
        const reg = await navigator.serviceWorker.ready;
        const cles = await caches.keys();
        const app = await caches.open(cles.find((k) => k.endsWith('-app')));
        const urls = (await app.keys()).map((r) => new URL(r.url).pathname);
        return { actif: Boolean(reg.active), urls };
      });
      verifier(etatSw.actif && etatSw.urls.includes('/index.html') && etatSw.urls.includes('/js/ui.js') && etatSw.urls.includes('/css/style.css'), 'service worker actif, coquille en cache');
      await page.reload();          // la page est maintenant contrôlée : les bibliothèques du CDN passent par le cache
      await page.waitForSelector('#ecran-appli:not([hidden])');
      await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
      await page.context().setOffline(true);
      await page.evaluate(() => localStorage.setItem('faux-supabase-panne', '1'));
      await page.reload();
      await page.waitForSelector('#ecran-appli:not([hidden])', { timeout: 15000 });
      await page.waitForFunction(() => [...document.querySelectorAll('.ln-nom')].some((n) => n.title === 'Note en cache'));
      verifier(true, 'sans réseau : l\'application s\'ouvre et montre les notes');
      verifier(/hors ligne/.test(await page.textContent('#etat-reseau')), 'sans réseau : « hors ligne » affiché');
      verifier(erreurs.length === 0, 'aucune erreur JS ' + erreurs.join(' | '));
    }

    console.log('Proposition d\'installation (iPhone)');
    {
      const { page, erreurs } = await nouvellePage(navigateur, base, { configure: true });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'userAgent', { get: () => 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1' });
      });
      await page.goto(base + '/');
      await page.fill('#connexion-email', 'essai@cairn.local');
      await page.fill('#connexion-mdp', 'secret');
      await page.click('#connexion-bouton');
      await page.waitForSelector('#carte-installation:not([hidden])', { timeout: 8000 });
      verifier((await page.textContent('#carte-installation-texte')).includes('Partager') && (await page.textContent('#carte-installer')) === 'compris', 'iPhone : carte avec la consigne « Partager › Sur l\'écran d\'accueil »');
      if (process.argv.includes('--captures')) {
        await page.screenshot({ path: path.join(process.argv[process.argv.indexOf('--captures') + 1] || '.', 'installation-iphone.png') });
      }
      await page.click('#bouton-menu');
      verifier(await page.locator('#menu-installer').isVisible(), 'iPhone : « installer Cairn » dans le menu ⋯');
      await page.keyboard.press('Escape');
      await page.click('#carte-plus-tard');
      verifier(await page.locator('#carte-installation').isHidden(), '« plus tard » referme la carte');
      await page.reload();
      await page.waitForSelector('#ecran-appli:not([hidden])');
      await page.waitForTimeout(3500);
      verifier(await page.locator('#carte-installation').isHidden(), '« plus tard » : la carte ne revient pas au rechargement');
      verifier(erreurs.length === 0, 'aucune erreur JS ' + erreurs.join(' | '));
    }
  } finally {
    await navigateur.close();
    srv.close();
  }

  console.log(echecs ? `\n${echecs} échec(s)` : '\nTout est bon.');
  process.exit(echecs ? 1 : 0);
})();
