# Cairn — Appli de notes Markdown — Plan V1

**Cairn** : application perso de prise de notes en Markdown. Des notes empilées et reliées entre elles, comme les pierres d'un cairn qui marque le chemin. Dépôt et URL : `cairn-md` ; nom affiché dans l'interface : « Cairn ».

Front statique (HTML/CSS/JS vanilla, sans build) hébergé sur GitHub Pages, Supabase pour l'authentification et le stockage.

## Principes

- Un seul dépôt, un seul service (Supabase). Pas de serveur MCP en V1.
- Un seul utilisateur : inscriptions publiques désactivées dans Supabase.
- Les notes sont stockées en **Markdown brut** dans `content`.
- La clé `anon` est publique : la sécurité repose sur la RLS. La clé `service_role` n'apparaît jamais dans le dépôt.
- Aucune note, aucun secret dans le dépôt GitHub.

## Modèle de données

```sql
create table notes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id),
  title       text not null,
  content     text not null default '',
  folder      text not null default '',      -- ex. 'Travail/Projets'
  tags        text[] not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Titres uniques (insensibles à la casse) pour que [[Titre]] soit non ambigu
create unique index notes_user_title_uq on notes (user_id, lower(title));
create index notes_tags_gin on notes using gin (tags);
create index notes_folder_idx on notes (user_id, folder);

-- updated_at automatique
create function set_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end $$ language plpgsql;
create trigger notes_updated before update on notes
  for each row execute function set_updated_at();

-- RLS : chacun ne voit que ses notes
alter table notes enable row level security;
create policy "own notes" on notes
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
```

Les liens `[[Titre]]` sont calculés dans le front en V1 (rendu + backlinks par recherche dans `content`). Une table `note_links` pourra être ajoutée plus tard.

## Structure du dépôt

```
/
├── index.html
├── css/style.css
├── assets/
│   ├── logo.svg           # logo source (favicon, écran de connexion)
│   └── icon-maskable.svg  # version avec marge pour l'icône PWA
├── js/
│   ├── main.js        # point d'entrée, routage simple (hash)
│   ├── supabase.js    # client (supabase-js via CDN)
│   ├── auth.js        # login / logout / session
│   ├── notes.js       # CRUD
│   ├── markdown.js    # marked + DOMPurify + liens [[...]]
│   ├── ui.js          # liste, éditeur, filtres, responsive
│   └── export.js      # export / import zip
└── README.md
```

Bibliothèques via CDN : `supabase-js`, `marked`, `DOMPurify`, `JSZip`.

## Étapes

### 1. Supabase
- Créer le projet, exécuter le SQL ci-dessus.
- Auth : créer son compte, puis désactiver les inscriptions (Sign-ups).
- Renseigner l'URL du site GitHub Pages dans les URL de redirection autorisées.

### 2. Squelette et connexion
- Page de login (email + mot de passe), gestion de session, déconnexion.
- Tant que non connecté : seul l'écran de login est affiché.

### 3. CRUD et rendu Markdown
- Liste des notes, création, édition (`<textarea>`), suppression avec confirmation.
- Aperçu rendu avec `marked`, **toujours** passé dans `DOMPurify`.
- Sauvegarde automatique (debounce ~1 s) + indicateur « enregistré ».

### 4. Dossiers, tags, liens
- Dossier = chemin texte ; l'arborescence est déduite des chemins.
- Tags : saisie, filtre par tag, filtre par dossier, recherche (`ilike` sur titre et contenu).
- `[[Titre]]` rendu en lien cliquable ; lien vers une note inexistante = proposition de la créer.
- Panneau de backlinks (notes qui contiennent `[[Titre actuel]]`).
- Renommer une note : proposer de mettre à jour les `[[...]]` des autres notes.
- Renommer un dossier : `update` sur toutes les notes concernées.

### 5. Responsive
- **Mobile** : un seul panneau à la fois (liste → note), bascule édition / aperçu, dossiers en liste avec fil d'Ariane.
- **Desktop** : 3 colonnes (dossiers/tags, liste, éditeur + aperçu/backlinks) en CSS Grid.
- Cibles tactiles ≥ 44 px, `viewport` correct.

### 5 bis. Thème sombre
- **Thème sombre par défaut**, avec un bouton pour basculer vers un thème clair (choix mémorisé dans `localStorage`, dans un try/catch).
- Couleurs définies en variables CSS (`--bg`, `--surface`, `--text`, `--muted`, `--accent`, `--border`, `--code-bg`) sur `:root`, redéfinies par `[data-theme="light"]`.
- Appliquer le thème dans un petit script inline dans le `<head>`, avant le rendu, pour éviter le flash blanc au chargement.
- `<meta name="color-scheme" content="dark light">` et `<meta name="theme-color">` (barre du navigateur mobile, et plus tard de la PWA) mis à jour selon le thème.
- Éviter le noir pur : fond gris très foncé (~`#121212`), texte blanc cassé (~`#e6e6e6`), contraste WCAG AA vérifié.
- Soigner le rendu Markdown en sombre : blocs de code, citations, tableaux, liens `[[...]]`, liens normaux, sélection de texte.
- Si aucun choix n'est enregistré, suivre `prefers-color-scheme` ; sinon, sombre.

### 5 ter. Identité visuelle (Cairn)
- **Esprit** : ludique, minimaliste, geek, design, simple.
- **Logo** : trois tablettes de pierre empilées, de plus en plus petites vers le haut, légèrement inclinées (posées à la main). Fichiers fournis : `assets/logo.svg` et `assets/icon-maskable.svg`.
  - Tablette du bas : gravure `[[ ]]` (clin d'œil aux liens entre notes).
  - Tablette du haut : couleur d'accent.
  - Lisible en petit (favicon 16–32 px) : formes épaisses, coins arrondis, un seul détail gravé.
- **Palette** (à déclarer en variables CSS, cf. 5 bis) :
  - Fond : `#121212` · surface : à choisir autour de `#1b1d21`
  - Pierres : `#5b5f66` (bas), `#7a7f88` (milieu), gravure `#2a2d33`
  - **Accent : `#f0b45a`** (ambre) : liens, sélection, bouton principal, tablette du haut du logo
- **Utilisation du logo** : favicon (`<link rel="icon" type="image/svg+xml" href="assets/logo.svg">`), écran de connexion, en-tête de l'appli.
- **PWA (plus tard)** : générer des PNG 192 et 512 px à partir de `icon-maskable.svg` (déjà avec marge de sécurité) ; `theme-color` = `#121212`.
- Vérifier le contraste de l'accent sur fond sombre (texte `#e6e6e6`, WCAG AA) et prévoir une variante plus foncée de l'accent pour le thème clair.

### 6. Export / import
**Export** : zip avec un fichier `.md` par note, rangé dans l'arborescence des dossiers.

```markdown
---
id: 8f3a...
title: Ma note
folder: Travail/Projets
tags: [dev, idée]
updated_at: 2026-11-04T22:30:00Z
---
Contenu en Markdown...
```

**Import** (zip ou dossier) :
- `id` présent → mise à jour de la note ; absent → nouvelle note.
- Le frontmatter fait foi (dossier, tags, titre).
- Conflit : si `updated_at` en base est plus récent que celui du fichier, afficher « modifiée depuis l'export » et demander quoi faire.
- Écran de prévisualisation avant import : X créées, Y modifiées, Z en conflit.
- Exporter avant chaque import = retour arrière.

Usage avec Claude : ouvrir le dossier exporté dans Claude Code, trier / reformuler / ajouter des `[[liens]]`, sans renommer les titres, puis réimporter.

### 7. Plus tard (hors V1)
- PWA : `manifest.json` + service worker, cache IndexedDB, synchro au retour du réseau.
- Historique des versions (`note_versions`).
- Serveur MCP local pour que Claude Code accède directement aux notes.
- Table `note_links` alimentée par trigger.

## Portabilité (migration possible vers un VPS)

Objectif : pouvoir quitter Supabase plus tard (VPS auto-hébergé) sans réécrire l'appli.

- **Un seul point d'accès aux données** : tous les appels à Supabase (auth + notes) passent par `js/supabase.js` et `js/notes.js`. Aucun autre fichier n'importe `supabase-js`. Changer de backend ne touche alors que ces deux fichiers.
- **Postgres standard** : pas de fonctionnalité propre à Supabase dans le schéma, hormis `auth.uid()` dans la RLS. Une migration passe par `pg_dump` puis restauration sur un Postgres classique.
- **Notes en Markdown brut** dans `content`, métadonnées dans des colonnes simples (`folder`, `tags`) : le format d'export/import reste valable quel que soit le backend.
- **Exports réguliers** : exporter le zip Markdown avant tout changement important et de temps en temps. C'est la sauvegarde indépendante de Supabase.
- **Configuration isolée** : URL et clé `anon` dans un seul fichier `js/config.js`, jamais dispersées dans le code.
- **Pas de couplage entre projets** : chaque projet (notes, autres) reste un dépôt autonome. On ne mutualise (connexion, base commune) qu'au moment de la migration, si le besoin est réel.

## Points de vigilance

- Ne jamais committer de clé `service_role` ni de notes.
- Toujours assainir le HTML rendu (DOMPurify).
- Vérifier la RLS avec un second compte de test avant de publier.
- Les projets Supabase gratuits sont mis en pause après inactivité : garder des exports réguliers.
