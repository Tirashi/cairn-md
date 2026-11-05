// Configuration de Cairn : le seul endroit où figurent l'URL et la clé du backend.
//
// La clé `anon` est publique : la sécurité repose sur la RLS de la table `notes`.
// Ne JAMAIS mettre ici la clé `service_role` ni un mot de passe.
//
// Valeurs du projet Supabase « cairn » (Project Settings › API Keys) :
// URL racine du projet (sans /rest/v1/) et clé publiable (sb_publishable_…).
export const SUPABASE_URL = 'https://laboemcpllcfozovwcsj.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_phhTawzmnPxi-HRQH-C_3g_7hyUTt5_';
