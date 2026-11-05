# Cairn

Application personnelle de prise de notes en Markdown : des notes empilées et reliées entre elles par des liens `[[Titre]]`, comme les pierres d'un cairn qui marque le chemin.

Front statique (HTML/CSS/JS sans build) publié sur GitHub Pages ; Supabase pour la connexion et le stockage. Cahier des charges : [`specs/plan-v1.md`](specs/plan-v1.md).

## Mise en route

1. **Supabase** : créer un projet, exécuter [`supabase/schema.sql`](supabase/schema.sql) dans *SQL Editor*, créer son compte (*Authentication › Users*), puis désactiver les inscriptions (*Authentication › Sign In / Providers › Allow new users to sign up*). Ajouter l'URL GitHub Pages dans *Authentication › URL Configuration*.
2. **Configuration** : copier l'URL du projet et la clé `anon` (*Settings › API*) dans [`js/config.js`](js/config.js). La clé `anon` est publique ; **ne jamais** y mettre la clé `service_role`.
3. **GitHub Pages** : *Settings › Pages*, publier la branche `main` depuis la racine.

En local : servir le dossier avec n'importe quel serveur statique (les modules ES ne se chargent pas en `file://`), par exemple `python3 -m http.server`.

## Essais

`node outils/essai.js` (nécessite Playwright) : sert le dépôt en local, remplace `supabase-js` par un faux backend en mémoire ([`outils/faux-supabase.js`](outils/faux-supabase.js), compte `essai@cairn.local` / `secret`) et vérifie la connexion, la session, la déconnexion et le thème. Lancé aussi par la CI à chaque push.

## Crédits

- [supabase-js](https://github.com/supabase/supabase-js) — Supabase, licence MIT, chargé depuis [jsDelivr](https://www.jsdelivr.com/package/npm/@supabase/supabase-js).
- [JetBrains Mono](https://www.jetbrains.com/lp/mono/) — JetBrains, licence SIL Open Font License 1.1, chargée depuis [Google Fonts](https://fonts.google.com/specimen/JetBrains+Mono).
