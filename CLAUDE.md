# cairn-md — consignes pour Claude

## Le projet
- **Cairn** : appli perso de prise de notes en Markdown, des notes empilées et reliées par des liens `[[Titre]]`. Dépôt et URL : **Tirashi/cairn-md** (GitHub Pages) ; nom affiché dans l'interface : « Cairn ». Un seul utilisateur.
- **Cahier des charges : [`specs/plan-v1.md`](specs/plan-v1.md)** (modèle de données, structure, étapes 1 à 7, portabilité). **Le lire avant** de toucher au schéma, à l'accès aux données, à l'export/import ou au thème.
- Front statique en **HTML/CSS/JS vanilla, sans build** : le fichier poussé est celui que sert GitHub Pages. Bibliothèques **via CDN, version exacte épinglée** : `supabase-js`, `marked`, `DOMPurify`, `JSZip`. Pas de npm.
- Backend : **Supabase** (authentification + table `notes`, notes en Markdown brut dans `content`). Inscriptions publiques désactivées.
- Structure : `index.html` (tous les écrans : chargement, config manquante, connexion, appli), `css/style.css`, `assets/` (`logo.svg`, `icon-maskable.svg`), `js/` en **modules ES** (`main.js` choix de l'écran et routage par hash, `config.js`, `supabase.js` client + fonctions d'auth, `auth.js` écran de connexion, `theme.js` bascule sombre/clair, `notes.js` CRUD, `markdown.js` rendu assaini + coloration de l'éditeur, `ui.js` orchestration (liste, éditeur, sauvegarde, routes `#/` et `#/note/<id>`, renommages), `arbre.js` dossiers/tags/filtres (fonctions pures), `liens.js` liens `[[…]]` (fonctions pures), `navigation.js` arbre + tags + fil d'Ariane mobile, `meta.js` champ dossier et tags de la note, `suggestions.js` listes de suggestions au clavier, `dialogue.js` dialogue unique, `palette.js` fenêtre « lier une note » (recherche + filtres), `rendu-avance.js` code coloré + mermaid dans l'aperçu (chargés à la demande) ; à venir : `export.js`), `supabase/schema.sql`, `outils/` (essais), `maquettes/`.
- Versions épinglées (`+esm` sur jsDelivr) : `supabase-js` **2.118.0** (`js/supabase.js`), `marked` **18.1.1** et `DOMPurify` **3.4.17** (`js/markdown.js`), `@highlightjs/cdn-assets` **11.12.0** (`es/highlight.min.js`) et `mermaid` **12.2.0** (`dist/mermaid.esm.min.mjs`, en morceaux) dans `js/rendu-avance.js`, **importés seulement si la note a du code ou un diagramme** ; Playwright **1.63.0** dans la CI. L'essai prend ces bibliothèques sur le registre npm à la version lue dans `js/` (cache `outils/.cache/`, ignoré par git, mis en cache dans la CI).
- **Dossiers et tags** (étape 4, direction A « chemin éditable ») : dossier = chemin `A/B` normalisé (`normaliserDossier`), casse d'un dossier existant reprise ; tags en minuscules sans `#` ni espaces. **Recherche faite dans le navigateur** sur les notes déjà chargées (titre + contenu, sans accents ni casse) au lieu d'un `ilike` côté serveur : même résultat, instantané. Liens `[[Titre]]` / `[[Titre|texte]]` résolus sans tenir compte de la casse (extension `marked`, jamais dans le code).
- **Aperçu enrichi** : le SVG de mermaid repasse par DOMPurify (profil svg, `htmlLabels: false`, `securityLevel: 'strict'`) ; thème mermaid tiré des variables CSS, redessiné au changement de thème (événement `cairn-theme`). Détection auto du langage limitée aux langages courants (seuil de pertinence 3), sinon le code reste brut.
- **Éditeur** : `<textarea>` transparent posé sur les lignes colorées (`#editeur-fond`, une `.ed-ligne` par ligne, numéros en CSS). Les deux couches doivent garder exactement la même police, taille, marge et coupure : la coloration ne change **que les couleurs** (pas de gras réel, pas de taille différente).
- **Direction visuelle retenue (05/11) : B « Terminal »** de la [maquette](https://claude.ai/artifact/5bt29wqWkuZcnrFtcC32sZ) (`maquettes/interface/`) : tout en JetBrains Mono, coins de 6 px, filets `#2a2d33`, dossiers en arborescence `├─`, notes affichées comme `nom.md`, recherche façon invite `>`, éditeur avec numéros de ligne et Markdown coloré, suggestions à la frappe de `[[`, barre d'état (enregistré, liens entrants). Desktop : barre du haut, dossiers/tags (240 px), liste (320 px), note en `edit | split | view` avec liens entrants sous l'aperçu.
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
- Tests : `node outils/essai.js` avant chaque push (Playwright, sans réseau : faux `supabase-js` dans `outils/faux-supabase.js`, compte `essai@cairn.local` / `secret` ; `--captures <dossier>` pour des captures). La CI (`.github/workflows/essais.yml`) le relance à chaque push : regarder son résultat **avant de mettre à jour `main`**. Chaque nouvelle fonctionnalité ajoute ses vérifications à l'essai (et au faux backend si besoin).
- Le CDN (jsDelivr) et Supabase **ne sont pas joignables** depuis l'environnement de Claude : les versions se vérifient sur `registry.npmjs.org`.
- **Sécurité** : ne jamais demander, stocker ni committer la clé `service_role`, le mot de passe de la base ou du compte, ni aucune note. Seules l'URL publique `https://laboemcpllcfozovwcsj.supabase.co` et la clé publiable `sb_publishable_phhTawzmnPxi-HRQH-C_3g_7hyUTt5_` (publique, la sécurité repose sur la RLS) sont dans le code, dans `js/config.js` ; jamais de clé `sb_secret_…`. Vérifier la RLS avec un second compte de test avant de publier.
- Supabase n'étant pas joignable d'ici, tester avec le faux backend, puis demander un essai réel à l'utilisateur.
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
- **Éditeur aligné** (05/11) : chaque `.ed-ligne` doit garder une hauteur, même vide et même dans un bloc de code (caractère invisible `\u200b`). Une ligne de hauteur nulle décale tout le texte affiché par rapport au curseur réel. L'essai vérifie l'alignement sur une note plus haute que l'écran (sinon la mesure est faussée).

## En cours / à vérifier
Une phrase par chantier ; le détail va dans [`specs/suivi.md`](specs/suivi.md).
- **Démarrage** (05/11) : `CLAUDE.md`, plan V1 (`specs/plan-v1.md`) et logos (`assets/`) en place. **Maquette** ([artefact](https://claude.ai/artifact/5bt29wqWkuZcnrFtcC32sZ)) : direction B choisie, desktop validé.
- **Étape 2** (05/11) : connexion validée sur le vrai site (https://tirashi.github.io/cairn-md/). **Reste** : vérifier la RLS avec un second compte.
- **Étape 3** (05/11) : CRUD, éditeur coloré, aperçu assaini, sauvegarde auto, suppression, mobile ; validée sur le vrai site.
- **Étape 4** (05/11) : dossiers, tags, filtres, recherche, liens `[[…]]`, liens entrants, suggestions `[[`, renommage de note (mise à jour des liens) et de dossier ; testée avec le faux backend, **essai réel à faire**. Ensuite : étape 5 (responsive, en grande partie fait) puis 6 (export / import).
- **Liens et code** (05/11) : palette « lier une note » (direction A), code coloré, mermaid ; testés avec le faux backend, **essai réel à faire**.
