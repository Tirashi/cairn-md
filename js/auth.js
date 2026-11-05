// Écran de connexion et déconnexion (interface ; les appels réseau sont dans supabase.js).
import { connexion, deconnexion } from './supabase.js';

const MESSAGES = {
  'vide': 'Renseigner l\'email et le mot de passe.',
  'identifiants': 'Email ou mot de passe incorrect.',
  'non-confirme': 'Adresse email pas encore confirmée.',
  'trop-de-tentatives': 'Trop de tentatives, réessayer dans un moment.',
  'reseau': 'Serveur injoignable. Vérifier la connexion.',
  'inconnue': 'La connexion a échoué.',
};

export function brancherConnexion() {
  const form = document.getElementById('form-connexion');
  const email = document.getElementById('connexion-email');
  const mdp = document.getElementById('connexion-mdp');
  const message = document.getElementById('connexion-message');
  const bouton = document.getElementById('connexion-bouton');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    message.textContent = '';
    const valeurEmail = email.value.trim();
    if (!valeurEmail || !mdp.value) {
      message.textContent = MESSAGES.vide;
      (valeurEmail ? mdp : email).focus();
      return;
    }

    bouton.disabled = true;
    bouton.textContent = 'connexion…';
    let resultat;
    try {
      resultat = await connexion(valeurEmail, mdp.value);
    } catch {
      resultat = { erreur: 'reseau' };
    }
    bouton.disabled = false;
    bouton.textContent = 'se connecter';

    if (resultat.erreur) {
      message.textContent = MESSAGES[resultat.erreur] || MESSAGES.inconnue;
      mdp.select();
      return;
    }
    // Succès : surChangementSession (main.js) affiche l'application.
    mdp.value = '';
  });
}

export function brancherDeconnexion() {
  document.getElementById('bouton-deconnexion').addEventListener('click', async () => {
    try {
      await deconnexion();
    } catch {
      // Même en cas d'erreur réseau, la session locale est effacée par supabase-js.
    }
  });
}

export function reinitialiserConnexion() {
  document.getElementById('connexion-message').textContent = '';
  document.getElementById('connexion-mdp').value = '';
}
