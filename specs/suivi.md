# Suivi des chantiers

Détail des chantiers ; `CLAUDE.md` n'en garde qu'une ligne dans « En cours ». Maquettes : [artefact](https://claude.ai/artifact/5bt29wqWkuZcnrFtcC32sZ), sources dans `maquettes/interface/project/`.

## Démarrage (05/11)
- `CLAUDE.md` repris de la Ludothèque, plan V1 ([`plan-v1.md`](plan-v1.md)), logos fournis (`assets/logo.svg`, `icon-maskable.svg`).
- Maquette de l'interface : directions A, B « Terminal », C sur téléphone. **B choisie**, puis version desktop validée (barre du haut, dossiers/tags 240 px, liste 320 px, note en `edit | split | view`).

## Étape 2 — connexion (05/11)
- Squelette, écrans (chargement, config manquante, connexion, appli), thème sombre/clair, routage par hash.
- Projet Supabase dédié (`laboemcpllcfozovwcsj`), clé publiable dans `js/config.js`.
- ✅ Validée sur https://tirashi.github.io/cairn-md/ ; **RLS vérifiée** avec un second compte (05/11).

## Étape 3 — notes (05/11)
- CRUD, sauvegarde automatique (1 s, `Ctrl+S`), titres uniques sans casse, suppression confirmée, mobile un panneau à la fois.
- Éditeur : `<textarea>` transparent sur les lignes colorées ; aperçu `marked` + DOMPurify.
- ✅ Validée sur le vrai site.

## Étape 4 — dossiers, tags, liens (05/11)
- Maquette : trois façons de changer dossier et tags (D-chemin, D-frontmatter, D-infos) ; **A « chemin éditable »** choisie.
- Dossiers en chemin `A/B`, tags en minuscules, filtres, recherche dans le navigateur, liens `[[Titre]]` / `[[Titre|texte]]`, liens entrants, renommage de note (mise à jour des liens) et de dossier.
- ⏳ Testée avec le faux backend, **essai réel à faire**.

## Liens et code (05/11)
- Demande : choisir une note à lier parmi des centaines ; mermaid et coloration du code.
- Maquette : L-bulle, L-palette, L-explorateur, P-code ; **palette A** et couleurs validées.
- Palette « lier une note » (`[[`, bouton `[[ ]]`, `Ctrl+Maj+L`, filtres partout / même dossier / récentes) ; highlight.js et mermaid chargés à la demande, SVG repassé par DOMPurify.
- Correctif : décalage du curseur après des lignes vides dans un bloc de code (leçon dans `CLAUDE.md`).
- ⏳ **Essai réel à faire**.

## Étape 6 — export / import (05/11)
- Maquette : I-statut, I-dialogue, I-conflit ; **A avec le lien « voir le détail » de C** pour un conflit.
- Export zip (un `.md` par note, en-tête YAML) ; import zip / `.md` / dossier, classement nouvelle / modifiée / conflit / identique, choix par conflit, sauvegarde zip avant import.
- ⏳ **Essai réel à faire**.

## PWA et hors ligne (05/11)
- Maquette : H-discret, H-bandeau, H-file ; **A + carte d'installation de B + conflit de C**.
- `manifest.webmanifest`, icônes PNG, `sw.js` (réseau d'abord pour Cairn, cache d'abord pour le CDN, jamais Supabase), copie IndexedDB + file d'attente (`local.js`), synchronisation au retour du réseau, fenêtre de conflit, carte « Installer Cairn ? ».
- ⏳ Testée avec le faux backend (service worker compris), **essai réel à faire** : installer sur le téléphone, mode avion, conflit entre deux appareils.

## Prochains chantiers possibles
Voir [`IDEES.md`](../IDEES.md) : historique des versions, accès MCP, table `note_links`.
