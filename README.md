# Arbre & Mémoire — Application de généalogie

Application web de généalogie auto-hébergée (sans frais d'abonnement),
pensée pour remplacer un usage familial de MyHeritage/Geneanet.

📄 Voir [ARCHITECTURE.md](./ARCHITECTURE.md) pour le détail de
l'architecture, du schéma de données et du flux d'import.

## Statut actuel

Construit jusqu'ici :
- Le schéma de base de données complet (`supabase/`), y compris les
  parties qui n'ont pas encore d'interface (photos, animaux, audit...).
- Le **noyau** : parseur GEDCOM, moteur de dédoublonnage/fusion, et
  écriture en base.
- L'**interface principale** : connexion, navigation latérale, mode
  sombre/clair, tableau de bord, assistant d'import, liste des
  individus.
- L'**arbre généalogique interactif** : vue Ascendance (pedigree),
  vue Descendance (cascade repliable) et vue Éventail (d3.arc, zoom),
  interconnectées autour d'un même individu racine.
- La **fiche individu complète** : état civil éditable, liens
  familiaux directs (parents/conjoints/enfants, ajout et retrait),
  chronologie croisant événements personnels et jalons familiaux,
  onglets Notes / Professions & résidences / Sources — avec mise à
  jour en temps réel (Supabase Realtime) si quelqu'un d'autre modifie
  la même fiche.
- Le **gestionnaire de sources & preuves** : création/édition de
  sources (dépôt, cote, URL), visionneuse d'actes scannés avec zoom,
  rotation et transcription, indice de preuve (fiabilité) rattaché à
  chaque événement et affiché partout où il apparaît.
- Le **module d'export** : GEDCOM standard (filtrable par branche,
  masquage RGPD des personnes vivantes), sauvegarde JSON complète
  (médias inclus en option), livret familial PDF et arbre d'ascendance
  imprimable PDF.
- La **carte du monde interactive** : tous les événements géolocalisés
  (naissances, décès, mariages, autres) sur fond de carte OpenStreetMap,
  filtres par type, clustering avec éclatement au zoom, frise
  chronologique (curseur temporel par décennie/siècle), chemins de
  migration par individu, indicateur de preuve sur chaque marqueur, et
  un référentiel de toponymes historiques (1500–2026) pour résoudre les
  lieux qui ont changé de nom, de frontière ou de pays au fil du temps.
- **Photos, actes & animaux** : bucket Supabase organisé en deux
  espaces (Photos / Actes), pastilles **N·M·D** sur chaque fiche
  (vertes dès qu'un acte scanné est effectivement rattaché à
  l'événement), visionneuse d'archives avancée (zoom, rotation,
  filtres noir & blanc/négatif, pages multiples pour un acte sur
  plusieurs feuillets) partagée entre actes et photos, outil de
  marquage de personnes sur une photo de groupe (zone cliquable liée
  à une ou plusieurs fiches), et une section dédiée aux animaux de la
  famille (identité, anecdotes, photos, rattachement aux personnes).
- **Statistiques & audit** : démographie historique (pyramide des
  âges globale et par siècle, espérance de vie par siècle/décennie,
  âge moyen au mariage et à la parentalité, écart d'âge entre
  conjoints, pics de mortalité signalés statistiquement), classements
  de prénoms/patronymes/lieux et flux migratoires, taux de complétude
  global et par génération depuis une personne choisie, et un module
  d'audit qui détecte automatiquement les incohérences chronologiques,
  les doublons potentiels et les fiches isolées, avec accès direct à
  chaque fiche concernée et un suivi de la progression des actes N/M/D.
- La page **Paramètres** : invitations par e-mail avec rôles
  Admin/Contributeur/Lecteur, tableau des membres et invitations en
  attente, sélecteur de langue (interface **et** e-mails, 6 langues),
  préférences d'affichage (format de date, surnoms/professions sur les
  cartes de l'arbre, thème, "De Cujus" par défaut), notifications
  (nouvel acte validé, nouvelle photo sur une branche suivie,
  rappels d'anniversaire) avec cloche en temps réel, seuil RGPD de
  confidentialité réglable, sauvegarde/restauration complète de
  l'arbre (Snapshot), nettoyage des fichiers orphelins du stockage, et
  un journal d'activité consultable par les administrateurs — sans
  aucune exemption, y compris pour leurs propres modifications.
- Un **historique par fiche** (onglet "Historique" de chaque individu)
  et des **raccourcis clavier** site-wide (recherche rapide, aide,
  navigation dans les visionneuses) — voir plus bas.

Quelques points restent volontairement hors du périmètre testable
depuis ce bac à sable (voir le détail dans
[ARCHITECTURE.md](./ARCHITECTURE.md)) : l'envoi réel des e-mails
d'invitation et les rappels d'anniversaire automatiques nécessitent
une Edge Function sur ton propre projet Supabase (le lien
d'invitation et la cloche de notifications en temps réel, eux,
fonctionnent déjà pleinement sans configuration supplémentaire), et
la traduction (i18n) couvre pour l'instant la page Paramètres, la
navigation et les textes communs plutôt que l'intégralité de
l'application.

## Prérequis

- Node.js 18 ou plus récent
- Un compte Supabase gratuit (https://supabase.com)

## Installation

```bash
npm install
```

## Configuration de Supabase (à faire une seule fois)

1. Crée un projet gratuit sur [supabase.com](https://supabase.com/dashboard).
2. Dans l'éditeur SQL du projet, exécute dans l'ordre :
   - `supabase/schema.sql`
   - `supabase/policies.sql`
   - `supabase/realtime.sql` (active la mise à jour en temps réel de la fiche individu)
   - `supabase/storage.sql` (crée le bucket privé "media" pour les actes scannés et photos)
   - `supabase/map.sql` (ajoute le suivi du géocodage des lieux et la
     table des correspondances de toponymes historiques, pour la carte)
   - `supabase/settings.sql` (membres & invitations, préférences,
     notifications, seuil RGPD, historique des modifications)
3. Dans **Project Settings → API**, récupère `Project URL` et la clé
   `anon public`.
4. Copie `.env.example` en `.env.local` et renseigne ces deux valeurs :

   ```bash
   cp .env.example .env.local
   ```

## Lancer l'application

```bash
npm run dev
```

Ouvre ensuite http://localhost:5173.

À la première connexion ("Créer l'arbre"), un compte et un arbre te
sont automatiquement créés, et tu deviens administrateur de cet
arbre — aucune manipulation SQL manuelle n'est nécessaire au-delà de
l'étape 2 ci-dessus.

## Importer un GEDCOM

1. Menu **Import / Export** → choisir un fichier `.ged`.
2. Le fichier est analysé dans ton navigateur (rien n'est envoyé tel
   quel au serveur).
3. Si des ressemblances sont détectées avec des fiches déjà présentes,
   un écran de comparaison te permet de fusionner ou de garder les
   fiches séparées, champ par champ.
4. Clique sur **Valider l'import** : les données sont alors écrites
   dans Supabase.

## Explorer l'arbre

Menu **Arbre généalogique** : recherche l'individu racine en haut à
droite, ajuste le nombre de générations affichées, puis bascule entre
les onglets Ascendance / Descendance / Éventail — les trois restent
centrés sur le même individu.

## Fiche individu

Clique sur un nom dans **Fiches individus**, ou sur le bouton 🔍 d'une
carte dans l'arbre (ascendance/descendance : au survol ; éventail :
double-clic sur un arc). Depuis la fiche : "Modifier" sur l'en-tête
pour l'état civil, "+ Ajouter…" sous chaque bloc (Parents / Conjoints
/ Enfants) pour corriger les liens familiaux, et l'onglet Chronologie
pour ajouter un événement (mariage, profession, résidence...).

## Sources & preuves

Menu **Sources & actes** : crée une source (registre, acte, cote…),
puis ouvre-la pour ajouter une ou plusieurs images (bouton "+ Ajouter
une image") — chacune s'ouvre en plein écran avec zoom/rotation et un
panneau de transcription à côté. Depuis la fiche d'un individu, l'onglet
"Sources" permet de rattacher une source existante à la personne, et
chaque événement (naissance, mariage, profession…) peut recevoir un
indice de preuve dans sa modale d'édition.

## Exporter l'arbre

Menu **Import / Export** → onglet **Exporter** :
- **GEDCOM** : tout l'arbre, ou seulement les ascendants/descendants
  d'une personne choisie ; option pour masquer les personnes vivantes.
- **JSON** : sauvegarde complète (toutes les tables), avec option pour
  inclure les fichiers médias dans une archive `.zip`.
- **PDF** : livret familial (une fiche par personne) ou arbre
  d'ascendance imprimable (2 à 6 générations) autour d'une personne
  choisie.

Les trois exports tournent entièrement dans le navigateur et déclenchent
un téléchargement direct — aucune donnée ne transite par un service tiers.

## Carte du monde

Menu **Carte** : affiche tous les événements de l'arbre qui ont un
lieu renseigné.

- **Filtres** : la barre en haut à gauche bascule Naissances / Décès /
  Mariages / Autres (professions, résidences, recensements) — les
  marqueurs se mettent à jour immédiatement.
- **Clustering** : à dézoomé, les événements proches sont regroupés en
  grappes numérotées ; zoomer les éclate progressivement jusqu'aux
  marqueurs individuels. Cliquer sur un marqueur ouvre une infobulle
  avec la ou les personnes concernées, la date et l'indice de preuve.
- **Frise chronologique** : le curseur en bas de carte filtre les
  événements par période (réglable par décennie ou par siècle), pour
  suivre l'évolution de la famille dans le temps.
- **Chemins de migration** : depuis la fiche d'un individu ou le
  panneau de la carte, affiche le trajet chronologique de ses lieux de
  vie (utile par exemple pour les parcours Europe ↔ Pérou).
- **Indicateur de preuve** : chaque marqueur reprend le code couleur du
  niveau de fiabilité (prouvé / probable / hypothèse / infirmé) déjà
  utilisé dans les fiches et le gestionnaire de sources.

### Lieux et toponymes historiques

Un lieu doit d'abord être géolocalisé avant d'apparaître sur la carte.
Le panneau **Lieux** (volet latéral de la carte) liste les lieux en
attente et propose de les géocoder automatiquement (service gratuit
OpenStreetMap Nominatim, sans clé — limité à une requête par seconde,
donc le géocodage en lot peut prendre quelques instants pour un grand
arbre).

Pour les lieux qui ont changé de nom, de commune ou de pays au fil du
temps, l'onglet **Correspondances** permet de créer une règle de
résolution : un nom historique (ex. « Strasbourg, Alsace »), une plage
d'années optionnelle (ex. 1871–1918) pendant laquelle il faut utiliser
des coordonnées différentes, et le lieu actuel correspondant. Une règle
sans plage d'années s'applique à toutes les époques ; une règle bornée
ne s'applique que si l'année de l'événement est connue et comprise
dans la plage — cela évite qu'un même lieu, référencé par des
événements d'époques différentes, reçoive par erreur les coordonnées
d'une seule période. Quelques exemples (Alsace-Lorraine 1871–1918,
Lima/Ciudad de los Reyes) sont fournis en illustration ; à compléter
selon les lieux propres à chaque arbre — aucune date de rattachement
territorial n'est présumée au-delà de ce qui est explicitement saisi.

## Photos, actes & animaux

Sur une fiche individu, les trois pastilles **N · M · D** (en-tête,
à côté de "Vivant(e)/Décédé(e)") ouvrent chacune un panneau pour
rattacher un ou plusieurs actes à l'événement correspondant (Mariage
propose de choisir l'union si la personne s'est mariée plusieurs
fois) : créer et téléverser un nouvel acte, ou relier une source déjà
créée dans **Sources & actes**. Une pastille passe au vert dès qu'au
moins un acte avec une image scannée (pas seulement une référence
bibliographique) est rattaché et le niveau de preuve réglé.

La visionneuse (actes comme photos) propose zoom, rotation et des
filtres pensés pour les documents anciens abîmés (noir & blanc,
négatif, blanc sur noir / noir sur blanc) ; quand un acte comporte
plusieurs pages, des flèches ‹ › permettent de les parcourir sans
rouvrir le document.

Onglet **Photos & animaux** d'une fiche individu : les photos où la
personne a été identifiée (voir plus bas) ou directement rattachée,
un raccourci vers son **parcours de vie sur la Carte**, et la liste de
ses animaux. Dans **Photos** (menu principal), ouvrir une photo de
groupe puis "Identifier des personnes" permet de dessiner un cadre
autour d'un visage et de le relier à une ou plusieurs fiches — la
zone redevient invisible dès qu'on zoome ou qu'on tourne l'image, pour
ne jamais afficher un cadre mal aligné. Les personnes vivantes
protégées par les règles RGPD apparaissent comme "Personne protégée"
dans cette galerie, comme ailleurs dans l'application.

Menu **Animaux** : liste et recherche de tous les animaux de l'arbre ;
une fiche animal reprend nom, espèce, dates, anecdotes, photos et les
membres de la famille associés.

## Statistiques & audit

Menu **Statistiques** : indicateurs clés de l'arbre, pyramide des âges
(globale ou filtrée par siècle de naissance), espérance de vie par
siècle ou par décennie, âges moyens au mariage et à la parentalité,
naissances/décès par décennie avec un repère ⚠ sur les décennies où
les décès s'écartent nettement de la moyenne (un signal statistique —
l'application n'attribue aucune cause, comme une épidémie ou un
conflit, qu'elle ne pourrait pas vérifier), classements de
prénoms/patronymes et de lieux, flux migratoires (naissance → décès)
sous forme de tableau, et le taux de complétude de l'arbre — à la fois
global et, après avoir choisi une personne-racine, génération par
génération (parents, grands-parents, enfants…) pour repérer où
l'information manque le plus.

Menu **Audit** : détecteur d'incohérences — dates impossibles (décès
avant naissance, parent né après son enfant ou anormalement jeune,
naissance longtemps après le décès d'un parent, mariage à un âge
aberrant), doublons potentiels (même nom, dates de naissance proches
ou toutes deux inconnues) et fiches isolées (sans aucun lien
familial). Chaque constat pointe directement vers la ou les fiches
concernées, avec un filtre par sévérité et un suivi global de la
progression des actes N/M/D. Les seuils utilisés sont des repères à
vérifier, pas des certitudes — l'audit signale, il ne corrige rien de
lui-même.

## Paramètres

Menu **Paramètres** (dernière entrée de la navigation) :

- **Membres** *(admin)* : invite par e-mail en choisissant un rôle
  (Admin / Contributeur / Lecteur), copie le lien d'invitation
  généré, suis les invitations en attente (révocables), et change le
  rôle ou retire un membre déjà présent. Le lien ouvre
  `/invite/:token`, accessible sans connexion préalable : la personne
  invitée y crée son compte ou se connecte, puis rejoint l'arbre
  automatiquement.
- **Préférences** : langue de l'interface et langue des e-mails
  (indépendantes, 6 langues : français, anglais, italien, espagnol,
  allemand, portugais), format de date (JJ/MM/AAAA ou AAAA-MM-JJ),
  affichage des surnoms/professions sur les cartes de l'arbre, thème
  clair/sombre, et l'individu "De Cujus" utilisé par défaut comme
  racine de l'arbre pour ce membre.
- **Notifications** : choix par canal (e-mail / dans l'application)
  pour trois types d'alerte (nouvel acte validé, nouvelle photo sur
  une branche suivie, rappel d'anniversaire), et liste des branches
  suivies (bouton "Suivre cette branche" sur la fiche d'un individu,
  retirable depuis ce panneau). La cloche 🔔 dans la barre supérieure
  affiche les notifications en temps réel.
- **Confidentialité** *(admin)* : seuil RGPD de protection des
  personnes vivantes (nombre d'années sans décès connu avant
  affichage complet — 100 par défaut), utilisé partout où l'application
  masque déjà les personnes vivantes (fiches, carte, exports).
- **Maintenance** *(admin)* : Snapshot — sauvegarde complète en un
  clic (JSON, médias inclus en option dans une archive `.zip`) et
  restauration (remplace tout le contenu généalogique de l'arbre
  après une confirmation explicite tapée au clavier) ; détection et
  suppression des fichiers orphelins du stockage ; journal d'activité
  (qui a modifié quoi, et quand — administrateurs compris, sans
  exemption).

Chaque fiche individu a aussi un onglet **Historique** listant ses
propres modifications (créations, mises à jour champ par champ,
suppressions), avec l'auteur et la date ; le journal de Maintenance
couvre lui l'ensemble des fiches de l'arbre.

### Raccourcis clavier

`Ctrl/Cmd + K` ou `/` ouvre la recherche rapide d'un individu,
`?` affiche l'aide des raccourcis, `Échap` ferme n'importe quelle
fenêtre ou visionneuse ouverte, et `←` / `→` naviguent entre
photos ou pages d'un acte dans leur visionneuse. Ces raccourcis sont
désactivés automatiquement pendant la saisie de texte (champ, zone de
texte) pour ne jamais interférer avec la frappe normale.

## Tests

```bash
npm test
```

Couvre le parseur GEDCOM et le mapping vers le modèle interne
(`src/lib/gedcom/gedcom.test.js`), la construction de l'arbre
(`src/features/tree/tree.test.js`), les exporteurs GEDCOM/JSON et la
restauration de Snapshot — validation de forme, résumé, ordre
d'effacement/réinsertion (`src/lib/export/export.test.js`,
`src/lib/export/snapshotRestore.test.js`), la carte — normalisation des
noms de lieux, résolution des correspondances historiques (y compris
le cas d'une année inconnue), catégorisation des événements et
construction des chemins de migration (`src/features/map/map.test.js`) —,
les pastilles N/M/D (`src/features/individual/individual.test.js`),
le filtrage de photos par année (`src/features/media/media.test.js`),
le formatage de dates selon la préférence JJ/MM/AAAA ou AAAA-MM-JJ
(`src/lib/utils/dates.test.js`), et les moteurs de Statistiques/Audit —
démographie, classements, complétude (`src/features/stats/stats.test.js`)
et détection d'anomalies/doublons/fiches isolées
(`src/features/stats/audit.test.js`).

## Build de production

```bash
npm run build
npm run preview   # pour vérifier le build localement
```

## Hébergement

Le site de référence est **GitHub Pages** :
<https://goldenrec.github.io/arbre-memoire/>. Chaque push sur `main`
lance le workflow `.github/workflows/deploy-gh-pages.yml`, qui exécute
les tests puis ne déploie que s'ils passent.

Les fichiers `supabase/*.sql` s'exécutent à la main dans l'éditeur SQL
de Supabase. Le dernier ajouté, `harden_search_path.sql`, est un
durcissement facultatif.
