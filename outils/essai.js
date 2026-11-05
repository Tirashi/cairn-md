// Essai de bout en bout : node outils/essai.js [--captures <dossier>]
// Sert le dépôt en local, remplace supabase-js (CDN) par outils/faux-supabase.js,
// sert marked et DOMPurify depuis le registre npm (mis en cache dans outils/.cache/),
// et vérifie connexion, thème, notes (création, édition, sauvegarde, suppression), aperçu assaini.
const http = require('http');
const https = require('https');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
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
  for (const [motif, paquet, fichier] of BIBLIOTHEQUES) {
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
    if (fichier) routes.push({ url: `https://${m[0]}`, corps: fs.readFileSync(path.join(dossier, fichier), 'utf8') });
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

async function nouvellePage(navigateur, base, { configure, schema = 'dark' }) {
  const contexte = await navigateur.newContext({ colorScheme: schema });
  const page = await contexte.newPage();
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(e.message));
  await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
  await page.route('https://fonts.gstatic.com/**', (r) => r.abort());
  await page.route('https://cdn.jsdelivr.net/npm/@supabase/**', (r) =>
    r.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(path.join(__dirname, 'faux-supabase.js'), 'utf8') }));
  for (const route of routesBibliotheques) {
    if (route.url) {
      await page.route(route.url, (r) => r.fulfill({ contentType: 'text/javascript', body: route.corps }));
    } else {
      await page.route(route.prefixe + '**', (r) => {
        const relatif = decodeURIComponent(r.request().url().slice(route.prefixe.length).split('?')[0]);
        const chemin = path.join(route.dossier, relatif);
        if (!chemin.startsWith(route.dossier) || !fs.existsSync(chemin)) return r.fulfill({ status: 404, body: '' });
        r.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(chemin) });
      });
    }
  }
  // La vraie config n'est jamais utilisée par l'essai : remplie (faux projet) ou vide.
  await page.route(base + '/js/config.js', (r) => r.fulfill({
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

      await page.evaluate(() => localStorage.setItem('faux-supabase-panne', '1'));
      await page.fill('#note-contenu', 'écrit pendant la panne');
      await page.waitForFunction(() => document.getElementById('etat-sauvegarde').textContent.includes('non enregistré'));
      verifier((await page.textContent('#note-message')).includes('injoignable'), 'panne réseau : signalée');
      await page.evaluate(() => localStorage.removeItem('faux-supabase-panne'));
      await page.waitForFunction(() => /● enregistré \d/.test(document.getElementById('etat-sauvegarde').textContent), null, { timeout: 8000 });
      verifier(true, 'retour du réseau : enregistré automatiquement');

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
  } finally {
    await navigateur.close();
    srv.close();
  }

  console.log(echecs ? `\n${echecs} échec(s)` : '\nTout est bon.');
  process.exit(echecs ? 1 : 0);
})();
