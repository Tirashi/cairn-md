// Bascule sombre / clair. Le thème initial est posé par le script inline du <head>.
const CLE = 'cairn-theme';
const COULEUR_BARRE = { dark: '#121212', light: '#f6f6f4' };

function themeActuel() {
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}

function appliquer(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  document.querySelector('meta[name="theme-color"]').setAttribute('content', COULEUR_BARRE[theme]);
  for (const b of document.querySelectorAll('[data-action="theme"]')) {
    b.textContent = theme === 'dark' ? '☾' : '☀';
    b.setAttribute('aria-label', theme === 'dark' ? 'Passer au thème clair' : 'Passer au thème sombre');
  }
}

export function brancherTheme() {
  appliquer(themeActuel());
  for (const b of document.querySelectorAll('[data-action="theme"]')) {
    b.addEventListener('click', () => {
      const suivant = themeActuel() === 'dark' ? 'light' : 'dark';
      appliquer(suivant);
      document.dispatchEvent(new CustomEvent('cairn-theme', { detail: suivant }));
      try { localStorage.setItem(CLE, suivant); } catch { /* stockage indisponible : le choix n'est pas retenu */ }
    });
  }
}
