// Conflits de synchronisation (direction C) : une note modifiée sur cet appareil hors ligne
// et, entre-temps, ailleurs. Les conflits sont présentés un par un ; rien n'est écrasé sans choix.
import { resoudreConflit } from './notes.js';
import { comparer, slug } from './export.js';
import { normaliserDossier } from './arbre.js';

const $ = (id) => document.getElementById(id);
const fmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const quand = (iso) => (iso ? fmt.format(new Date(iso)) : '');

let file = [];
let surFin = null;

function el(tag, classe, texte) {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (texte !== undefined) e.textContent = texte;
  return e;
}

function metaEnTexte(n) {
  return ['titre : ' + n.title, 'dossier : ' + (normaliserDossier(n.folder) || '~/'), 'tags : ' + ((n.tags || []).map((t) => '#' + t).join(' ') || '—')].join('\n');
}

function bloc(titre, date, lignes, classe) {
  const cadre = el('div', 'version');
  const tete = el('div', 'version-tete');
  tete.append(el('span', '', titre), el('span', '', date));
  const pre = el('pre', 'version-texte');
  for (const { texte, propre } of lignes) {
    pre.append(el('span', propre ? 'ligne-propre ' + classe : '', (propre ? (classe === 'cote-cairn' ? '+ ' : '~ ') : '  ') + texte), document.createTextNode('\n'));
  }
  cadre.append(tete, pre);
  return cadre;
}

function afficher(total) {
  const c = file[0];
  if (!c) { $('dialogue-sync').close(); if (surFin) surFin(); return; }
  $('sync-titre').textContent = 'conflit ' + (total - file.length + 1) + '/' + total;
  $('sync-nom').textContent = slug(c.local.title) + '.md a changé ailleurs';
  $('sync-message').textContent = '';
  const meta = comparer(metaEnTexte(c.local), metaEnTexte(c.serveur));
  const texte = comparer(c.local.content || '', c.serveur.content || '');
  $('sync-versions').replaceChildren(
    bloc('sur cet appareil', quand(c.local.updated_at), [...meta.a, { texte: '', propre: false }, ...texte.a], 'cote-cairn'),
    bloc('sur le serveur', quand(c.serveur.updated_at), [...meta.b, { texte: '', propre: false }, ...texte.b], 'cote-fichier'),
  );
}

async function choisir(choix, total) {
  const c = file[0];
  for (const b of document.querySelectorAll('#sync-choix button')) b.disabled = true;
  const r = await resoudreConflit(c.id, choix);
  for (const b of document.querySelectorAll('#sync-choix button')) b.disabled = false;
  if (r.erreur) {
    $('sync-message').textContent = r.erreur === 'reseau' ? 'Réseau coupé : réessayer plus tard.'
      : r.erreur === 'titre-pris' ? 'Le titre de cette version est pris par une autre note : choisir « les deux ».'
        : 'Erreur du serveur.';
    return;
  }
  file.shift();
  afficher(total);
}

/** Ouvre la fenêtre pour les conflits donnés ; `fin()` est appelée quand tout est réglé ou fermé. */
export function regler(conflits, fin) {
  if (!conflits.length) return;
  file = [...conflits];
  surFin = fin;
  const total = file.length;
  const boutons = $('sync-choix');
  boutons.replaceChildren();
  for (const [valeur, libelle] of [['appareil', 'garder cet appareil'], ['serveur', 'garder le serveur'], ['deux', 'les deux (copie « … (appareil) »)']]) {
    const b = el('button', valeur === 'deux' ? 'bouton-principal' : 'bouton-discret', libelle);
    b.type = 'button';
    b.addEventListener('click', () => choisir(valeur, total));
    boutons.append(b);
  }
  afficher(total);
  if (!$('dialogue-sync').open) $('dialogue-sync').showModal();
}

export function brancherSync() {
  $('sync-plus-tard').addEventListener('click', () => { $('dialogue-sync').close(); if (surFin) surFin(); });
}
