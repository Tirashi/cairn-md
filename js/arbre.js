// Dossiers, tags et filtres : fonctions pures (aucun accès au DOM ni au backend).

/** 'Travail//Projets/ ' → 'Travail/Projets' ; '' = racine. */
export function normaliserDossier(chemin) {
  return (chemin || '').split('/').map((s) => s.trim()).filter(Boolean).join('/');
}

/** '#Mon Tag' → 'mon-tag'. */
export function normaliserTag(tag) {
  return (tag || '').trim().replace(/^#+/, '').trim().replace(/\s+/g, '-').toLowerCase();
}

/** Pour comparer sans tenir compte des majuscules ni des accents. */
export function plier(texte) {
  return (texte || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** `dossier` contient-il `chemin` (lui-même ou un sous-dossier) ? */
export function dansDossier(chemin, dossier) {
  return !dossier || chemin === dossier || chemin.startsWith(dossier + '/');
}

/** Tous les dossiers existants, sous-dossiers intermédiaires compris, triés. */
export function listerDossiers(notes) {
  const tous = new Set();
  for (const n of notes) {
    const parts = normaliserDossier(n.folder).split('/').filter(Boolean);
    for (let i = 1; i <= parts.length; i++) tous.add(parts.slice(0, i).join('/'));
  }
  return [...tous].sort((a, b) => plier(a).localeCompare(plier(b)));
}

/** Si un dossier existe déjà avec une autre casse, on garde l'existant. */
export function dossierExistant(chemin, notes) {
  const c = normaliserDossier(chemin);
  return listerDossiers(notes).find((d) => plier(d) === plier(c)) || c;
}

/**
 * Arbre des dossiers : { nom, chemin, total, enfants: [...] } où total compte
 * les notes du dossier et de ses sous-dossiers. La racine a chemin ''.
 */
export function construireArbre(notes) {
  const racine = { nom: '~', chemin: '', total: 0, enfants: new Map() };
  for (const n of notes) {
    racine.total++;
    let noeud = racine;
    for (const part of normaliserDossier(n.folder).split('/').filter(Boolean)) {
      const chemin = noeud.chemin ? noeud.chemin + '/' + part : part;
      if (!noeud.enfants.has(part)) noeud.enfants.set(part, { nom: part, chemin, total: 0, enfants: new Map() });
      noeud = noeud.enfants.get(part);
      noeud.total++;
    }
  }
  const figer = (noeud) => ({
    ...noeud,
    enfants: [...noeud.enfants.values()].sort((a, b) => plier(a.nom).localeCompare(plier(b.nom))).map(figer),
  });
  return figer(racine);
}

/** Lignes à afficher, avec les préfixes ├─ └─ │. */
export function lignesArbre(arbre) {
  const lignes = [];
  const parcourir = (noeud, prefixe) => {
    noeud.enfants.forEach((enfant, i) => {
      const dernier = i === noeud.enfants.length - 1;
      lignes.push({ prefixe: prefixe + (dernier ? '└─ ' : '├─ '), nom: enfant.nom, chemin: enfant.chemin, total: enfant.total });
      parcourir(enfant, prefixe + (dernier ? '   ' : '│  '));
    });
  };
  parcourir(arbre, '');
  return lignes;
}

/** Tags et nombre de notes, les plus utilisés d'abord. */
export function compterTags(notes) {
  const compte = new Map();
  for (const n of notes) for (const t of n.tags || []) compte.set(t, (compte.get(t) || 0) + 1);
  return [...compte.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([tag, total]) => ({ tag, total }));
}

/** Filtre { dossier, tag, recherche } appliqué aux notes. */
export function filtrer(notes, { dossier = '', tag = null, recherche = '' } = {}) {
  const q = plier(recherche.trim());
  return notes.filter((n) =>
    dansDossier(normaliserDossier(n.folder), dossier)
    && (!tag || (n.tags || []).includes(tag))
    && (!q || plier(n.title).includes(q) || plier(n.content).includes(q)));
}
