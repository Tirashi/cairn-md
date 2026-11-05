// Dossier (chemin éditable) et tags de la note ouverte — direction A de la maquette.
import { normaliserDossier, normaliserTag, plier } from './arbre.js';
import { creerSuggestions } from './suggestions.js';

const $ = (id) => document.getElementById(id);

let source = null;            // fonctions fournies par ui.js
let courant = { folder: '', tags: [] };
let annulation = false;       // Échap : ne pas valider au blur

/**
 * options : {
 *   dossiers() : chemins existants,  tags() : tags existants,
 *   resoudreDossier(chemin) : chemin final (casse d'un dossier existant),
 *   surDossier(chemin), surTags(tags)
 * }
 */
export function brancherMeta(options) {
  source = options;
  brancherDossier();
  brancherTags();
}

export function afficherMeta(note, nomFichier) {
  courant = { folder: note.folder || '', tags: [...(note.tags || [])] };
  $('note-dossier').value = courant.folder;
  $('note-fichier').textContent = '/' + nomFichier;
  dessinerTags();
  fermerSaisieTag();
}

/** Met à jour le nom de fichier affiché (après un changement de titre). */
export function majNomFichier(nomFichier) {
  $('note-fichier').textContent = '/' + nomFichier;
}

// ---------- Dossier ----------

function brancherDossier() {
  const champ = $('note-dossier');
  const sugg = creerSuggestions($('suggestions-dossiers'), champ, (o) => {
    champ.value = o.valeur;
    sugg.cacher();
    valider(o.valeur);
    champ.blur();
  });

  const proposer = () => {
    const saisi = normaliserDossier(champ.value);
    const q = plier(saisi);
    const existants = source.dossiers();
    const liste = existants
      .filter((d) => !q || plier(d).includes(q))
      .slice(0, 6)
      .map((d) => ({ valeur: d, texte: d + '/' }));
    if (!saisi) liste.unshift({ valeur: '', texte: '~/', note: 'racine' });
    else if (!existants.some((d) => plier(d) === q)) liste.push({ valeur: saisi, texte: '+ nouveau dossier « ' + saisi + '/ »' });
    sugg.afficher(liste, { premiereActive: false });
  };

  const valider = (valeur) => {
    const chemin = source.resoudreDossier(valeur);
    champ.value = chemin;
    if (chemin !== courant.folder) {
      courant.folder = chemin;
      source.surDossier(chemin);
    }
  };

  champ.addEventListener('focus', () => { annulation = false; proposer(); });
  champ.addEventListener('input', proposer);
  champ.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (!sugg.ouverte()) proposer(); sugg.deplacer(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sugg.deplacer(-1); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (!sugg.choisirActive()) { sugg.cacher(); valider(champ.value); champ.blur(); }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      annulation = true;
      champ.value = courant.folder;
      sugg.cacher();
      champ.blur();
    }
  });
  champ.addEventListener('blur', () => {
    sugg.cacher();
    if (!annulation) valider(champ.value);
    annulation = false;
  });
}

// ---------- Tags ----------

function dessinerTags() {
  const ul = $('note-tags');
  ul.replaceChildren();
  for (const t of courant.tags) {
    const li = document.createElement('li');
    li.className = 'puce';
    const nom = document.createElement('span');
    nom.textContent = '#' + t;
    const x = document.createElement('button');
    x.type = 'button';
    x.textContent = '×';
    x.setAttribute('aria-label', 'Retirer le tag ' + t);
    x.addEventListener('click', () => changerTags(courant.tags.filter((u) => u !== t)));
    li.append(nom, x);
    ul.append(li);
  }
}

function changerTags(tags) {
  courant.tags = tags;
  dessinerTags();
  source.surTags([...tags]);
}

function ajouterTag(brut) {
  const t = normaliserTag(brut);
  if (t && !courant.tags.includes(t)) changerTags([...courant.tags, t]);
}

function ouvrirSaisieTag() {
  $('bouton-ajout-tag').hidden = true;
  const champ = $('note-tag');
  champ.hidden = false;
  champ.value = '';
  champ.focus();
}

function fermerSaisieTag() {
  $('note-tag').hidden = true;
  $('note-tag').value = '';
  $('suggestions-tags').hidden = true;
  $('bouton-ajout-tag').hidden = false;
}

function brancherTags() {
  const champ = $('note-tag');
  const sugg = creerSuggestions($('suggestions-tags'), champ, (o) => {
    ajouterTag(o.valeur);
    champ.value = '';
    proposer();
  });

  function proposer() {
    const q = plier(normaliserTag(champ.value));
    const liste = source.tags()
      .filter((t) => !courant.tags.includes(t) && (!q || plier(t).includes(q)))
      .slice(0, 6)
      .map((t) => ({ valeur: t, texte: '#' + t }));
    sugg.afficher(liste, { premiereActive: false });
  }

  $('bouton-ajout-tag').addEventListener('click', ouvrirSaisieTag);
  champ.addEventListener('focus', proposer);
  champ.addEventListener('input', () => {
    if (champ.value.includes(',')) {                 // la virgule valide le tag
      champ.value.split(',').slice(0, -1).forEach(ajouterTag);
      champ.value = champ.value.split(',').pop();
    }
    proposer();
  });
  champ.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); sugg.deplacer(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sugg.deplacer(-1); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (!sugg.choisirActive()) { ajouterTag(champ.value); champ.value = ''; proposer(); }
    } else if (e.key === 'Backspace' && !champ.value && courant.tags.length) {
      changerTags(courant.tags.slice(0, -1));
    } else if (e.key === 'Escape') {
      e.preventDefault();
      champ.value = '';
      champ.blur();
    }
  });
  champ.addEventListener('blur', () => {
    if (champ.value.trim()) ajouterTag(champ.value);
    sugg.cacher();
    fermerSaisieTag();
  });
}
