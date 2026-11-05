// Copie locale des notes et file des modifications en attente (IndexedDB).
// Ne parle jamais au serveur : c'est notes.js qui s'en sert.
// Magasins : notes (copie complète), attente (opérations à rejouer), meta (propriétaire de la copie).
const NOM = 'cairn';
let promesseBase = null;

function base() {
  promesseBase ??= new Promise((ok, ko) => {
    const r = indexedDB.open(NOM, 1);
    r.onupgradeneeded = () => {
      const db = r.result;
      db.createObjectStore('notes', { keyPath: 'id' });
      db.createObjectStore('attente', { keyPath: 'id' });   // une entrée par note : opérations fusionnées
      db.createObjectStore('meta');
    };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => ko(r.error);
  });
  return promesseBase;
}

/** Exécute `travail(magasins)` dans une transaction ; renvoie son résultat une fois écrit. */
async function transaction(noms, mode, travail) {
  const db = await base();
  return new Promise((ok, ko) => {
    const tx = db.transaction(noms, mode);
    const magasins = Object.fromEntries(noms.map((n) => [n, tx.objectStore(n)]));
    let resultat;
    Promise.resolve(travail(magasins)).then((r) => { resultat = r; }, ko);
    tx.oncomplete = () => ok(resultat);
    tx.onerror = () => ko(tx.error);
    tx.onabort = () => ko(tx.error);
  });
}

const enPromesse = (requete) => new Promise((ok, ko) => { requete.onsuccess = () => ok(requete.result); requete.onerror = () => ko(requete.error); });

/** Disponible ? (navigation privée de certains navigateurs : non) */
export async function disponible() {
  try { await base(); return true; } catch { return false; }
}

// ---------- Propriétaire ----------

export async function proprietaire() {
  return transaction(['meta'], 'readonly', ({ meta }) => enPromesse(meta.get('utilisateur')));
}

/** Change de propriétaire : la copie d'un autre compte est effacée. */
export async function definirProprietaire(id) {
  const actuel = await proprietaire();
  if (actuel === id) return;
  await toutEffacer();
  await transaction(['meta'], 'readwrite', ({ meta }) => { meta.put(id, 'utilisateur'); });
}

export async function toutEffacer() {
  await transaction(['notes', 'attente', 'meta'], 'readwrite', ({ notes, attente, meta }) => {
    notes.clear(); attente.clear(); meta.clear();
  });
}

// ---------- Notes ----------

export async function lireNotes() {
  return transaction(['notes'], 'readonly', ({ notes }) => enPromesse(notes.getAll()));
}

/** Remplace toute la copie par la liste du serveur. */
export async function remplacerNotes(liste) {
  await transaction(['notes'], 'readwrite', ({ notes }) => {
    notes.clear();
    for (const n of liste) notes.put(n);
  });
}

export async function ecrireNote(note) {
  await transaction(['notes'], 'readwrite', ({ notes }) => { notes.put(note); });
}

export async function effacerNote(id) {
  await transaction(['notes'], 'readwrite', ({ notes }) => { notes.delete(id); });
}

// ---------- File d'attente ----------
// Une entrée par note : { id, type: 'creer'|'modifier'|'supprimer', champs, base, ordre }
// base = updated_at du serveur connu avant la première modification hors ligne (pour les conflits).

export async function lireAttente() {
  const liste = await transaction(['attente'], 'readonly', ({ attente }) => enPromesse(attente.getAll()));
  return liste.sort((a, b) => a.ordre - b.ordre);
}

/** Ajoute une opération en la fusionnant avec celle déjà en attente pour la même note. */
export async function mettreEnAttente(op) {
  await transaction(['attente'], 'readwrite', async ({ attente }) => {
    const avant = await enPromesse(attente.get(op.id));
    const ordre = avant ? avant.ordre : Date.now() + Math.random();
    if (!avant) { attente.put({ ...op, ordre }); return; }
    if (op.type === 'supprimer') {
      if (avant.type === 'creer') attente.delete(op.id);        // créée puis supprimée hors ligne : rien à envoyer
      else attente.put({ id: op.id, type: 'supprimer', base: avant.base, ordre });
      return;
    }
    // creer + modifier → creer ; modifier + modifier → modifier (la base la plus ancienne reste)
    attente.put({ ...avant, champs: { ...avant.champs, ...op.champs }, ordre });
  });
}

export async function retirerAttente(id) {
  await transaction(['attente'], 'readwrite', ({ attente }) => { attente.delete(id); });
}
