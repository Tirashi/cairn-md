// Boîte de dialogue unique (<dialog id="dialogue">) : confirmation ou saisie.
const $ = (id) => document.getElementById(id);

/**
 * Affiche le dialogue et attend la réponse.
 * options : { commande, nom, texte, ok, danger, champ, valeur }
 * Renvoie la valeur saisie (si `champ`), true (confirmé) ou null (annulé).
 */
export function demander({ commande = '$', nom = '', texte = '', ok = 'ok', danger = false, champ = null, valeur = '' }) {
  const dlg = $('dialogue');
  $('dialogue-commande').textContent = commande;
  $('dialogue-nom').textContent = nom;
  $('dialogue-texte').textContent = texte;
  const bouton = $('dialogue-ok');
  bouton.textContent = ok;
  bouton.className = danger ? 'bouton-danger' : 'bouton-principal';
  const zone = $('dialogue-zone-champ');
  const saisie = $('dialogue-champ');
  zone.hidden = !champ;
  if (champ) {
    $('dialogue-etiquette').textContent = champ;
    saisie.value = valeur;
  }
  dlg.returnValue = '';
  dlg.showModal();
  if (champ) { saisie.focus(); saisie.select(); } else { $('dialogue-annuler').focus(); }

  // Entrée dans le champ = valider (sinon le formulaire prendrait le premier bouton, « annuler »).
  saisie.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); dlg.close('ok'); } };

  return new Promise((ok) => {
    dlg.addEventListener('close', () => {
      if (dlg.returnValue !== 'ok') return ok(null);
      ok(champ ? saisie.value : true);
    }, { once: true });
  });
}
