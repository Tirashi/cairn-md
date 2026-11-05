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
  // [motif dans js/*.js, paquet npm, fichier ES du paquet]
  [/cdn\.jsdelivr\.net\/npm\/marked@([\d.]+)\/\+esm/, 'marked', 'lib/marked.esm.js'],
  [/cdn\.jsdelivr\.net\/npm\/dompurify@([\d.]+)\/\+esm/, 'dompurify', 'dist/purify.es.mjs'],
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

/** Renvoie [[url du CDN, contenu du fichier], …] pour chaque bibliothèque utilisée par js/. */
async function preparerBibliotheques() {
  const sources = fs.readdirSync(path.join(RACINE, 'js')).map((f) => fs.readFileSync(path.join(RACINE, 'js', f), 'utf8')).join('\n');
  const routes = [];
  for (const [motif, paquet, fichier] of BIBLIOTHEQUES) {
    const m = sources.match(motif);
    if (!m) continue;
    const version = m[1];
    const dossier = path.join(CACHE, paquet + '-' + version);
    if (!fs.existsSync(path.join(dossier, fichier))) {
      fs.mkdirSync(dossier, { recursive: true });
      const tgz = path.join(dossier, 'paquet.tgz');
      await telecharger(`https://registry.npmjs.org/${paquet}/-/${paquet}-${version}.tgz`, tgz);
      execFileSync('tar', ['xzf', tgz, '-C', dossier, '--strip-components=1']);
    }
    routes.push([`https://${m[0]}`, fs.readFileSync(path.join(dossier, fichier), 'utf8')]);
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
  for (const [url, corps] of routesBibliotheques) {
    await page.route(url, (r) => r.fulfill({ contentType: 'text/javascript', body: corps }));
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
      await page.click('#dialogue-suppression button[value="annuler"]');
      verifier((await page.locator('.ln-nom').count()) === 2, 'suppression annulée : note gardée');
      await page.click('#bouton-supprimer');
      await page.click('#dialogue-suppression button[value="supprimer"]');
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
  } finally {
    await navigateur.close();
    srv.close();
  }

  console.log(echecs ? `\n${echecs} échec(s)` : '\nTout est bon.');
  process.exit(echecs ? 1 : 0);
})();
