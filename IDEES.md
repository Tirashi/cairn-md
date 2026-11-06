# Idées pour Cairn

Cycle : une **idée** tient en quelques lignes ici ; dès qu'on la travaille (maquette, décisions), elle devient un **chantier** avec son fichier `specs/<chantier>.md` (ou une section de [`specs/suivi.md`](specs/suivi.md)) et ne garde ici qu'une ligne qui y renvoie. Rien n'est effacé : ✅ fait, ❌ abandonné (avec la raison).

## Faites
- ✅ V1 du plan (étapes 1 à 6) : connexion, notes, dossiers, tags, recherche, liens `[[…]]`, export / import → [`specs/plan-v1.md`](specs/plan-v1.md), détail dans [`specs/suivi.md`](specs/suivi.md).
- ✅ Fenêtre « lier une note » avec recherche, pour les centaines de notes (direction A) → [suivi](specs/suivi.md#liens-et-code-0511).
- ✅ Code coloré et diagrammes mermaid dans l'aperçu → [suivi](specs/suivi.md#liens-et-code-0511).
- ✅ Défilement lié éditeur ↔ aperçu en split → [suivi](specs/suivi.md#défilement-lié-0611).
- ✅ PWA : installable, hors ligne, synchronisation et conflits (premier point du « plus tard » du plan) → [suivi](specs/suivi.md#pwa-et-hors-ligne-0511).

## À travailler (« plus tard » du plan)
- **Historique des versions** : table `note_versions`, retrouver ou restaurer une ancienne version d'une note. Questions : à chaque sauvegarde ou par intervalle ? combien de versions garder ? comparaison visuelle (le détail C de l'import pourrait servir) ?
- **Accès MCP** : petit serveur local pour que Claude Code lise et modifie les notes directement, sans passer par l'export / import. Doit respecter le point d'accès unique aux données et ne jamais utiliser la clé `service_role`.
- **Table `note_links`** alimentée par trigger : liens calculés côté base. Utile seulement avec des milliers de notes ; en attendant, calcul dans le navigateur.

## Préférences relevées
- Direction visuelle B « Terminal » (tout en JetBrains Mono), thème sombre par défaut.
- Toujours une maquette en 2 ou 3 directions avant de coder ; l'utilisateur combine volontiers (ex. « A avec le détail de C », « A + la carte de B »).
- Les actions qui modifient beaucoup de notes passent par un récapitulatif à valider et une sauvegarde avant (import, renommages).
