# Cairn

Application personnelle de prise de notes en Markdown : des notes empilées et reliées entre elles par des liens `[[Titre]]`, comme les pierres d'un cairn qui marque le chemin.

Front statique (HTML/CSS/JS sans build) publié sur GitHub Pages ; Supabase pour la connexion et le stockage. Cahier des charges : [`specs/plan-v1.md`](specs/plan-v1.md).

## Mise en route

1. **Supabase** : créer un projet, exécuter [`supabase/schema.sql`](supabase/schema.sql) puis [`supabase/versions.sql`](supabase/versions.sql) (historique) dans *SQL Editor*, créer son compte (*Authentication › Users*), puis désactiver les inscriptions (*Authentication › Sign In / Providers › Allow new users to sign up*). Ajouter l'URL GitHub Pages dans *Authentication › URL Configuration*.
2. **Configuration** : copier l'URL du projet et la clé `anon` (*Settings › API*) dans [`js/config.js`](js/config.js). La clé `anon` est publique ; **ne jamais** y mettre la clé `service_role`.
3. **GitHub Pages** : *Settings › Pages*, publier la branche `main` depuis la racine.

En local : servir le dossier avec n'importe quel serveur statique (les modules ES ne se chargent pas en `file://`), par exemple `python3 -m http.server`.

## Utilisation

- **+ nouvelle** crée une note « sans titre » : taper le titre, Entrée, puis le contenu en Markdown.
- Enregistrement automatique une seconde après la dernière frappe (barre d'état : `○ modifié`, `● enregistré`) ; `Ctrl+S` force l'enregistrement.
- `edit | split | view` : éditeur, les deux côte à côte (ordinateur), ou aperçu. En `split`, faire défiler l'un fait défiler l'autre, section par section. Sur téléphone, un seul panneau à la fois et ← pour revenir à la liste.
- `rm` supprime la note après confirmation.
- **Code** : les blocs ```` ```js ```` (ou sans langage, deviné) sont colorés dans l'aperçu, avec un bouton *copier*. Les blocs ```` ```mermaid ```` deviennent des diagrammes aux couleurs de Cairn (le diagramme garde une taille lisible et défile s'il est trop large).
- **Dossier** : le champ `~/…` sous le titre se tape comme un chemin (`travail/projets`) ; les dossiers existants sont proposés, Entrée valide, Échap annule. Les dossiers n'existent que par leurs notes.
- **Tags** : `+ tag`, puis Entrée ou virgule ; `×` pour retirer.
- **Filtrer** : clic sur un dossier (sous-dossiers compris) ou un tag dans la colonne de gauche (sur téléphone : fil d'Ariane et puces au-dessus de la liste). `mv` renomme le dossier choisi.
- **Rechercher** : `Ctrl+K`, dans les titres et le contenu, sans tenir compte des accents ni des majuscules.
- **Liens** : `[[Titre]]` ou `[[Titre|texte affiché]]`. Taper `[[` (ou le bouton `[[ ]]`, ou `Ctrl+Maj+L`) ouvre une fenêtre de recherche : titres, dossiers et contenu, filtres *partout*, *même dossier* et *récentes* ; un texte sélectionné sert de recherche. Un lien vers une note qui n'existe pas (marqué `+`) propose de la créer. Les notes qui citent la note ouverte sont listées sous l'aperçu (liens entrants). Après avoir renommé une note, Cairn propose de mettre à jour les liens des autres notes.
- **Exporter** : menu `⋯` › `$ export` télécharge `cairn-AAAA-MM-JJ.zip`, un fichier `.md` par note rangé dans ses dossiers, avec un en-tête :
  ```markdown
  ---
  id: 8f3a…
  title: "Ma note"
  folder: "Travail/Projets"
  tags: ["dev", "idée"]
  created_at: …
  updated_at: 2026-11-04T22:30:00Z
  ---
  Contenu en Markdown…
  ```
  C'est aussi la **sauvegarde** indépendante de Supabase : à faire régulièrement.
- **Importer** : menu `⋯` › `$ import` (un `.zip` ou des `.md`) ou `$ import dossier`. Rien n'est modifié avant d'avoir vérifié le récapitulatif : notes **nouvelles** (pas d'`id`, ou `id` inconnu), **modifiées**, **en conflit** (modifiées dans Cairn depuis l'export, ou titre déjà pris par une autre note) et identiques (ignorées). Pour chaque conflit : garder Cairn (par défaut), prendre le fichier, ou garder les deux (copie « … (import) ») ; « voir le détail » compare les deux versions. L'en-tête fait foi (titre, dossier, tags) ; sans en-tête, le titre et le dossier viennent du nom et du chemin du fichier. Une sauvegarde `.zip` est téléchargée avant d'importer (case cochée par défaut) : c'est le retour arrière.
- **Avec Claude** : exporter, ouvrir le dossier dans Claude Code, trier, reformuler, ajouter des `[[liens]]` (garder les `id` ; renommer un titre est possible), puis réimporter le zip ou le dossier.
- **Installer Cairn** (application) : une carte le propose après la connexion (« plus tard » la fait taire 30 jours), et le menu `⋯` › « ⤓ installer Cairn ». Sur Android et sur ordinateur (Chrome, Edge), le navigateur installe directement ; sur iPhone et iPad, Safari impose *Partager › Sur l'écran d'accueil*.
- **Hors ligne** : Cairn s'ouvre et fonctionne sans réseau. Les notes modifiées ou créées sont gardées sur l'appareil (point `•` dans la liste, `○ hors ligne · 2 en attente` dans la barre d'état) et envoyées d'elles-mêmes au retour du réseau (« ● 2 notes synchronisées »). Si une note a aussi changé ailleurs entre-temps, une fenêtre compare les deux versions : garder cet appareil, garder le serveur, ou les deux (copie « … (appareil) »). La copie locale est effacée à la déconnexion ; Cairn prévient si des modifications ne sont pas encore parties.
- **Historique** : bouton `log` de la note (sur téléphone : menu `⋯` › `$ log`). Les versions sont gardées par la base, au plus une toutes les 10 minutes d'écriture, puis éclaircies avec le temps (tout pendant 24 h, une par jour pendant un mois, une par semaine pendant un an, une par mois au-delà ; 50 au plus par note). Choisir une version montre ce qui a changé depuis (vert ajouté, rouge retiré) ; `voir` l'affiche rendue ; `restaurer` remet son contenu, son dossier et ses tags (le titre reste), après avoir gardé l'état actuel comme version. Il faut le réseau. Supprimer une note supprime son historique ; l'export ne contient pas l'historique.
- **Plusieurs appareils** : en revenant sur Cairn (appli rouverte, onglet repris) puis toutes les 60 s tant qu'il est affiché, les notes modifiées ou supprimées ailleurs sont reprises (« ↻ mise à jour depuis un autre appareil »). Seuls les identifiants et dates sont demandés, puis le contenu des seules notes changées : quelques Ko, pour rester loin des limites de Supabase. Si une note a été modifiée sur deux appareils à la fois, rien n'est écrasé : la fenêtre de conflit compare les deux versions.
- Deux notes ne peuvent pas avoir le même titre (sans tenir compte des majuscules), pour que les liens `[[Titre]]` restent sans ambiguïté.

## Essais

`node outils/essai.js` (nécessite Playwright) : sert le dépôt en local, remplace `supabase-js` par un faux backend en mémoire ([`outils/faux-supabase.js`](outils/faux-supabase.js), compte `essai@cairn.local` / `secret`) et vérifie la connexion, le thème, les notes (création, édition, sauvegarde automatique, titres en double, panne réseau, suppression), l'aperçu Markdown assaini, les dossiers, tags, recherche, liens et renommages, le code coloré et mermaid, l'historique des versions, l'export et l'import, le hors ligne (copie locale, file d'attente, conflits, déconnexion), l'application installable (service worker, cache, ouverture sans réseau, carte d'installation) et l'affichage sur téléphone. `marked` et `DOMPurify` sont pris sur le registre npm (même version que le CDN) et gardés dans `outils/.cache/`. Lancé aussi par la CI à chaque push.

## Crédits

- [supabase-js](https://github.com/supabase/supabase-js) — Supabase, licence MIT, chargé depuis [jsDelivr](https://www.jsdelivr.com/package/npm/@supabase/supabase-js).
- [marked](https://github.com/markedjs/marked) — Christopher Jeffrey et contributeurs, licence MIT, chargé depuis [jsDelivr](https://www.jsdelivr.com/package/npm/marked).
- [DOMPurify](https://github.com/cure53/DOMPurify) — Cure53, licence MPL-2.0 ou Apache-2.0, chargé depuis [jsDelivr](https://www.jsdelivr.com/package/npm/dompurify).
- [highlight.js](https://github.com/highlightjs/highlight.js) — Ivan Sagalaev et contributeurs, licence BSD-3-Clause, chargé à la demande depuis [jsDelivr](https://www.jsdelivr.com/package/npm/@highlightjs/cdn-assets).
- [Mermaid](https://github.com/mermaid-js/mermaid) — Knut Sveidqvist et contributeurs, licence MIT, chargé à la demande depuis [jsDelivr](https://www.jsdelivr.com/package/npm/mermaid).
- [JSZip](https://github.com/Stuk/jszip) — Stuart Knightley et contributeurs, licence MIT (ou GPLv3), chargé à la demande depuis [jsDelivr](https://www.jsdelivr.com/package/npm/jszip).
- [JetBrains Mono](https://www.jetbrains.com/lp/mono/) — JetBrains, licence SIL Open Font License 1.1, chargée depuis [Google Fonts](https://fonts.google.com/specimen/JetBrains+Mono).
