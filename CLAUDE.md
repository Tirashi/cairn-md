# cairn-md — consignes pour Claude

## Le projet
- Dépôt GitHub : **Tirashi/cairn-md**.
- *À compléter* : but du projet, technologies, organisation des dossiers, façon de le lancer et de le tester.
- Projet voisin : la **Ludothèque 16 bits** (**Tirashi/Claude**), dont ce fichier reprend les règles de travail.

## Règles de travail
- Répondre **en français**.
- **Maquette d'abord** : avant de programmer une nouvelle fonctionnalité visible ou de refaire une interface, faire une petite maquette (artefact, dans `maquettes/`, 2 ou 3 directions) et **attendre que l'utilisateur la valide** ; on ne programme qu'ensuite, d'après la direction choisie.
- Développer et pousser **uniquement sur la branche de travail** de la session. Ne pousser sur `main` **que quand l'utilisateur dit « mets à jour main »**, en avance rapide uniquement.
- Messages de commit en français, écrits dans un fichier puis `git commit -F`.
- Tests : lancer en local seulement les vérifications rapides avant chaque push ; les tests lourds sont laissés à la CI (à lancer en local seulement pour déboguer un échec). Après le push, regarder le résultat de la CI **avant de mettre à jour `main`**.
- **Sécurité** : ne jamais demander, stocker ni committer de clé secrète, de mot de passe ou de jeton. Seules des valeurs publiques peuvent être dans le code.
- **Crédits** : toute ressource venue d'ailleurs (bibliothèques, graphismes, polices, données) est citée **dès qu'on l'ajoute** : nom, créateur, licence, lien vers l'endroit où on l'a prise.
- **Économie de tokens** : on peut rester dans la même conversation d'un chantier à l'autre en **compactant le contexte** (`/compact`) ; demandes précises ; peu de captures ; pas de sous-agents ; lire les fichiers par morceaux plutôt qu'en entier. Choix du modèle :
  | Chantier | Modèle |
  |---|---|
  | Retouche, texte, doc, petite correction | Sonnet |
  | Maquette, discussion d'idées | Sonnet (Opus pour une décision importante) |
  | Fonctionnalité moyenne bien définie | opusplan (Opus fait le plan, Sonnet écrit le code) |
  | Gros chantier emmêlé | Opus du début à la fin |
- Forfait : limite hebdomadaire remise à zéro le mercredi à 19 h ; petits chantiers plutôt en fin de semaine.

## Tenir la documentation à jour
**Cycle d'un projet** : **idée** = quelques lignes dans `IDEES.md` ; dès qu'on la travaille (maquette, décisions), elle devient un **chantier** avec son fichier `specs/<chantier>.md`, et `IDEES.md` ne garde qu'une ligne qui y renvoie. Ne rien effacer : une idée abandonnée garde une ligne (❌ et la raison).

À chaque chantier, quand c'est pertinent : `CLAUDE.md` (nouvelle règle, **une ligne** dans « En cours ») ; `specs/suivi.md` (détails du chantier) ; `IDEES.md` (✅, nouvelles idées, préférences) ; `README.md` (description pour les utilisateurs).

## Leçons apprises
*(Rien pour l'instant.)*

## En cours / à vérifier
Une phrase par chantier ; le détail va dans [`specs/suivi.md`](specs/suivi.md).
- **Démarrage** (05/11) : `CLAUDE.md` créé d'après celui de la Ludothèque ; reste à décrire le projet.
