// Colonne des dossiers et tags (ordinateur), fil d'Ariane et puces (téléphone), en-tête des filtres.
import { construireArbre, lignesArbre, compterTags } from './arbre.js';

const $ = (id) => document.getElementById(id);

function element(tag, classe, texte) {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (texte !== undefined) e.textContent = texte;
  return e;
}

function boutonFiltre(contenu, actif, action, classe = 'ligne-nav') {
  const b = element('button', classe);
  b.type = 'button';
  if (actif) b.setAttribute('aria-current', 'true');
  b.append(...contenu);
  b.addEventListener('click', action);
  return b;
}

function boutonRenommer(chemin, surRenommer) {
  const mv = element('button', 'bouton-mv', 'mv');
  mv.type = 'button';
  mv.setAttribute('aria-label', 'Renommer le dossier ' + chemin);
  mv.addEventListener('click', (e) => { e.stopPropagation(); surRenommer(chemin); });
  return mv;
}

/**
 * notes : toutes les notes ; filtre : { dossier, tag, recherche } ;
 * surFiltre(changement) : appelé avec { dossier } ou { tag } ; surRenommer(chemin).
 */
export function afficherNavigation({ notes, filtre, surFiltre, surRenommer }) {
  const arbre = construireArbre(notes);
  const tags = compterTags(notes);

  // ---------- Arbre (ordinateur) ----------
  const ul = $('arbre');
  ul.replaceChildren();
  const liRacine = element('li');
  liRacine.append(boutonFiltre([element('span', 'nav-nom', '~/'), element('span', 'nav-compte', String(arbre.total))],
    filtre.dossier === '', () => surFiltre({ dossier: '' })));
  ul.append(liRacine);
  for (const l of lignesArbre(arbre)) {
    const li = element('li', 'ligne-arbre');
    const actif = filtre.dossier === l.chemin;
    li.append(boutonFiltre([
      element('span', 'nav-prefixe', l.prefixe),
      element('span', 'nav-nom', l.nom + '/'),
      element('span', 'nav-compte', String(l.total)),
    ], actif, () => surFiltre({ dossier: l.chemin })));
    if (actif) li.append(boutonRenommer(l.chemin, surRenommer));
    ul.append(li);
  }

  // ---------- Tags (ordinateur) ----------
  const nuage = $('nuage-tags');
  nuage.replaceChildren();
  if (!tags.length) nuage.append(element('li', 'muet', '—'));
  for (const { tag, total } of tags) {
    const li = element('li');
    li.append(boutonFiltre([element('span', '', '#' + tag), element('span', 'nav-compte', String(total))],
      filtre.tag === tag, () => surFiltre({ tag: filtre.tag === tag ? null : tag }), 'puce-tag'));
    nuage.append(li);
  }

  // ---------- Fil d'Ariane, sous-dossiers et tags (téléphone) ----------
  const ariane = $('ariane');
  ariane.replaceChildren();
  const parts = filtre.dossier ? filtre.dossier.split('/') : [];
  ariane.append(boutonFiltre([element('span', '', '~/')], parts.length === 0, () => surFiltre({ dossier: '' }), 'miette'));
  parts.forEach((p, i) => {
    const chemin = parts.slice(0, i + 1).join('/');
    ariane.append(boutonFiltre([element('span', '', p + '/')], i === parts.length - 1, () => surFiltre({ dossier: chemin }), 'miette'));
  });
  if (parts.length) ariane.append(boutonRenommer(filtre.dossier, surRenommer));

  let noeud = arbre;
  for (const p of parts) noeud = (noeud.enfants.find((e) => e.nom === p)) || { enfants: [] };
  const sous = $('sous-dossiers');
  sous.replaceChildren();
  noeud.enfants.forEach((e, i) => {
    const li = element('li');
    li.append(boutonFiltre([
      element('span', 'nav-prefixe', i === noeud.enfants.length - 1 ? '└─ ' : '├─ '),
      element('span', 'nav-nom', e.nom + '/'),
      element('span', 'nav-compte', String(e.total)),
    ], false, () => surFiltre({ dossier: e.chemin })));
    sous.append(li);
  });

  const tm = $('tags-mobile');
  tm.replaceChildren();
  for (const { tag } of tags) {
    const li = element('li');
    li.append(boutonFiltre([element('span', '', '#' + tag)], filtre.tag === tag,
      () => surFiltre({ tag: filtre.tag === tag ? null : tag }), 'puce-tag'));
    tm.append(li);
  }

  // ---------- En-tête de la liste ----------
  const morceaux = ['~/' + (filtre.dossier ? filtre.dossier + '/' : '')];
  if (filtre.tag) morceaux.push('#' + filtre.tag);
  if (filtre.recherche.trim()) morceaux.push('« ' + filtre.recherche.trim() + ' »');
  $('filtre-actif').textContent = morceaux.join(' · ');
  $('bouton-effacer-filtres').hidden = !(filtre.dossier || filtre.tag || filtre.recherche.trim());
}
