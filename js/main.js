// Point d'entrée : choisit l'écran selon la session, routage simple par hash.
import { configure, utilisateurActuel, surChangementSession } from './supabase.js';
import { brancherConnexion, brancherDeconnexion, reinitialiserConnexion } from './auth.js';
import { brancherTheme } from './theme.js';
import { demarrerAppli, arreterAppli, toutEnregistrer } from './ui.js';

const ECRANS = ['chargement', 'config', 'connexion', 'appli'];

function afficher(nom) {
  for (const e of ECRANS) document.getElementById('ecran-' + e).hidden = e !== nom;
}

let connecte = null;   // id de l'utilisateur affiché

function appliquerSession(utilisateur) {
  if (utilisateur) {
    document.getElementById('etat-utilisateur').textContent = utilisateur.email || '';
    if (location.hash === '#/connexion' || !location.hash) history.replaceState(null, '', '#/');
    afficher('appli');
    // onAuthStateChange se déclenche aussi au renouvellement du jeton : ne pas tout recharger.
    if (connecte !== utilisateur.id) {
      connecte = utilisateur.id;
      demarrerAppli();
    }
  } else {
    connecte = null;
    arreterAppli();
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
  brancherDeconnexion(toutEnregistrer);

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
