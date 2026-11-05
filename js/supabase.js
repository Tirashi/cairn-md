// Seul fichier (avec notes.js) qui parle à Supabase.
// Changer de backend ne doit toucher que ces deux fichiers.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const configure = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export const client = configure
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    })
  : null;

// ---------- Authentification ----------
// Toutes les fonctions renvoient des objets simples, sans type propre à Supabase :
// utilisateur = { id, email } ou null.

function versUtilisateur(session) {
  return session && session.user ? { id: session.user.id, email: session.user.email } : null;
}

export async function utilisateurActuel() {
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  return versUtilisateur(data.session);
}

/** Connexion par email et mot de passe. Renvoie { utilisateur } ou { erreur } (code court). */
export async function connexion(email, motDePasse) {
  const { data, error } = await client.auth.signInWithPassword({ email, password: motDePasse });
  if (error) {
    const msg = (error.message || '').toLowerCase();
    let erreur = 'inconnue';
    if (error.status === 400 || msg.includes('invalid login')) erreur = 'identifiants';
    else if (msg.includes('email not confirmed')) erreur = 'non-confirme';
    else if (error.status === 429) erreur = 'trop-de-tentatives';
    else if (error.name === 'AuthRetryableFetchError' || msg.includes('fetch')) erreur = 'reseau';
    return { erreur };
  }
  return { utilisateur: versUtilisateur(data.session) };
}

export async function deconnexion() {
  const { error } = await client.auth.signOut();
  if (error) throw error;
}

/** Appelle `rappel(utilisateur | null)` à chaque changement de session. */
export function surChangementSession(rappel) {
  const { data } = client.auth.onAuthStateChange((_evenement, session) => {
    rappel(versUtilisateur(session));
  });
  return () => data.subscription.unsubscribe();
}
