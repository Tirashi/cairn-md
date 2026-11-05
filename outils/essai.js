// Essai de bout en bout, sans réseau : node outils/essai.js
// Sert le dépôt en local, remplace supabase-js (CDN) par outils/faux-supabase.js,
// et vérifie configuration manquante, connexion, session, déconnexion et thème.
const http = require('http');
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
  } finally {
    await navigateur.close();
    srv.close();
  }

  console.log(echecs ? `\n${echecs} échec(s)` : '\nTout est bon.');
  process.exit(echecs ? 1 : 0);
})();
