// Fenêtre « historique » d'une note (direction A de la maquette) : versions groupées par
// période, différences entre la version choisie et l'actuelle, « voir » et « restaurer ».
// Les versions sont créées et triées par la base (supabase/versions.sql).
import { listerVersions, restaurerVersion } from './notes.js';
import { differences, slug } from './export.js';
import { rendre } from './markdown.js';

const $ = (id) => document.getElementById(id);
const fmtHeure = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });
const fmtJour = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
const fmtDate = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
const CONTEXTE = 2;   // lignes inchangées gardées autour d'un changement

const MESSAGES = {
  reseau: 'L\'historique a besoin du réseau : réessayer une fois en ligne.',
  'table-absente': 'Historique pas encore activé : exécuter supabase/versions.sql dans Supabase (SQL Editor).',
  'en-attente': 'Cette note attend d\'être envoyée au serveur : réessayer après la synchronisation.',
  inconnue: 'Erreur du serveur.',
};

let ouvert = null;   // { note, versions, choisie, vue, surRestaure }

function el(tag, classe, texte) {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (texte !== undefined) e.textContent = texte;
  return e;
}

/** Début du jour local de `d`, en millisecondes. */
const jour = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** Période d'une date par rapport à maintenant, et libellé court de la version. */
export function periode(iso, maintenant = new Date()) {
  const d = new Date(iso);
  const ecart = Math.round((jour(maintenant) - jour(d)) / 86400000);
  if (ecart <= 0) return { groupe: 'aujourd\'hui', libelle: fmtHeure.format(d) };
  if (ecart === 1) return { groupe: 'hier', libelle: fmtHeure.format(d) };
  if (ecart < 7) return { groupe: 'cette semaine', libelle: fmtJour.format(d) + ' ' + fmtHeure.format(d) };
  if (ecart < 31) return { groupe: 'ce mois-ci · 1 par jour', libelle: fmtJour.format(d) };
  if (ecart < 366) return { groupe: 'cette année · 1 par semaine', libelle: fmtJour.format(d) };
  return { groupe: 'plus anciennes · 1 par mois', libelle: fmtDate.format(d) };
}

const ecartTexte = ({ plus, moins }) => '+' + plus + ' −' + moins;

function afficherListe() {
  const { note, versions, choisie } = ouvert;
  const liste = $('historique-liste');
  liste.replaceChildren();
  const actuelle = el('li', 'historique-version historique-actuelle');
  actuelle.append(el('span', 'ok', '●'), el('span', 'historique-heure', 'maintenant'), el('span', 'muet', 'actuelle'));
  liste.append(actuelle);
  let groupe = null;
  versions.forEach((v, i) => {
    const p = periode(v.created_at);
    if (p.groupe !== groupe) { groupe = p.groupe; liste.append(el('li', 'historique-groupe', groupe)); }
    const li = el('li');
    const b = el('button', 'historique-version');
    b.type = 'button';
    b.setAttribute('aria-pressed', String(i === choisie));
    // Ce que cette version a changé par rapport à la précédente gardée.
    const avant = versions[i + 1];
    const detail = avant ? ecartTexte(differences(avant.content, v.content)) : 'plus ancienne gardée';
    const titre = v.title !== note.title ? ' · « ' + v.title + ' »' : '';
    b.append(el('span', i === choisie ? 'accent' : 'faible', i === choisie ? '◆' : '○'),
      el('span', 'historique-heure', p.libelle), el('span', 'muet', detail + titre));
    b.addEventListener('click', () => { ouvert.choisie = i; afficherListe(); afficherChoix(); });
    li.append(b);
    liste.append(li);
  });
}

function afficherChoix() {
  const { note, versions, choisie, vue } = ouvert;
  const v = versions[choisie];
  const diff = $('historique-diff');
  const apercu = $('historique-apercu');
  $('historique-message').textContent = '';
  $('historique-restaurer').disabled = !v;
  $('historique-voir').disabled = !v;
  if (!v) {
    $('historique-ecart').textContent = '';
    diff.hidden = false;
    apercu.hidden = true;
    diff.textContent = 'Aucune version gardée pour l\'instant : une version est gardée au plus toutes les 10 minutes d\'écriture.';
    return;
  }
  const d = differences(v.content, note.content);
  const libelle = periode(v.created_at).libelle;
  const compte = el('span');
  compte.append(el('span', 'ok', '+' + d.plus), ' ', el('span', 'erreur', '−' + d.moins));
  $('historique-ecart').replaceChildren(el('span', '', libelle + ' → actuelle'), compte);
  $('historique-restaurer').textContent = 'restaurer ' + libelle;
  $('historique-voir').textContent = vue === 'apercu' ? 'différences' : 'voir';
  diff.hidden = vue === 'apercu';
  apercu.hidden = vue !== 'apercu';
  if (vue === 'apercu') {
    apercu.innerHTML = rendre(v.content);       // rendre() passe toujours par DOMPurify
    return;
  }
  diff.replaceChildren();
  if (!d.plus && !d.moins) { diff.textContent = 'Même contenu que la version actuelle.'; return; }
  // Lignes inchangées loin d'un changement : remplacées par « … ».
  const proche = d.lignes.map((l, i) => d.lignes.slice(Math.max(0, i - CONTEXTE), i + CONTEXTE + 1).some((x) => x.type !== ' '));
  let saut = false;
  d.lignes.forEach((l, i) => {
    if (!proche[i]) { if (!saut) diff.append(el('span', 'faible', '  …'), document.createTextNode('\n')); saut = true; return; }
    saut = false;
    const classe = l.type === '+' ? 'diff-ajout' : l.type === '-' ? 'diff-retrait' : '';
    diff.append(el('span', classe, l.type + ' ' + l.texte), document.createTextNode('\n'));
  });
}

async function restaurer() {
  const { note, versions, choisie, surRestaure } = ouvert;
  const v = versions[choisie];
  if (!v) return;
  $('historique-restaurer').disabled = true;
  const r = await restaurerVersion(note, v).catch(() => ({ erreur: 'reseau' }));
  $('historique-restaurer').disabled = false;
  if (r.erreur) { $('historique-message').textContent = MESSAGES[r.erreur] || MESSAGES.inconnue; return; }
  $('dialogue-historique').close();
  if (surRestaure) surRestaure(r.note);
}

/** Ouvre l'historique de `note` ; `surRestaure(note)` reçoit la note restaurée. */
export async function ouvrirHistorique(note, surRestaure) {
  ouvert = { note, versions: [], choisie: 0, vue: 'diff', surRestaure };
  $('historique-nom').textContent = slug(note.title) + '.md';
  $('historique-compte').textContent = '';
  $('historique-liste').replaceChildren(el('li', 'muet historique-groupe', 'chargement…'));
  $('historique-ecart').textContent = '';
  $('historique-diff').textContent = '';
  $('historique-diff').hidden = false;
  $('historique-apercu').hidden = true;
  $('historique-message').textContent = '';
  $('historique-restaurer').disabled = true;
  $('historique-voir').disabled = true;
  if (!$('dialogue-historique').open) $('dialogue-historique').showModal();

  const r = await listerVersions(note.id).catch(() => ({ erreur: 'reseau' }));
  if (ouvert.note !== note) return;
  if (r.erreur) {
    $('historique-liste').replaceChildren();
    $('historique-message').textContent = MESSAGES[r.erreur] || MESSAGES.inconnue;
    return;
  }
  ouvert.versions = r.versions;
  $('historique-compte').textContent = '· ' + r.versions.length + ' version' + (r.versions.length > 1 ? 's' : '');
  afficherListe();
  afficherChoix();
}

export function brancherHistorique() {
  $('historique-fermer').addEventListener('click', () => $('dialogue-historique').close());
  $('historique-voir').addEventListener('click', () => {
    ouvert.vue = ouvert.vue === 'apercu' ? 'diff' : 'apercu';
    afficherChoix();
  });
  $('historique-restaurer').addEventListener('click', restaurer);
}
