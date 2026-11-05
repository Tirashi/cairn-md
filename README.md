# Cairn

Application personnelle de prise de notes en Markdown : des notes empilées et reliées entre elles par des liens `[[Titre]]`, comme les pierres d'un cairn qui marque le chemin.

Front statique (HTML/CSS/JS sans build) publié sur GitHub Pages ; Supabase pour la connexion et le stockage. Cahier des charges : [`specs/plan-v1.md`](specs/plan-v1.md).

## Mise en route

1. **Supabase** : créer un projet, exécuter [`supabase/schema.sql`](supabase/schema.sql) dans *SQL Editor*, créer son compte (*Authentication › Users*), puis désactiver les inscriptions (*Authentication › Sign In / Providers › Allow new users to sign up*). Ajouter l'URL GitHub Pages dans *Authentication › URL Configuration*.
2. **Configuration** : copier l'URL du projet et la clé `anon` (*Settings › API*) dans [`js/config.js`](js/config.js). La clé `anon` est publique ; **ne jamais** y mettre la clé `service_role`.
3. **GitHub Pages** : *Settings › Pages*, publier la branche `main` depuis la racine.

En local : servir le dossier avec n'importe quel serveur statique (les modules ES ne se chargent pas en `file://`), par exemple `python3 -m http.server`.

## Utilisation

- **+ nouvelle** crée une note « sans titre » : taper le titre, Entrée, puis le contenu en Markdown.
- Enregistrement automatique une seconde après la dernière frappe (barre d'état : `○ modifié`, `● enregistré`) ; `Ctrl+S` force l'enregistrement.
- `edit | split | view` : éditeur, les deux côte à côte (ordinateur), ou aperçu. Sur téléphone, un seul panneau à la fois et ← pour revenir à la liste.
- `rm` supprime la note après confirmation.
- **Dossier** : le champ `~/…` sous le titre se tape comme un chemin (`travail/projets`) ; les dossiers existants sont proposés, Entrée valide, Échap annule. Les dossiers n'existent que par leurs notes.
- **Tags** : `+ tag`, puis Entrée ou virgule ; `×` pour retirer.
- **Filtrer** : clic sur un dossier (sous-dossiers compris) ou un tag dans la colonne de gauche (sur téléphone : fil d'Ariane et puces au-dessus de la liste). `mv` renomme le dossier choisi.
- **Rechercher** : `Ctrl+K`, dans les titres et le contenu, sans tenir compte des accents ni des majuscules.
- **Liens** : `[[Titre]]` ou `[[Titre|texte affiché]]` ; taper `[[` propose les notes existantes. Un lien vers une note qui n'existe pas (marqué `+`) propose de la créer. Les notes qui citent la note ouverte sont listées sous l'aperçu (liens entrants). Après avoir renommé une note, Cairn propose de mettre à jour les liens des autres notes.
- Deux notes ne peuvent pas avoir le même titre (sans tenir compte des majuscules), pour que les liens `[[Titre]]` restent sans ambiguïté.

## Essais

`node outils/essai.js` (nécessite Playwright) : sert le dépôt en local, remplace `supabase-js` par un faux backend en mémoire ([`outils/faux-supabase.js`](outils/faux-supabase.js), compte `essai@cairn.local` / `secret`) et vérifie la connexion, le thème, les notes (création, édition, sauvegarde automatique, titres en double, panne réseau, suppression), l'aperçu Markdown assaini, les dossiers, tags, recherche, liens et renommages, et l'affichage sur téléphone. `marked` et `DOMPurify` sont pris sur le registre npm (même version que le CDN) et gardés dans `outils/.cache/`. Lancé aussi par la CI à chaque push.

## Crédits

- [supabase-js](https://github.com/supabase/supabase-js) — Supabase, licence MIT, chargé depuis [jsDelivr](https://www.jsdelivr.com/package/npm/@supabase/supabase-js).
- [marked](https://github.com/markedjs/marked) — Christopher Jeffrey et contributeurs, licence MIT, chargé depuis [jsDelivr](https://www.jsdelivr.com/package/npm/marked).
- [DOMPurify](https://github.com/cure53/DOMPurify) — Cure53, licence MPL-2.0 ou Apache-2.0, chargé depuis [jsDelivr](https://www.jsdelivr.com/package/npm/dompurify).
- [JetBrains Mono](https://www.jetbrains.com/lp/mono/) — JetBrains, licence SIL Open Font License 1.1, chargée depuis [Google Fonts](https://fonts.google.com/specimen/JetBrains+Mono).
