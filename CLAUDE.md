# cairn-md — consignes pour Claude

## Le projet
- **Cairn** : appli perso de prise de notes en Markdown, des notes empilées et reliées par des liens `[[Titre]]`. Dépôt et URL : **Tirashi/cairn-md** (GitHub Pages) ; nom affiché dans l'interface : « Cairn ». Un seul utilisateur.
- **Cahier des charges : [`specs/plan-v1.md`](specs/plan-v1.md)** (modèle de données, structure, étapes 1 à 7, portabilité). **Le lire avant** de toucher au schéma, à l'accès aux données, à l'export/import ou au thème.
- Front statique en **HTML/CSS/JS vanilla, sans build** : le fichier poussé est celui que sert GitHub Pages. Bibliothèques **via CDN, version exacte épinglée** : `supabase-js`, `marked`, `DOMPurify`, `JSZip`. Pas de npm.
- Backend : **Supabase** (authentification + table `notes`, notes en Markdown brut dans `content`). Inscriptions publiques désactivées.
- Structure prévue : `index.html`, `css/style.css`, `assets/` (`logo.svg`, `icon-maskable.svg`), `js/` (`main.js` routage par hash, `config.js`, `supabase.js`, `auth.js`, `notes.js`, `markdown.js`, `ui.js`, `export.js`).
- Identité : esprit ludique, minimaliste, geek ; **thème sombre par défaut** (fond `#121212`, texte `#e6e6e6`, accent ambre `#f0b45a`), couleurs en variables CSS sur `:root`, redéfinies par `[data-theme="light"]`. Le logo (trois tablettes de pierre, `[[ ]]` gravé en bas) est fourni : ne pas le redessiner sans demande.
- Projet voisin : la **Ludothèque 16 bits** (**Tirashi/Claude**), dont ce fichier reprend les règles de travail. Les deux projets restent **indépendants** (pas de base ni de code partagés).

## Règles techniques de Cairn
- **Un seul point d'accès aux données** : seuls `js/supabase.js` et `js/notes.js` parlent à Supabase (aucun autre fichier n'importe `supabase-js`). URL et clé `anon` uniquement dans `js/config.js`. But : pouvoir migrer vers un VPS en ne touchant que ces fichiers.
- Schéma en **Postgres standard** (seul `auth.uid()` est propre à Supabase) ; toute modification du schéma va dans un fichier SQL du dépôt et dans le cahier des charges.
- Tout HTML rendu depuis du Markdown passe **toujours** par `DOMPurify`.
- `localStorage` seulement pour les préférences (thème…), toujours dans un `try/catch`.
- Responsive : mobile = un panneau à la fois ; desktop = 3 colonnes en CSS Grid ; cibles tactiles ≥ 44 px.

## Règles de travail
- Répondre **en français**.
- **Maquette d'abord** : avant de programmer une nouvelle fonctionnalité visible ou de refaire une interface, faire une petite maquette (artefact, dans `maquettes/`, 2 ou 3 directions) et **attendre que l'utilisateur la valide** ; on ne programme qu'ensuite, d'après la direction choisie.
- Développer et pousser **uniquement sur la branche de travail** de la session. Ne pousser sur `main` **que quand l'utilisateur dit « mets à jour main »**, en avance rapide uniquement.
- Messages de commit en français, écrits dans un fichier puis `git commit -F`.
- Tests : lancer en local seulement les vérifications rapides avant chaque push ; les tests lourds sont laissés à la CI (à lancer en local seulement pour déboguer un échec). Après le push, regarder le résultat de la CI **avant de mettre à jour `main`**.
- **Sécurité** : ne jamais demander, stocker ni committer la clé `service_role`, le mot de passe de la base ou du compte, ni aucune note. Seules l'URL du projet Supabase et la clé `anon` (publique, la sécurité repose sur la RLS) sont dans le code, dans `js/config.js`. Vérifier la RLS avec un second compte de test avant de publier.
- **Supabase n'est sans doute pas joignable** depuis l'environnement de Claude (proxy) : tester avec un faux backend en mémoire, puis demander un essai réel à l'utilisateur.
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
- **Démarrage** (05/11) : `CLAUDE.md`, plan V1 (`specs/plan-v1.md`) et logos (`assets/`) en place. Prochaine étape : maquette de l'interface (mobile et desktop, sombre) à valider, puis étape 1 (Supabase, à faire par l'utilisateur) et étape 2 (squelette et connexion).
