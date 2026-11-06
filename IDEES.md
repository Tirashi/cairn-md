# Idées pour Cairn

Cycle : une **idée** tient en quelques lignes ici ; dès qu'on la travaille (maquette, décisions), elle devient un **chantier** avec son fichier `specs/<chantier>.md` (ou une section de [`specs/suivi.md`](specs/suivi.md)) et ne garde ici qu'une ligne qui y renvoie. Rien n'est effacé : ✅ fait, ❌ abandonné (avec la raison).

## Faites
- ✅ V1 du plan (étapes 1 à 6) : connexion, notes, dossiers, tags, recherche, liens `[[…]]`, export / import → [`specs/plan-v1.md`](specs/plan-v1.md), détail dans [`specs/suivi.md`](specs/suivi.md).
- ✅ Fenêtre « lier une note » avec recherche, pour les centaines de notes (direction A) → [suivi](specs/suivi.md#liens-et-code-0511).
- ✅ Code coloré et diagrammes mermaid dans l'aperçu → [suivi](specs/suivi.md#liens-et-code-0511).
- ✅ Défilement lié éditeur ↔ aperçu en split → [suivi](specs/suivi.md#défilement-lié-0611).
- ✅ Historique des versions (direction A, une version par séance, tri dans le temps) → [suivi](specs/suivi.md#historique-des-versions-0611).
- ✅ Plusieurs appareils : reprise des changements faits ailleurs, conflit au lieu d'écraser → [suivi](specs/suivi.md#plusieurs-appareils-0611).
- ✅ PWA : installable, hors ligne, synchronisation et conflits (premier point du « plus tard » du plan) → [suivi](specs/suivi.md#pwa-et-hors-ligne-0511).

## À faire (retenues le 06/11)
- ✅ **Note du jour** (06/11) → [suivi](specs/suivi.md#note-du-jour-et-listes-0611). Avec : listes continuées à Entrée.
- **Déplacer une note** dans un autre dossier : déjà possible par le champ `~/…` sous le titre ; à rendre plus évident (glisser-déposer sur ordinateur, action `mv`, plusieurs notes d'un coup ?). À préciser.
- ✅ Cases à cocher cliquables dans l'aperçu et page « tâches ouvertes » (06/11) → [suivi](specs/suivi.md#tâches-ouvertes-0611).
- **Recherche avancée** : filtres combinables, ex. `tag:dev dossier:travail "mot exact"`.
- **Imprimer / PDF** : une note avec une mise en page propre de l'aperçu.

## Mises de côté (06/11, à reprendre si le besoin se fait sentir)
- **Plan de la note** : liste cliquable des titres `#` de la note ouverte, pour les longues notes.
- **Palette de commandes** (`Ctrl+P`) : aller à une note ou lancer une action (nouvelle note, export, thème…) au clavier, en réutilisant la fenêtre « lier une note ».

## Autres idées proposées (06/11)
- Modèles de notes (`{{date}}`) ; coller une image (stockage Supabase, 1 Go gratuit) ; épingler des notes ; notes orphelines et liens cassés ; graphe des notes ; partager une note en lecture par lien public (RLS à part).

## À travailler (« plus tard » du plan)
- ⏸️ **Accès MCP** (reporté le 06/11 : à faire quand Cairn sera sur un VPS) : petit serveur local pour que Claude Code lise et modifie les notes directement, sans passer par l'export / import. Doit respecter le point d'accès unique aux données et ne jamais utiliser la clé `service_role`.
- **Table `note_links`** alimentée par trigger : liens calculés côté base. Utile seulement avec des milliers de notes ; en attendant, calcul dans le navigateur.

## Préférences relevées
- Direction visuelle B « Terminal » (tout en JetBrains Mono), thème sombre par défaut.
- Toujours une maquette en 2 ou 3 directions avant de coder ; l'utilisateur combine volontiers (ex. « A avec le détail de C », « A + la carte de B »).
- Les actions qui modifient beaucoup de notes passent par un récapitulatif à valider et une sauvegarde avant (import, renommages).
