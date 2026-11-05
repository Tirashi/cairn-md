// Application installable : service worker, carte « Installer Cairn ? » et entrée du menu ⋯.
// Android et ordinateur (Chrome, Edge) : le navigateur fournit l'installation (beforeinstallprompt).
// iPhone et iPad : Safari ne le permet pas ; on explique « Partager › Sur l'écran d'accueil ».
const $ = (id) => document.getElementById(id);
const CLE_PLUS_TARD = 'cairn-installation-plus-tard';
const TRENTE_JOURS = 30 * 24 * 3600 * 1000;

let invite = null;           // événement beforeinstallprompt gardé pour plus tard

const installee = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const ios = () => /iphone|ipad|ipod/i.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const possible = () => !installee() && (invite !== null || ios());

function repoussee() {
  try { return Date.now() - Number(localStorage.getItem(CLE_PLUS_TARD) || 0) < TRENTE_JOURS; } catch { return false; }
}

function majInterface() {
  $('menu-installer').hidden = !possible();
  if (!possible()) $('carte-installation').hidden = true;
}

/** Montre la carte (une fois connecté), sauf si elle a été repoussée il y a moins de 30 jours. */
export function proposerInstallation() {
  if (!possible() || repoussee()) return;
  $('carte-installation-texte').textContent = ios() && !invite
    ? 'Sur iPhone : touchez Partager, puis « Sur l\'écran d\'accueil ». Cairn s\'ouvrira en plein écran, notes lisibles sans réseau.'
    : 'Icône sur l\'écran d\'accueil, plein écran, notes lisibles et modifiables sans réseau.';
  $('carte-installer').textContent = ios() && !invite ? 'compris' : 'installer';
  $('carte-installation').hidden = false;
}

async function installer() {
  $('carte-installation').hidden = true;
  if (invite) {
    invite.prompt();
    await invite.userChoice.catch(() => null);
    invite = null;
    majInterface();
    return;
  }
  // iOS : la carte affiche la consigne ; depuis le menu, on la (ré)affiche.
  try { localStorage.removeItem(CLE_PLUS_TARD); } catch { /* préférence indisponible */ }
}

export function brancherInstallation() {
  $('carte-plus-tard').addEventListener('click', () => {
    $('carte-installation').hidden = true;
    try { localStorage.setItem(CLE_PLUS_TARD, String(Date.now())); } catch { /* tant pis */ }
  });
  $('carte-installer').addEventListener('click', () => {
    if ($('carte-installer').textContent === 'compris') {
      $('carte-installation').hidden = true;
      try { localStorage.setItem(CLE_PLUS_TARD, String(Date.now())); } catch { /* tant pis */ }
      return;
    }
    installer();
  });
  $('menu-installer').addEventListener('click', () => {
    if (invite) installer();
    else { try { localStorage.removeItem(CLE_PLUS_TARD); } catch { /* */ } proposerInstallation(); }
  });
  majInterface();
}

// Dès le chargement du module : le navigateur peut proposer l'installation très tôt.
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  invite = e;
  if (document.getElementById('menu-installer')) majInterface();
});
window.addEventListener('appinstalled', () => {
  invite = null;
  if (document.getElementById('menu-installer')) majInterface();
});

/** Enregistre le service worker (https ou localhost seulement). */
export function enregistrerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') return;
  navigator.serviceWorker.register('sw.js').catch(() => { /* sans service worker, Cairn marche en ligne */ });
}
