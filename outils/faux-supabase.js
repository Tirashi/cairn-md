// Faux supabase-js pour les essais (servi à la place du CDN par outils/essai.js).
// Un seul compte : essai@cairn.local / secret. Session et notes gardées dans localStorage.
// Imite ce que Cairn utilise : auth.* et from('notes') avec select/insert/update/delete,
// eq, order, single ; index unique (user_id, lower(title)) ; RLS (seulement ses notes).
// localStorage['faux-supabase-panne'] = '1' simule un serveur injoignable.
const CLE = 'faux-supabase-session';
const CLE_NOTES = 'faux-supabase-notes';
const CLE_PANNE = 'faux-supabase-panne';
const COMPTE = { email: 'essai@cairn.local', motDePasse: 'secret', id: '00000000-0000-0000-0000-000000000001' };

const lireJSON = (cle, defaut) => { try { return JSON.parse(localStorage.getItem(cle)) ?? defaut; } catch { return defaut; } };
const lireSession = () => lireJSON(CLE, null);
const enPanne = () => localStorage.getItem(CLE_PANNE) === '1';
const attendre = () => new Promise((r) => setTimeout(r, 30));

let dernier = 0;
function maintenant() {
  // updated_at strictement croissant, même pour deux écritures dans la même milliseconde.
  dernier = Math.max(Date.now(), dernier + 1);
  return new Date(dernier).toISOString();
}

function uuid() {
  return crypto.randomUUID ? crypto.randomUUID()
    : '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) => (c ^ (Math.random() * 16) >> (c / 4)).toString(16));
}

class Requete {
  constructor(table) { this.table = table; this.op = 'select'; this.filtres = []; this.tri = null; this.unique = false; }
  select() { if (this.op === 'select') this.op = 'select'; this.retour = true; return this; }
  insert(v) { this.op = 'insert'; this.valeur = v; return this; }
  update(v) { this.op = 'update'; this.valeur = v; return this; }
  delete() { this.op = 'delete'; return this; }
  eq(col, val) { this.filtres.push([col, val]); return this; }
  order(col, { ascending = true } = {}) { this.tri = [col, ascending]; return this; }
  single() { this.unique = true; return this; }
  then(ok, ko) { return this.executer().then(ok, ko); }

  async executer() {
    await attendre();
    if (enPanne()) return { data: null, error: { message: 'TypeError: Failed to fetch' } };
    const session = lireSession();
    const moi = session && session.user.id;
    let lignes = lireJSON(CLE_NOTES, []);
    const miennes = (l) => l.user_id === moi && this.filtres.every(([c, v]) => l[c] === v);
    const doublon = (titre, sauf) => lignes.some((l) => l.user_id === moi && l.id !== sauf && l.title.toLowerCase() === titre.toLowerCase());
    const erreurDoublon = { code: '23505', message: 'duplicate key value violates unique constraint "notes_user_title_uq"' };
    let resultat = [];

    if (this.op === 'select') {
      resultat = lignes.filter(miennes);
    } else if (this.op === 'insert') {
      if (!moi) return { data: null, error: { code: '42501', message: 'new row violates row-level security policy' } };
      if (doublon(this.valeur.title, null)) return { data: null, error: erreurDoublon };
      const t = maintenant();
      const ligne = { id: uuid(), user_id: moi, content: '', folder: '', tags: [], created_at: t, updated_at: t, ...this.valeur };
      lignes.push(ligne);
      resultat = [ligne];
    } else if (this.op === 'update') {
      for (const l of lignes.filter(miennes)) {
        if ('title' in this.valeur && doublon(this.valeur.title, l.id)) return { data: null, error: erreurDoublon };
        Object.assign(l, this.valeur, { updated_at: maintenant() });
        resultat.push(l);
      }
    } else if (this.op === 'delete') {
      resultat = lignes.filter(miennes);
      lignes = lignes.filter((l) => !miennes(l));
    }
    localStorage.setItem(CLE_NOTES, JSON.stringify(lignes));

    if (this.tri) {
      const [c, asc] = this.tri;
      resultat = [...resultat].sort((a, b) => (a[c] < b[c] ? -1 : a[c] > b[c] ? 1 : 0) * (asc ? 1 : -1));
    }
    const copie = JSON.parse(JSON.stringify(resultat));
    if (this.unique) {
      return copie.length === 1 ? { data: copie[0], error: null }
        : { data: null, error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' } };
    }
    return { data: this.op === 'delete' && !this.retour ? null : copie, error: null };
  }
}

export function createClient() {
  const abonnes = new Set();
  const notifier = (evt, s) => abonnes.forEach((f) => f(evt, s));

  return {
    from: (table) => new Requete(table),
    auth: {
      async getSession() { return { data: { session: lireSession() }, error: null }; },
      async signInWithPassword({ email, password }) {
        await attendre();
        if (email !== COMPTE.email || password !== COMPTE.motDePasse) {
          return { data: { session: null }, error: { status: 400, name: 'AuthApiError', message: 'Invalid login credentials' } };
        }
        const session = { access_token: 'faux', user: { id: COMPTE.id, email } };
        localStorage.setItem(CLE, JSON.stringify(session));
        notifier('SIGNED_IN', session);
        return { data: { session }, error: null };
      },
      async signOut() {
        localStorage.removeItem(CLE);
        notifier('SIGNED_OUT', null);
        return { error: null };
      },
      onAuthStateChange(f) {
        abonnes.add(f);
        return { data: { subscription: { unsubscribe: () => abonnes.delete(f) } } };
      },
    },
  };
}
