// Point d'entrée : choisit l'écran selon la session, routage simple par hash.
import { configure, utilisateurActuel, surChangementSession } from './supabase.js';
import { brancherConnexion, brancherDeconnexion, reinitialiserConnexion } from './auth.js';
import { brancherTheme } from './theme.js';

const ECRANS = ['chargement', 'config', 'connexion', 'appli'];

function afficher(nom) {
  for (const e of ECRANS) document.getElementById('ecran-' + e).hidden = e !== nom;
}

function appliquerSession(utilisateur) {
  if (utilisateur) {
    document.getElementById('etat-utilisateur').textContent = utilisateur.email || '';
    if (location.hash === '#/connexion' || !location.hash) history.replaceState(null, '', '#/');
    afficher('appli');
  } else {
    reinitialiserConnexion();
    history.replaceState(null, '', '#/connexion');
    afficher('connexion');
    document.getElementById('connexion-email').focus();
  }
}

async function demarrer() {
  brancherTheme();
  if (!configure) {
    afficher('config');
    return;
  }
  brancherConnexion();
  brancherDeconnexion();

  let utilisateur = null;
  try {
    utilisateur = await utilisateurActuel();
  } catch {
    utilisateur = null;
  }
  appliquerSession(utilisateur);
  surChangementSession(appliquerSession);
}

demarrer();
