// Liste de suggestions accessible (role="listbox") pilotée au clavier depuis un champ.
let compteur = 0;

/**
 * ul : la liste ; champ : l'élément qui garde le focus (aria-activedescendant) ;
 * surChoix(option) : appelé au clic ou à Entrée. Une option = { valeur, texte, note? }.
 */
export function creerSuggestions(ul, champ, surChoix) {
  let options = [];
  let active = -1;
  const prefixe = 'sugg-' + (++compteur) + '-';

  function dessiner() {
    ul.replaceChildren();
    options.forEach((o, i) => {
      const li = document.createElement('li');
      li.id = prefixe + i;
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', String(i === active));
      const t = document.createElement('span');
      t.textContent = o.texte;
      li.append(t);
      if (o.note) {
        const n = document.createElement('span');
        n.className = 'muet';
        n.textContent = o.note;
        li.append(n);
      }
      li.addEventListener('mousedown', (e) => e.preventDefault());   // garder le focus dans le champ
      li.addEventListener('click', () => surChoix(o));
      ul.append(li);
    });
    if (active >= 0) champ.setAttribute('aria-activedescendant', prefixe + active);
    else champ.removeAttribute('aria-activedescendant');
  }

  return {
    afficher(liste, { premiereActive = true } = {}) {
      options = liste;
      active = premiereActive && liste.length ? 0 : -1;
      dessiner();
      ul.hidden = liste.length === 0;
      champ.setAttribute('aria-expanded', String(liste.length > 0));
    },
    cacher() {
      options = [];
      active = -1;
      ul.hidden = true;
      champ.setAttribute('aria-expanded', 'false');
      champ.removeAttribute('aria-activedescendant');
    },
    ouverte: () => !ul.hidden && options.length > 0,
    deplacer(pas) {
      if (!options.length) return;
      active = (active + pas + options.length) % options.length;
      dessiner();
      document.getElementById(prefixe + active)?.scrollIntoView({ block: 'nearest' });
    },
    /** Choisit l'option active ; renvoie false s'il n'y en a pas. */
    choisirActive() {
      if (active < 0 || !options[active]) return false;
      surChoix(options[active]);
      return true;
    },
  };
}
