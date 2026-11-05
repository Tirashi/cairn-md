// Faux supabase-js pour les essais (servi à la place du CDN par outils/essai.js).
// Un seul compte : essai@cairn.local / secret. Session gardée dans localStorage.
const CLE = 'faux-supabase-session';
const COMPTE = { email: 'essai@cairn.local', motDePasse: 'secret', id: '00000000-0000-0000-0000-000000000001' };

export function createClient() {
  const abonnes = new Set();
  const lire = () => { try { return JSON.parse(localStorage.getItem(CLE)); } catch { return null; } };
  const notifier = (evt, s) => abonnes.forEach((f) => f(evt, s));

  return {
    auth: {
      async getSession() { return { data: { session: lire() }, error: null }; },
      async signInWithPassword({ email, password }) {
        await new Promise((r) => setTimeout(r, 50));
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
