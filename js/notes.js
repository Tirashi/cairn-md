// Accès aux notes : avec supabase.js, le seul fichier qui parle au backend.
// Renvoie des objets simples { id, title, content, folder, tags, created_at, updated_at }.
import { client } from './supabase.js';

const COLONNES = 'id, title, content, folder, tags, created_at, updated_at';

/** Traduit une erreur du backend en code court. */
function codeErreur(error) {
  if (!error) return null;
  if (error.code === '23505') return 'titre-pris';          // index unique (user_id, lower(title))
  if (error.code === 'PGRST116') return 'introuvable';      // .single() sans ligne
  const msg = (error.message || '').toLowerCase();
  if (msg.includes('fetch') || msg.includes('network')) return 'reseau';
  return 'inconnue';
}

function resultat({ data, error }) {
  return error ? { erreur: codeErreur(error) } : { note: data };
}

/** Toutes les notes, les plus récemment modifiées d'abord. */
export async function listerNotes() {
  const { data, error } = await client.from('notes').select(COLONNES).order('updated_at', { ascending: false });
  return error ? { erreur: codeErreur(error) } : { notes: data };
}

export async function creerNote(champs) {
  return resultat(await client.from('notes').insert(champs).select(COLONNES).single());
}

/** Modifie les champs donnés (title, content, folder, tags). */
export async function modifierNote(id, champs) {
  return resultat(await client.from('notes').update(champs).eq('id', id).select(COLONNES).single());
}

export async function supprimerNote(id) {
  const { error } = await client.from('notes').delete().eq('id', id);
  return error ? { erreur: codeErreur(error) } : {};
}
