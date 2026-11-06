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
- ✅ Validée sur le vrai site (06/11).

## Liens et code (05/11)
- Demande : choisir une note à lier parmi des centaines ; mermaid et coloration du code.
- Maquette : L-bulle, L-palette, L-explorateur, P-code ; **palette A** et couleurs validées.
- Palette « lier une note » (`[[`, bouton `[[ ]]`, `Ctrl+Maj+L`, filtres partout / même dossier / récentes) ; highlight.js et mermaid chargés à la demande, SVG repassé par DOMPurify.
- Correctif : décalage du curseur après des lignes vides dans un bloc de code (leçon dans `CLAUDE.md`).
- ✅ Validés sur le vrai site (06/11).

## Étape 6 — export / import (05/11)
- Maquette : I-statut, I-dialogue, I-conflit ; **A avec le lien « voir le détail » de C** pour un conflit.
- Export zip (un `.md` par note, en-tête YAML) ; import zip / `.md` / dossier, classement nouvelle / modifiée / conflit / identique, choix par conflit, sauvegarde zip avant import.
- ✅ Validée sur le vrai site (06/11).

## PWA et hors ligne (05/11)
- Maquette : H-discret, H-bandeau, H-file ; **A + carte d'installation de B + conflit de C**.
- `manifest.webmanifest`, icônes PNG, `sw.js` (réseau d'abord pour Cairn, cache d'abord pour le CDN, jamais Supabase), copie IndexedDB + file d'attente (`local.js`), synchronisation au retour du réseau, fenêtre de conflit, carte « Installer Cairn ? ».
- ✅ Validée sur le vrai site : installation, mode avion, synchronisation (06/11).

## Défilement lié (06/11)
- Demande : faire défiler le Markdown fait défiler l'aperçu. Pas de maquette (comportement, rien de nouveau à l'écran).
- `js/defilement.js` : en split seulement, chaque bloc de l'aperçu est accroché à la ligne où il commence (`debutsDesBlocs`, lexer de `marked`), position interpolée entre deux blocs ; dans les deux sens. Si l'aperçu ne correspond pas bloc à bloc (HTML brut), défilement proportionnel. Points recalculés à chaque défilement (diagrammes et images qui changent de taille).
- ✅ Validé sur le vrai site (06/11).

## Historique des versions (06/11)
- Question de départ : le poids. Réponse : une version par séance d'écriture (au plus une toutes les 10 min), tri qui s'éclaircit avec le temps, 50 max par note ; quelques dizaines de Mo au pire après des années.
- Maquette : V-panneau, V-frise, V-log ; **A « liste + différences »** choisie.
- Base : `supabase/versions.sql` (table `note_versions`, RLS, trigger `garder_version` after update, `trier_versions`). Les versions sont créées par la base, donc aussi pour les notes envoyées après un passage hors ligne.
- Interface : bouton `log` (téléphone : menu `⋯`), fenêtre `$ cairn log` : versions groupées (aujourd'hui, hier, cette semaine, ce mois-ci, cette année, plus anciennes), `+a −b` par version, différences avec l'actuelle (contexte de 2 lignes), `voir` (rendu assaini), `restaurer` (contenu, dossier, tags ; l'état actuel est d'abord gardé). Messages : hors ligne, table absente, note en attente d'envoi.
- ✅ Testé avec le faux backend. `supabase/versions.sql` exécuté sur Supabase ; affichage validé et RLS revérifiée avec le second compte (06/11).

## Plusieurs appareils (06/11)
- Constat de l'utilisateur : une note modifiée sur le PC n'apparaît pas sur le téléphone (PWA restée ouverte) ; pire, taper dessus écrasait la version du PC.
- Contrainte : trafic sortant du palier gratuit de Supabase (~5 Go/mois) ; recharger toutes les notes toutes les 30 s aurait coûté ~70 Mo/h.
- Reprise : au retour au premier plan et toutes les 60 s si visible, `id, updated_at` de toutes les notes (~15 Ko pour 200), puis contenu des seules notes changées ; notes supprimées ailleurs retirées. Note ouverte remplacée seulement sans frappe en attente, curseur gardé.
- Sauvegarde conditionnelle : `eq('updated_at', base)` ; si la note a changé ailleurs, conflit dans la fenêtre existante (appareil / serveur / les deux). Même contenu avec une autre date : pas de faux conflit. Sans IndexedDB : message « recharger la page ».
- Realtime de Supabase écarté (propre à Supabase, contraire à la portabilité).
- Premier essai réel raté : le téléphone mélangeait anciens et nouveaux fichiers (cache de 10 min de GitHub Pages). Correctif : `sw.js` demande les fichiers de Cairn en `no-cache` et met le cache à jour même après le délai de 3 s.
- ✅ Validé sur le vrai site, téléphone + PC (06/11).

## Note du jour et listes (06/11)
- Première maquette (J-*) trop chargée : elle mélangeait note du jour, vue des tâches, bande de la semaine, écran d'accueil ; l'utilisateur n'a pas compris. **Leçon** : une maquette par idée, et sans ajouts non demandés.
- Fait sans maquette (un seul bouton) : « ◷ aujourd'hui » à côté de « + nouvelle » (sur téléphone : ◷ seul). Titre `AAAA-MM-JJ` (date locale), dossier `journal/` (casse d'un dossier existant reprise), modèle `## À faire / - [ ] / ## Notes`, curseur sur la première case. Si la note existe, elle est rouverte.
- Demande ajoutée : Entrée dans une liste (`-`, `*`, `+`, `- [ ]`, `1.`) continue la puce ; Entrée sur un élément vide la termine ; pas dans un bloc de code. `js/listes.js` (pure), branché sur `beforeinput` (marche aussi avec les claviers de téléphone), `execCommand` pour garder Ctrl+Z.
- Cases à cocher (demandées en essayant : « la case ne se coche pas ») : faites sans maquette, rien de nouveau à l'écran. `js/taches.js` retrouve la n-ième tâche (règle de marked : `[ ]` suivi d'un espace puis de texte ; blocs de code ignorés) ; les cases ne sont rendues cliquables que si leur nombre correspond. Clic → `[ ]` ↔ `[x]` dans le Markdown, enregistré aussitôt ; tâche faite barrée.
- Premier essai réel raté : la publication GitHub Pages avait échoué deux fois (incident GitHub), le site servait l'ancienne version ; relancée, elle est passée à la troisième.
- ✅ Note du jour, listes et cases à cocher validées sur le vrai site (06/11).

## Tâches ouvertes (06/11)
- Maquette simple (T-A filtre, T-B page à part) ; **B choisie**.
- Menu `⋯` › « ☐ tâches ouvertes N » ouvre `#/taches` dans la colonne de la note (← toujours visible). Liste : tâches non cochées de toutes les notes (`listerTaches`), notes les plus récentes d'abord, nom de la note à droite ; blocs de code ignorés. Cocher → `basculerCase` dans la note, `modifierNote` avec `base` (conflit si changée ailleurs), la tâche disparaît ; texte → ouvre la note.
- ⏳ Testé avec le faux backend, **essai réel à faire**.

## Prochains chantiers possibles
Voir [`IDEES.md`](../IDEES.md) : accès MCP (reporté au passage sur un VPS), table `note_links`.
