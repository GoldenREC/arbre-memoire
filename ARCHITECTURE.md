# Architecture — Arbre & Mémoire

Document de référence : structure des dossiers, schéma de données, et
flux d'import. À garder à jour au fil des prochaines étapes.

## Stack retenue

| Couche          | Choix                              | Pourquoi |
|-----------------|-------------------------------------|----------|
| Frontend        | React + Vite + Tailwind CSS         | Rapide, modulaire, écosystème large |
| Backend         | Supabase (Postgres + Auth + Storage), **free tier** | Vraie authentification multi-appareils (Admin/Famille/Invité), stockage des photos/actes, gratuit à l'échelle d'un arbre familial |
| Cache local     | IndexedDB (Dexie.js)                | Zone de "staging" pendant l'import GEDCOM uniquement (voir plus bas) — pas une base de vérité |
| Visualisation   | D3.js (arbre), Leaflet (carte), SVG natif (stats) | D3 pour l'éventail (d3.arc) ; Leaflet pour la carte ; les graphiques de Statistiques sont du SVG écrit à la main (pas de dépendance supplémentaire — cohérent avec le principe "sans frais, dépendances minimales") |
| Export          | jsPDF (PDF), JSZip (archive .zip pour la sauvegarde JSON + médias, en export comme en restauration) | Génération 100% client, aucun service tiers |
| i18n            | i18next + react-i18next                               | 6 langues embarquées (JSON statiques) ; pas d'appel réseau pour changer de langue |

Supabase est la **source de vérité unique**. IndexedDB ne sert qu'à
retenir temporairement un fichier GEDCOM en cours d'analyse avant que
l'utilisateur ne valide son import — rien n'y reste de façon durable.

## Arborescence du projet

```
genealogie-app/
├── supabase/
│   ├── schema.sql       → tables, enums, vue de confidentialité
│   ├── policies.sql     → RLS (admin/famille/invité) + fonction de bootstrap
│   ├── realtime.sql     → publication Realtime (individus, événements, filiations…)
│   ├── storage.sql      → bucket privé "media" + RLS sur storage.objects
│   ├── map.sql          → géocodage des lieux + correspondances de toponymes historiques
│   └── settings.sql     → membres/invitations, préférences, notifications, RGPD, historique
├── src/
│   ├── i18n/
│   │   ├── index.js              → init i18next (6 langues, lng par défaut 'fr')
│   │   └── locales/{fr,en,it,es,de,pt}.json
│   ├── lib/
│   │   ├── supabaseClient.js
│   │   ├── db/
│   │   │   ├── localDb.js        → staging IndexedDB (Dexie)
│   │   │   ├── bootstrapTree.js  → création du 1er arbre à l'inscription
│   │   │   ├── commitImport.js   → écriture finale en base (le "noyau stockage")
│   │   │   ├── mediaStorage.js   → upload/URL signée/suppression dans le bucket "media"
│   │   │   ├── invitations.js    → invitations, membres, rôles (ROLE_LABELS Admin/Contributeur/Lecteur)
│   │   │   ├── settingsMutations.js → préférences membre, seuil RGPD, nom de l'arbre
│   │   │   ├── followedIndividuals.js → branches suivies (notifications)
│   │   │   ├── notifications.js  → liste/marquage lu des notifications
│   │   │   └── adminMaintenance.js → fichiers orphelins du Storage, journal d'activité (record_history)
│   │   ├── gedcom/
│   │   │   ├── parser.js         → texte .ged -> arbre de noeuds
│   │   │   ├── mapper.js         → arbre de noeuds -> modèle de staging
│   │   │   └── gedcom.test.js
│   │   ├── dedupe/
│   │   │   ├── similarity.js     → score de ressemblance entre individus
│   │   │   └── merge.js          → fusion champ par champ sans perte
│   │   ├── export/
│   │   │   ├── fetchTreeSnapshot.js → charge tout l'arbre (toutes tables) pour les 3 exporteurs
│   │   │   ├── downloadHelpers.js   → déclenche un téléchargement navigateur (Blob/JSON/texte)
│   │   │   ├── gedcomExporter.js    → buildGedcomText (pur, testé) + exportGedcom
│   │   │   ├── jsonExporter.js      → buildJsonBackup (pur) + exportJsonBackup (zip optionnel)
│   │   │   ├── pdfBooklet.js        → livret familial (une fiche par individu)
│   │   │   ├── pdfPedigree.js       → arbre d'ascendance imprimable (réutilise buildPedigree)
│   │   │   ├── snapshotRestore.js   → validation + restauration d'un Snapshot (ordre FK-safe, par lots)
│   │   │   ├── snapshotRestore.test.js
│   │   │   └── export.test.js
│   │   └── utils/
│   │       ├── dates.js          → formatage de dates généalogiques (+ formatGenealogyDateWithPref, préférence JJ/MM/AAAA ↔ AAAA-MM-JJ)
│   │       ├── privacy.js        → règle des "N ans sans décès connu" (seuil RGPD réglable par arbre)
│   │       └── proofLevel.js     → libellés/couleurs de l'indice de preuve
│   ├── store/
│   │   └── useAuthStore.js       → session, rôle, arbre courant, préférences membre (Zustand)
│   ├── hooks/
│   │   ├── useTheme.js              → mode sombre/clair persisté
│   │   ├── useUiLanguageSync.js     → synchronise i18next avec la préférence de langue du membre
│   │   ├── useNotifications.js      → chargement + Supabase Realtime des notifications
│   │   └── useGlobalShortcuts.js    → Ctrl/Cmd+K, "/", "?" (isTypingContext() évite tout conflit avec la saisie)
│   ├── routes/
│   │   ├── router.jsx            → routes publiques (/login, /invite/:token) + arborescence protégée
│   │   └── RequireAuth.jsx       → garde d'authentification (route layout + <Outlet/>)
│   ├── components/layout/
│   │   ├── AppShell.jsx, Sidebar.jsx, Topbar.jsx, ThemeToggle.jsx
│   │   ├── NotificationBell.jsx  → cloche temps réel (Échap pour fermer, raccourci "n")
│   │   ├── QuickSearch.jsx       → recherche rapide d'individu (Ctrl/Cmd+K, "/")
│   │   └── ShortcutsHelp.jsx     → aide des raccourcis clavier ("?")
│   ├── features/
│   │   ├── auth/
│   │   │   ├── LoginPage.jsx
│   │   │   └── InviteAcceptPage.jsx → page publique /invite/:token (accepter une invitation)
│   │   ├── settings/
│   │   │   ├── SettingsPage.jsx      → onglets (route /parametres/:tab), filtrés selon le rôle
│   │   │   ├── MembersPanel.jsx      → invitations, membres, rôles (admin)
│   │   │   ├── PreferencesPanel.jsx  → langues, format de date, thème, surnoms/professions, De Cujus
│   │   │   ├── NotificationsPanel.jsx → canaux d'alerte + branches suivies
│   │   │   ├── PrivacyPanel.jsx      → seuil RGPD (admin)
│   │   │   └── MaintenancePanel.jsx  → Snapshot (sauvegarde/restauration), fichiers orphelins, journal d'activité (admin)
│   │   ├── dashboard/Dashboard.jsx
│   │   ├── import-export/
│   │   │   ├── ImportWizard.jsx  → étape 1 : sélection + parsing + détection de doublons
│   │   │   └── MergeReview.jsx   → étape 2 : revue humaine côte à côte + validation
│   │   ├── export/
│   │   │   ├── ImportExportPage.jsx → page à onglets "Importer" / "Exporter" (route /import)
│   │   │   └── ExportPanel.jsx      → UI des 3 exports (GEDCOM filtrable, JSON, PDF)
│   │   ├── sources/
│   │   │   ├── SourcesManager.jsx    → liste/recherche/création des sources (route /sources)
│   │   │   ├── SourceDetailModal.jsx → champs source + galerie d'actes + citations
│   │   │   ├── ActViewer.jsx         → visionneuse plein écran : zoom, rotation, transcription
│   │   │   └── sourcesMutations.js   → CRUD sources + résolution des citations
│   │   ├── individual/
│   │   │   ├── IndividualsList.jsx
│   │   │   ├── IndividualDetailView.jsx    → assemble en-tête + liens + onglets
│   │   │   ├── useIndividualDetail.js      → chargement + Supabase Realtime
│   │   │   ├── individualMutations.js      → toutes les écritures (état civil, liens, événements, citations)
│   │   │   ├── CivilHeader.jsx             → état civil, lecture/édition
│   │   │   ├── FamilyLinksSection.jsx      → parents / conjoints / enfants, ajout/retrait
│   │   │   ├── IndividualPicker.jsx        → recherche d'un individu existant
│   │   │   ├── Timeline.jsx                → chronologie (voir section dédiée)
│   │   │   ├── EventForm.jsx               → modale d'ajout/édition d'événement
│   │   │   ├── ProfessionsResidencesTab.jsx
│   │   │   ├── SourcesTab.jsx
│   │   │   ├── NotesTab.jsx
│   │   │   ├── nmdStatus.js              → pastilles N/M/D (computeNmdStatus, pur, testé)
│   │   │   ├── actsMutations.js          → rattachement/détachement d'actes à un événement
│   │   │   ├── EventActsModal.jsx        → panneau N/M/D : niveau de preuve + actes
│   │   │   ├── NmdBadges.jsx             → les 3 pastilles sur l'en-tête de fiche
│   │   │   ├── PhotosTab.jsx             → onglet "Photos & animaux" d'une fiche individu
│   │   │   ├── HistoryTab.jsx            → onglet "Historique" (table individuals uniquement — voir limites)
│   │   │   └── FollowBranchButton.jsx    → bascule "Suivre cette branche" (notifications)
│   │   ├── tree/                 → arbre interactif (voir section dédiée ci-dessous)
│   │   │   ├── useFamilyGraph.js      → charge individus/unions/filiations d'un arbre
│   │   │   ├── FamilyTreeContext.jsx  → racine + profondeur partagées entre les 3 vues
│   │   │   ├── buildPedigree.js       → adressage binaire (génération, slot) + branches manquantes
│   │   │   ├── buildDescendants.js    → arbre de descendance groupé par union
│   │   │   ├── buildFanChart.js       → conversion des slots en segments d3.arc
│   │   │   ├── PersonCard.jsx / TreeConnectors.jsx / branchColor.js
│   │   │   ├── AscendancyView.jsx / DescendancyView.jsx / FanChartView.jsx
│   │   │   └── FamilyTreeContainer.jsx → sélecteur de racine + onglets
│   │   ├── map/                  → carte du monde (voir section dédiée)
│   │   ├── media/
│   │   │   ├── mediaMutations.js     → CRUD photos, tags de visages, rattachements polymorphes
│   │   │   ├── photoUtils.js         → année d'une photo, filtrage par plage d'années
│   │   │   ├── PhotoViewer.jsx       → visionneuse photo : zoom/rotation/filtres + tagging
│   │   │   └── PhotosGallery.jsx     → galerie (route /photos), filtre personne + frise
│   │   ├── pets/
│   │   │   ├── petsMutations.js      → CRUD animaux + rattachement aux individus
│   │   │   ├── PetPicker.jsx / PetDetailModal.jsx
│   │   │   └── PetsManager.jsx       → liste/recherche (route /animaux)
│   │   └── stats/
│   │       ├── statsData.js          → chargement en bloc (loadStatsBundle) + bulkNmdStatus
│   │       ├── statsEngine.js        → démographie, classements, complétude (fonctions pures)
│   │       ├── auditEngine.js        → anomalies, doublons, fiches isolées (fonctions pures)
│   │       ├── chartColors.js        → palette de dataviz (catégorielle/séquentielle/statut)
│   │       ├── charts/               → VerticalBars, AgePyramidChart, Meter, RankedBarList
│   │       ├── StatisticsPage.jsx    → route /statistiques
│   │       ├── AuditPage.jsx         → route /audit
│   │       └── stats.test.js / audit.test.js
│   └── routes/router.jsx
```

## Modèle de données (résumé)

Voir `supabase/schema.sql` pour le détail complet (colonnes, index).

- **trees / tree_members** — un compte peut administrer plusieurs
  arbres ; chaque membre a un rôle (`admin`, `family`, `guest`) *par
  arbre*.
- **individuals** — une fiche par personne. Pas de HUSB/WIFE figé :
  voir `unions` + `union_partners`.
- **unions** + **union_partners** — un couple (mariage, PACS,
  concubinage…), avec ses partenaires en table de jointure (structure
  non binaire, gère les unions multiples).
- **filiations** — lien **enfant → chaque parent**, typé
  (`biological`, `adoption_plenary`, `adoption_simple`, `foster`,
  `late_recognition`). C'est ce typage qui permettra, à l'étape
  "Arbre interactif", d'afficher un trait plein ou pointillé selon le
  type de filiation.
- **events** — polymorphe (`subject_kind` = `individual` ou `union`),
  porte aussi l'**indice de preuve** (`proof_level`) demandé dans le
  cahier des charges.
- **sources / citations** — gestionnaire de sources + rattachement
  aux événements ou individus.
- **media / media_links / media_face_tags** — photos et actes, avec
  tagging de visages (coordonnées en fractions 0–1, indépendantes de
  la résolution de l'image).
- **pets / pet_links** — animaux de compagnie, rattachés à un individu
  ou une union, sans polluer les statistiques humaines.
- **import_batches** — traçabilité de chaque import GEDCOM.
- **audit_findings** — table prévue pour mettre en cache/résoudre les
  constats d'audit, **non utilisée pour l'instant** : le détecteur
  d'incohérences (phase "Audit") recalcule tout à la volée côté
  client à chaque visite plutôt que d'écrire ici — voir la section
  "Statistiques & audit global" et les limites connues plus bas.
- **v_individuals_with_privacy** — vue qui calcule
  `is_privacy_protected` (né il y a moins de `privacy_threshold_years`
  — colonne sur `trees`, 100 par défaut — et sans décès connu) ;
  doublée côté client dans `lib/utils/privacy.js` pour un masquage
  instantané sans aller-retour réseau.
- **tree_members** (colonnes ajoutées) — préférences par membre et
  par arbre : `default_root_individual_id` (De Cujus),
  `ui_language`/`email_language` (6 langues), `date_format`
  (`dmy`/`ymd`), `show_nicknames`/`show_professions`, et les
  interrupteurs de notification `notify_new_act`/`notify_new_photo`/
  `notify_birthdays`/`notify_email`/`notify_inapp`.
- **profiles** — miroir minimal de `auth.users` (id, email), tenu à
  jour par le trigger `handle_new_user` ; sert à afficher l'e-mail
  d'un membre ou d'un auteur de modification sans élargir l'accès à
  `auth.users`.
- **tree_invitations** — une invitation par e-mail + rôle, avec jeton
  (`token`), statut (`pending`/`accepted`/`revoked`), expiration ;
  consultée publiquement (sans session) via la RPC SECURITY DEFINER
  `get_invitation_preview`, acceptée via `accept_invitation` (qui crée
  la ligne `tree_members` correspondante).
- **followed_individuals** — branches qu'un membre suit (racine +
  utilisée par `individual_ancestors` côté notifications) pour
  recevoir une alerte quand un acte/une photo est ajouté sur cette
  branche.
- **notifications** — file par destinataire (`user_id`), alimentée
  par les déclencheurs `notify_new_act`/`notify_new_photo` (sur
  `media`/`media_links`) et par `check_birthday_notifications`
  (fonction à appeler périodiquement — voir limites) ; lue en temps
  réel côté client (`useNotifications.js`).
- **record_history** — journal d'audit générique (qui/quoi/quand,
  diff `changes` en JSON), alimenté par des triggers
  `log_record_history` sur `individuals`/`unions`/`filiations`/
  `events`/`citations`. Les triggers sont encadrés par
  `begin...exception when others...end` : un souci de journalisation
  ne peut jamais bloquer l'écriture métier elle-même.

### Sécurité (RLS)

Chaque table métier est filtrée par `tree_id` via les fonctions
`is_tree_member()` / `is_tree_family_or_admin()` / `is_tree_admin()`
(`supabase/policies.sql`). Les invités sont en lecture seule ; le
masquage fin des personnes vivantes pour les invités est fait côté
application (`applyPrivacyRules`) plutôt que par une politique RLS
colonne par colonne — à muscler si un blocage strict côté base
devient nécessaire.

### Rôles, transferts et cadenas (`supabase/multi_tree.sql`)

- **Trois rôles par arbre** : propriétaire (`trees.owner_id`, qui a aussi
  une ligne `admin` dans `tree_members`), admin (crée et modifie), membre
  (lecture seule, valeur `guest` en base). Le rôle `family` a disparu :
  ses membres sont passés en `admin`.
- **Ce que seul le propriétaire fait** : supprimer une fiche
  (`delete_individual`) ou l'arbre, poser ou retirer un cadenas, nommer
  ou rétrograder un admin, transférer l'arbre, restaurer un snapshot.
- **Transfert** : demande (`request_ownership_transfer`) avec phrase de
  confirmation, réponse du destinataire (`respond_ownership_transfer`),
  annulation par le propriétaire. `trees.owner_id` ne peut changer que par
  cette procédure (trigger `guard_tree_owner`).
- **Cadenas** (table `record_locks`) : sur une fiche, un acte (media) ou un
  événement. Un acte cadenassé interdit de supprimer l'acte, de le retirer
  d'une fiche ou d'un événement, et de supprimer les événements et la fiche
  qui le portent ; les admins peuvent toujours modifier ces événements sauf
  s'ils sont cadenassés eux-mêmes. Les règles sont des triggers : une
  requête directe à l'API ne les contourne pas.
- **Suppression de compte** : bloquée tant que le compte possède un arbre
  (`trees.owner_id` en `on delete restrict`).
- **Tests** : `supabase/tests/multi_tree_scenarios.sql` rejoue ces règles
  sur une base de test.

## Flux d'import GEDCOM (le "noyau" livré dans cette étape)

```
fichier .ged
   │  (lu dans le navigateur, FileReader)
   ▼
parser.js        → arbre de noeuds { level, tag, xref, value, children }
   │
   ▼
mapper.js         → modèle de staging (individus/familles/filiations
   │                 avec identifiants temporaires "gedcom:I1", lieux
   │                 et sources dédupliqués par libellé)
   ▼
similarity.js      → score de ressemblance contre les individus déjà
   │                 en base (nom, prénom, date de naissance, sexe)
   ▼
MergeReview.jsx    → revue humaine : fusionner (en tranchant les
   │                 champs en conflit) ou garder séparé
   ▼
commitImport.js    → écriture Supabase dans l'ordre des clés
                      étrangères : lieux → sources → individus
                      → unions → union_partners → filiations
                      → événements dérivés (naissance/décès/mariage/divorce)
```

Le fichier n'est jamais envoyé "brut" au serveur : tout le parsing et
le calcul de similarité se font côté client, seul le résultat validé
par l'utilisateur est écrit en base.

## Arbre généalogique interactif

Les trois vues (`AscendancyView`, `DescendancyView`, `FanChartView`)
partagent le même `FamilyTreeContext` : même individu racine, même
graphe, mêmes réglages de profondeur. Changer de racine dans une vue
(bouton ⌖ sur une carte, clic sur un arc de l'éventail, recherche en
haut de la page) se répercute donc sur les autres.

- **Ascendance** — adressage binaire par slot `(génération, index)` :
  la racine est `(0,0)`, ses parents `(1,0)`/`(1,1)`, etc.
  (`buildPedigree.js`). Les lignes de liaison sont dessinées par une
  surcouche SVG (`TreeConnectors.jsx`) qui mesure la position réelle
  des cartes dans le DOM — robuste même si les cartes n'ont pas
  toutes la même hauteur. Les branches manquantes affichent une carte
  "Inconnu" en pointillés. En cas de mariages multiples,
  `pickPedigreeParents` retient la paire la plus probable (priorité
  aux filiations biologiques) ; un raffinement manuel viendra avec la
  fiche individu.
- **Descendance** — rendu en cascade indentée plutôt qu'un arbre à
  positionnement calculé (type Reingold-Tilford) : plus simple à
  maintenir, reste fluide sur une famille nombreuse, et le
  repliement/dépliement par branche (`collapsed`) évite la surcharge
  visuelle. Les enfants sont groupés par union pour afficher
  "⚭ avec conjoint" avant chaque fratrie. La pastille de couleur
  encode la lignée patronymique (`branchColor.js`).
- **Éventail** — réutilise le même adressage par slot que
  l'ascendance (`computeFanSegments`), dessiné avec `d3.arc()`. Le
  zoom/pan (`d3.zoom()`) manipule directement le `<g>` via une ref,
  sans re-render React à chaque tick. Deux modes de coloration :
  par lignée ou par taux de complétude des données de la fiche.

## Fiche individu & chronologie

- **Naissance/décès : une seule source de vérité.** Ces deux dates
  vivent uniquement sur `individuals` (colonnes `birth_date`/
  `death_date`), modifiables depuis l'en-tête (`CivilHeader.jsx`). La
  Timeline les affiche directement depuis l'individu plutôt que de les
  dupliquer dans `events` — même si un import GEDCOM, lui, écrit bien
  une ligne `events` pour naissance/décès (`commitImport.js`) ; la
  Timeline filtre ces doublons potentiels (`HEADER_MANAGED_TYPES`).
  Tout le reste (mariages, professions, résidences, etc.) passe par
  `events`.
- **Liens familiaux gérables depuis la fiche** —
  `FamilyLinksSection.jsx` permet d'ajouter/retirer un parent (avec
  son type de filiation), un conjoint (crée une `union` +
  `union_partners`), ou un enfant (avec union d'appartenance
  optionnelle), via `IndividualPicker.jsx` (recherche live dans
  `individuals`). C'est directement ce graphe que consomment les
  trois vues de l'arbre — corriger un lien ici se répercute donc sur
  l'ascendance/descendance/éventail.
- **Temps réel.** `useIndividualDetail.js` souscrit aux tables
  `individuals`, `events`, `filiations`, `union_partners` filtrées sur
  l'individu courant via Supabase Realtime : si un autre membre de la
  famille modifie la même fiche, elle se recharge automatiquement
  (recharge groupée avec un court debounce plutôt qu'un patch fin
  par table, pour rester simple et toujours cohérent). **Nécessite
  d'avoir exécuté `supabase/realtime.sql`** (active la réplication sur
  ces tables — à faire une fois, voir README).
- **Chronologie** — fusionne dans un seul tri par date : (1) naissance
  et décès de l'individu, (2) ses propres événements (`events` avec
  `subject_kind='individual'`), (3) les événements des unions dont il
  est partenaire (mariage/divorce), et (4) deux jalons familiaux
  calculés côté client — naissance de chaque enfant, décès de chaque
  parent (`kind: 'milestone'`, style visuel atténué, cliquable vers la
  fiche du proche). L'ajout/édition d'un événement personnel se fait
  en modale (`EventForm.jsx`), réutilisée par l'onglet "Professions &
  résidences" pour les types `occupation`/`residence`.
- **Sources & preuves** — l'onglet affiche les citations déjà liées
  (avec l'indice de preuve de l'événement associé, si connu) et permet
  d'en rattacher une à une source existante ; le gestionnaire complet
  (création, visionneuse d'actes) est accessible depuis le lien
  "Ouvrir le gestionnaire de sources" → voir section suivante.

## Sources, preuves & export

- **Indice de preuve (`proof_level`).** Porté par `events` (déjà
  présent dans le schéma Phase 1), choisi dans `EventForm.jsx` à la
  création/édition de tout événement, et affiché en badge partout où
  un événement apparaît : Timeline, onglet Professions & résidences,
  onglet Sources de la fiche, et dans `SourceDetailModal.jsx` pour
  chaque citation. Cinq niveaux : `proven_original`, `proven_secondary`,
  `probable`, `hypothesis` (valeur par défaut), `disproved`.
  Libellés/couleurs centralisés dans `lib/utils/proofLevel.js`.
- **Gestionnaire de sources** (`SourcesManager.jsx`, route `/sources`)
  — liste/recherche de toutes les sources de l'arbre, création,
  édition (titre, dépôt, cote, URL, notes), suppression. Ouvre
  `SourceDetailModal.jsx` pour le détail d'une source : galerie des
  actes scannés qui lui sont attachés, et liste des citations qui
  l'utilisent comme preuve (avec le nom de l'individu concerné et
  l'indice de preuve de l'événement cité).
- **Visionneuse d'actes** (`ActViewer.jsx`) — image en plein écran
  avec zoom (25 %–400 %) et rotation par incréments de 90°, et un
  panneau de transcription éditable à côté (stocké dans
  `media.description` — pas de nouvelle colonne). L'URL de l'image est
  une URL signée à durée limitée (1h, voir `mediaStorage.js`), jamais
  d'accès public au bucket.
- **Stockage des actes** — bucket Supabase Storage privé `media` (créé
  par `supabase/storage.sql`, **à exécuter une fois** en plus de
  `schema.sql`/`policies.sql`/`realtime.sql`, voir README). Convention
  de chemin `<tree_id>/<media_id>-<nom_fichier>` ; RLS sur
  `storage.objects` calquée sur les mêmes rôles que le reste de
  l'arbre (`is_tree_member` en lecture, `is_tree_family_or_admin` en
  écriture). `mediaStorage.js` encapsule upload (avec rollback de la
  ligne `media` si l'upload échoue), URL signée, suppression et
  téléchargement de blob (ce dernier pour l'export JSON+médias).
- **Export GEDCOM** (`lib/export/gedcomExporter.js`) — génère un
  fichier `.ged` 5.5.1 standard à partir d'un instantané de l'arbre
  (`fetchTreeSnapshot.js`). Filtrable par périmètre (tout l'arbre, ou
  ascendants/descendants d'une personne choisie — parcours en largeur
  sur les filiations) et par masquage RGPD des personnes vivantes
  (réutilise `isPrivacyProtected` : nom remplacé par "Vivant /Masqué/",
  aucune date ni note exportée pour ces personnes, liens familiaux
  conservés pour ne pas casser la structure de l'arbre). La fonction
  de construction du texte (`buildGedcomText`) est pure et couverte par
  des tests (`export.test.js`) — le téléchargement lui-même est séparé
  dans `exportGedcom`.
- **Export JSON** (`lib/export/jsonExporter.js`) — sauvegarde complète
  de toutes les tables de l'arbre (sans masquage : c'est une sauvegarde
  technique, pas un document à diffuser). Option "inclure les médias" :
  empaquette alors `data.json` + chaque fichier média téléchargé depuis
  le bucket dans un `.zip` (JSZip) plutôt que d'alourdir le JSON en
  base64.
- **Export PDF** (`lib/export/pdfBooklet.js` + `pdfPedigree.js`, jsPDF)
  — un livret familial (une page de garde puis une fiche par individu,
  ordre alphabétique : état civil, parents, union(s), enfants) ou un
  arbre d'ascendance imprimable. Ce dernier réutilise **directement**
  `buildPedigree.js` (même adressage binaire génération/slot que les
  vues Ascendance/Éventail à l'écran) via une fonction de chargement de
  graphe extraite de `useFamilyGraph.js` (`loadFamilyGraph`, utilisable
  hors React) — le PDF correspond donc exactement à ce que montre
  l'écran pour la même racine et la même profondeur.
- **UI d'export** (`features/export/ExportPanel.jsx`, dans l'onglet
  "Exporter" de la page Import/Export) — tout tourne côté client ;
  aucune donnée ne transite par un service tiers, le fichier est
  directement proposé au téléchargement du navigateur.

## Carte du monde interactive

- **Cartographie** — Leaflet 1.9.4 + `react-leaflet` 4.2.1 (pinnés :
  la v5 de react-leaflet exige React 19) sur fond de tuiles
  OpenStreetMap (raster, gratuit, sans clé — cohérent avec le principe
  "sans frais d'abonnement" du projet). Clustering via
  `leaflet.markercluster` + `react-leaflet-cluster`, avec éclatement
  progressif des grappes au zoom.
- **Géocodage** (`lib/geo/geocoder.js`) — chaque lieu de la table
  `places` porte un statut (`geocode_status`, ajouté par
  `supabase/map.sql`, **à exécuter une fois** en plus des autres
  scripts SQL, voir README). `geocodeAllPendingPlaces(treeId)` géocode
  en lot via l'API gratuite OpenStreetMap Nominatim (`geocodeViaNominatim`,
  limitée à 1 requête/seconde par sa politique d'usage — respectée par
  un espacement entre appels) ; un lieu déjà résolu manuellement
  (`setPlaceCoordinatesManually`) n'est jamais écrasé.
- **Référentiel de toponymes historiques** — table
  `historical_place_aliases` (RLS identique au reste de l'arbre :
  lecture `is_tree_member`, écriture `is_tree_family_or_admin`) : nom
  historique, plage d'années optionnelle (`year_start`/`year_end`),
  lieu actuel correspondant. `resolveHistoricalAlias(aliases, rawLabel,
  year)` est consultée avant tout appel réseau : une correspondance
  **sans bornes** s'applique quelle que soit l'année (y compris
  inconnue) ; une correspondance **bornée** n'est retenue que si
  l'année de l'événement est connue et comprise dans la plage — point
  important car une seule ligne `places` (un `raw_label`) peut être
  partagée par des événements d'époques différentes, donc une année
  inconnue ne doit jamais faire présumer une période plutôt qu'une
  autre. `buildPlaceYearHints(treeId)` calcule, pour chaque lieu,
  l'année la plus ancienne trouvée parmi les événements/naissances/
  décès/unions qui le référencent, et alimente `geocodeAllPendingPlaces`
  afin que les correspondances bornées soient réellement exploitables
  en usage réel (pas seulement testables isolément).
  `starterHistoricalAliases.js` fournit quelques exemples illustratifs
  (Alsace-Lorraine 1871–1918, Lima/Ciudad de los Reyes 1535–1600,
  Liège/Lüttich sans bornes) — volontairement non exhaustif : aucune
  date de rattachement territorial n'a été inventée pour les communes
  suisses/belges/luxembourgeoises sans confirmation, à compléter via
  l'onglet Correspondances selon les lieux propres à chaque arbre.
- **Données de la carte** (`features/map/mapData.js`) —
  `fetchMapEvents(treeId, role)` charge tous les événements
  géolocalisés et applique les mêmes règles RGPD que le reste de
  l'app (`applyPrivacyRules`) : les lieux d'une personne vivante non
  visible par le rôle courant sont masqués au même titre que son état
  civil. `buildIndividualPath(events, individualId)` est pure (prend un
  tableau déjà chargé) et construit la liste chronologique des lieux de
  vie d'un individu pour tracer son chemin de migration.
- **Interface** (`features/map/WorldMapView.jsx`) — barre de filtres
  (Totalité/Naissances/Décès/Mariages/Autres, `eventTypeStyles.js` pour
  la catégorisation et les couleurs), frise chronologique
  (`TimeRangeSlider.jsx`, curseur double avec granularité
  décennie/siècle), panneau latéral `PlacesResolverPanel.jsx` (onglets
  "Lieux" — géocodage en attente/échecs — et "Correspondances" —
  gestion des alias historiques), infobulles de marqueur/cluster
  listant personnes, dates, type d'événement et badge de preuve
  (couleurs centralisées dans `lib/utils/proofLevel.js` via
  `proofLevelHex`), et traçage des chemins de migration par individu
  avec couleur de segment croissante (`pathColorAt`).
- **Tests** (`features/map/map.test.js`) — fonctions pures uniquement :
  normalisation des libellés de lieux, résolution des correspondances
  historiques (bornées/sans bornes, année connue/inconnue), catégorisation
  des types d'événements, construction d'un chemin de migration.

## Photos, actes & animaux

- **Stockage** (`lib/db/mediaStorage.js`) — le bucket privé "media" est
  organisé en deux sous-dossiers par arbre, `${treeId}/actes/...` et
  `${treeId}/photos/...` (`folderFor()` choisit automatiquement
  "actes" pour un document ou une source, "photos" sinon). Seul le
  premier segment du chemin (`tree_id`) est vérifié par la politique
  RLS sur `storage.objects` — le découpage en sous-dossiers est donc
  purement organisationnel, pas une frontière de sécurité
  supplémentaire.
- **Pastilles N·M·D** (`features/individual/nmdStatus.js`) —
  `computeNmdStatus()` est une fonction pure : une pastille passe au
  vert seulement si une citation rattachée à l'événement porte un
  média réellement scanné (`hasMedia`, calculé une fois dans
  `useIndividualDetail.js` et réutilisé partout — badges, statistiques,
  audit — pour ne jamais dupliquer cette règle). Comme un individu créé
  à la main (hors import GEDCOM) n'a pas de ligne `events` pour sa
  naissance/son décès (ces dates vivent uniquement sur les colonnes de
  `individuals`), `ensureEvent()` (`individualMutations.js`) crée
  l'événement à la volée, seulement au moment où un acte est rattaché
  ou qu'un niveau de preuve est choisi.
- **Visionneuse avancée** (`ActViewer.jsx`, `PhotoViewer.jsx`) — zoom,
  rotation et filtres CSS (`filter`) pensés pour les archives abîmées
  (niveaux de gris, négatif, blanc sur noir / noir sur blanc) ; un acte
  peut porter plusieurs pages (plusieurs lignes `media` pour une même
  `source`), avec une pagination ‹ › qui recharge l'URL signée et la
  transcription de la page courante. La logique est dupliquée entre
  les deux visionneuses plutôt que partagée, le modèle de données
  (fraction 0–1 pour les tags de visage) n'étant pertinent que pour
  les photos.
- **Tagging de visages** (`features/media/mediaMutations.js`,
  `PhotoViewer.jsx`) — les zones taguées sont stockées en fractions
  (0–1) de l'image affichée, indépendamment de sa résolution. Comme le
  zoom/la rotation ajoutés à la visionneuse déplacent visuellement
  l'image sans changer ces fractions, le mode tagging force zoom=1 et
  rotation=0 à l'activation, et les cadres existants ne sont rendus
  que lorsque zoom et rotation sont à leur valeur par défaut — pour ne
  jamais afficher un cadre désaligné. `listFaceTags()` applique les
  mêmes règles RGPD (`applyPrivacyRules`) que le reste de
  l'application : une personne vivante protégée apparaît comme
  "Personne protégée" dans la galerie.
- **Animaux** (`features/pets/`) — table `pets` + `pet_links`
  (polymorphe, comme `media_links`), rattachés à un individu. Supprimer
  un animal laisse d'éventuelles lignes `pet_links`/`media_links`
  orphelines (le schéma ne porte pas de clé étrangère vers `pets.id`
  depuis un rattachement polymorphe) — comportement préexistant du
  modèle de données, sans conséquence visible, non corrigé ici.

## Statistiques & audit global

- **Chargement en bloc** (`features/stats/statsData.js`) —
  `loadStatsBundle(treeId)` fait une poignée de requêtes larges
  (individus, filiations, unions, événements, citations, médias,
  lieux…) plutôt qu'une requête par individu, cohérent avec la taille
  attendue d'un arbre familial (quelques centaines à quelques milliers
  de fiches). `bulkNmdStatus()` réutilise `computeNmdStatus()` pour
  calculer le statut N/M/D de tout l'arbre d'un coup, afin que la
  progression affichée dans Statistiques/Audit corresponde exactement
  aux pastilles des fiches individu.
- **Démographie & classements** (`statsEngine.js`, fonctions pures,
  testées indépendamment de Supabase) — pyramide des âges (globale ou
  filtrée par siècle de naissance), espérance de vie moyenne au décès
  par période, âge moyen au mariage et écart entre conjoints, âge
  moyen à la paternité/maternité (écarte les valeurs biologiquement
  impossibles, <10 ou >75 ans), naissances/décès par décennie, top
  prénoms/patronymes (avec fenêtre d'apparition et décennie de pic) et
  top lieux, flux migratoires (naissance → décès, agrégés et classés —
  une version tabulaire des parcours déjà tracés sur la Carte, sans
  dépendre de Leaflet ici), et taux de complétude (date de naissance
  exacte, lieu de naissance, portrait identifié, acte N/M/D validé).
- **Pics de mortalité** — `detectMortalityPeaks()` signale les
  décennies où les décès dépassent nettement la moyenne (moyenne +
  1,5 écart-type) : un **signal statistique brut**, jamais une
  attribution de cause — l'application n'invente aucun lien avec une
  épidémie ou un conflit précis, ni dans le calcul ni dans l'interface
  (`StatisticsPage.jsx` affiche un simple repère ⚠ avec une légende
  explicite).
- **Complétude par génération** — "par branche" n'a pas de définition
  unique dans un arbre, donc `completenessByGeneration()` y substitue
  une notion précise : distance de génération (parcours en largeur des
  parents/enfants) depuis une personne-racine choisie dans l'interface
  (`+IndividualPicker`). `buildGenerationGraph()` reconstruit un petit
  graphe parents/enfants à partir des données déjà chargées par
  `loadStatsBundle` (plutôt que de réutiliser le graphe de l'onglet
  Arbre, dont les individus ne portent pas `birthPlaceId`, nécessaire
  ici pour le critère "lieu de naissance").
- **Audit** (`auditEngine.js`, fonctions pures) — `detectDateAnomalies`
  (décès avant naissance, parent né après son enfant ou anormalement
  jeune, naissance >330 jours après le décès d'un parent, mariage à un
  âge aberrant), `detectPotentialDuplicates` (même nom normalisé —
  accents/casse ignorés — avec naissances proches ou toutes deux
  inconnues, sexe compatible), `detectOrphans` (aucune filiation ni
  union). `runFullAudit()` combine et trie du plus au moins sévère ;
  chaque constat porte `individualIds` pour que l'interface
  (`AuditPage.jsx`) puisse pointer directement vers les fiches
  concernées. Les seuils (âge au mariage, délai de naissance posthume,
  tolérance de doublon) sont des heuristiques à vérifier, pas des
  règles biologiques strictes — et, comme noté plus haut, rien n'est
  écrit dans `audit_findings` : tout est recalculé à la demande.
- **Palette de dataviz** (`chartColors.js`) — distincte de l'accent
  indigo de l'UI (réservé aux boutons/liens), reprise d'une palette
  validée pour la séparation des teintes en daltonisme (ΔE OKLab ≥ 8
  entre teintes adjacentes, ≥ 15 en vision normale) plutôt que choisie
  à l'oeil ; les étiquettes de valeur sont toujours affichées à côté
  des barres (jamais seulement la couleur/la hauteur à comparer), et
  les couleurs de statut de l'audit sont toujours accompagnées d'une
  icône et d'un texte visible, jamais de la couleur seule.
- **Tests** (`stats.test.js`, `audit.test.js`) — toutes les fonctions
  pures listées ci-dessus, y compris les cas limites (pas assez de
  données, dates manquantes, tolérances de doublon).

## Paramètres, membres, i18n, RGPD & raccourcis clavier

- **Authentification devenue routée** — `App.jsx` ne fait plus de
  `if (!user)` global : `/login` et `/invite/:token` sont des routes
  publiques au sommet de `router.jsx`, et tout le reste de
  l'application est sous une route layout `RequireAuth.jsx`
  (`<Navigate to="/login"/>` si pas de session, sinon `<Outlet/>`).
  C'est ce qui permet au lien d'invitation et à l'écran de connexion
  d'être atteignables sans session préalable, tout en gardant une
  seule garde d'authentification pour tout le reste.
- **Membres & invitations** — `invitations.js` fait correspondre les
  libellés UI "Admin / Contributeur / Lecteur" à l'`app_role` existant
  en base (`admin`/`family`/`guest`, inchangé) ; la création
  d'invitation génère un jeton, l'acceptation passe par la RPC
  SECURITY DEFINER `accept_invitation` (seule façon d'insérer dans
  `tree_members` depuis un compte qui n'est pas encore membre). Un
  Admin ajouté par invitation (donc pas `owner_id` du premier jour) a
  désormais le droit de modifier les réglages de l'arbre — une
  politique RLS manquante à cet effet a été ajoutée sur `trees`.
- **i18n** — i18next avec 6 langues embarquées en JSON statique, pas
  de chargement réseau. La langue affichée suit la préférence
  enregistrée du membre (`ui_language`), pas la langue du navigateur :
  `useUiLanguageSync.js` appelle `i18next.changeLanguage()` à chaque
  changement de préférence. La langue des e-mails (`email_language`)
  est stockée séparément et n'est consommée que par l'envoi d'e-mails
  côté serveur (hors périmètre de ce bac à sable, voir limites).
- **Préférences d'affichage** — `date_format` est lu par
  `formatGenealogyDateWithPref()` (même logique de préfixes de
  précision que `formatGenealogyDate`, mais numérique) et appliqué
  pour l'instant aux cartes de l'arbre (`PersonCard.jsx`), qui
  affichent aussi surnom/profession selon `show_nicknames`/
  `show_professions`. Le "De Cujus" (`default_root_individual_id`) est
  lu par `FamilyTreeContext.jsx` avant le repli alphabétique habituel.
- **Notifications** — déclenchées en base par `notify_new_act`
  (trigger sur `media`) et `notify_new_photo` (trigger sur
  `media_links`), filtrées par `followed_individuals` via
  `individual_ancestors()` ; lues en temps réel côté client
  (`useNotifications.js`, même schéma `supabase.channel(...).on(
  'postgres_changes', ...)` que la fiche individu). Les rappels
  d'anniversaire (`check_birthday_notifications()`) existent comme
  fonction SQL mais ne s'exécutent pas seuls — voir limites.
- **RGPD & Snapshot** — le seuil (`trees.privacy_threshold_years`) est
  désormais threadé jusqu'aux quatre points qui appliquaient encore
  "100 ans" en dur (carte, export GEDCOM, livret PDF, arbre
  d'ascendance PDF). `snapshotRestore.js` efface puis réinsère les
  tables métier d'un arbre dans un ordre dérivé manuellement des
  contraintes FK de `schema.sql` (plusieurs sont `NO ACTION`, pas
  `CASCADE` — voir le commentaire du fichier), par lots de 500 lignes,
  en conservant les identifiants d'origine. Les tables sans
  `tree_id` propre (`union_partners`, `media_links`,
  `media_face_tags`, `pet_links`) ne sont pas effacées explicitement :
  elles disparaissent par cascade quand la table qu'elles rattachent
  (`unions`, `media`, `pets`) est effacée.
- **Fichiers orphelins** — `listOrphanedMediaFiles()` compare le
  contenu réel du bucket Storage (`actes/`, `photos/`) à la table
  `media` ; un fichier listé avec `id: null` est un simple
  placeholder de sous-dossier Supabase Storage, pas un vrai fichier,
  et est ignoré.
- **Historique** — `record_history` (tables `individuals`, `unions`,
  `filiations`, `events`, `citations`) est consultable intégralement
  par un admin via Maintenance ; l'onglet "Historique" d'une fiche
  individu n'affiche que les lignes `table_name = 'individuals'` de
  cette fiche précise (voir limites pour la portée).
- **Raccourcis clavier** — une seule logique centrale
  (`useGlobalShortcuts.js`, montée une fois dans `AppShell.jsx`) pour
  Ctrl/Cmd+K, "/" et "?", avec un garde `isTypingContext()` (vérifie
  l'élément actif du document) pour ne jamais intercepter une saisie
  normale. `Échap` est géré directement dans le composant `Modal.jsx`
  partagé (donc automatique pour toutes les modales qui l'utilisent),
  et les flèches ‹ › dans `PhotoViewer.jsx`/`ActViewer.jsx` sont
  elles-mêmes gardées contre le focus sur un champ de texte.

## Limites connues de cette première étape

- Le parseur GEDCOM couvre les tags courants (INDI, FAM, NAME, SEX,
  BIRT, DEAT, MARR, DIV, FAMC/FAMS, OCCU, NOTE, quelques événements
  secondaires). Les calendriers non grégoriens et les dates doubles
  ne sont pas convertis.
- La déduplication des lieux est une correspondance texte exacte
  (normalisée) ; un rapprochement plus fin (abréviations, orthographes
  variables) reste à affiner au-delà des alias historiques exacts gérés
  par la carte.
- Le dédoublonnage ne retient que le **meilleur** candidat par
  individu entrant (pas de gestion des doublons multiples en cascade).
- Les miniatures de photo ne sont pas (encore) affichées directement
  sur les cartes de l'arbre (ascendance/descendance/éventail) ; elles
  le sont sur la fiche individu, dans la galerie et sur la Carte.
- Le bouton "🔍 ouvrir la fiche" de l'arbre est maintenant actif (sur
  les cartes en ascendance/descendance, et en double-clic sur un arc
  de l'éventail).
- La fiche individu ne gère qu'une paire de parents "officielle" par
  personne côté affichage de l'arbre (voir `pickPedigreeParents`),
  mais rien n'empêche d'enregistrer plus de deux parents via
  `FamilyLinksSection` (familles recomposées) — ils apparaîtront tous
  sur la fiche, seul l'arbre simplifie à deux pour l'instant.
- L'export GEDCOM ne distingue HUSB/WIFE que pour les deux premiers
  partenaires d'une union (limite du format lui-même) ; au-delà
  (rare), seuls les deux premiers sont positionnés dans le FAM, les
  autres restent reliés via leurs propres liens FAMS.
- L'arbre d'ascendance imprimable (PDF) est plafonné à 6 générations
  par page pour rester lisible (64 cases sur la dernière colonne) ;
  au-delà, utiliser plutôt l'export GEDCOM et un logiciel dédié.
- Le géocodage automatique dépend de l'API gratuite Nominatim
  (OpenStreetMap) : limitée à 1 requête/seconde, pas de clé ni de
  frais, mais les lieux très peu décrits (lieux-dits disparus, graphie
  ambiguë) peuvent échouer et nécessiter un positionnement manuel
  (`setPlaceCoordinatesManually`) ou un alias historique dédié.
- Le référentiel de toponymes historiques n'est volontairement pas
  exhaustif : seuls quelques exemples bien sourcés sont fournis par
  défaut (voir `starterHistoricalAliases.js`) ; les rattachements
  territoriaux pour la Suisse, la Belgique ou le Luxembourg restent à
  ajouter au cas par cas via l'onglet Correspondances, plutôt que
  présumés.
- L'audit recalcule tout à la volée côté client à chaque visite de la
  page (voir ci-dessus) : pour un très grand arbre, ou si un jour un
  usage "marquer comme résolu/faux positif" est voulu, la table
  `audit_findings` déjà prévue dans le schéma permettrait de passer à
  un calcul périodique persisté plutôt qu'un recalcul systématique.
- Les flux migratoires de la page Statistiques sont une agrégation
  tabulaire (naissance → décès) : ils ne redessinent pas de carte,
  celle de l'onglet Carte restant la référence pour la visualisation
  géographique et les chemins individuels.
- Le calcul de "pic de mortalité" est un simple repère statistique
  (moyenne + 1,5 écart-type) : il ne sait pas, et ne prétend pas
  savoir, qu'une décennie correspond à une épidémie ou un conflit
  précis.
- **Envoi réel des e-mails d'invitation** : la création d'une
  invitation génère le jeton et le lien côté base ; l'UI permet de
  copier ce lien pour le transmettre manuellement, mais l'envoi
  automatique d'un e-mail formaté nécessite une Edge Function sur le
  projet Supabase de l'utilisateur (hors périmètre de ce bac à
  sable, qui n'a pas de projet Supabase connecté).
- **Rappels d'anniversaire automatiques** : la fonction SQL
  `check_birthday_notifications()` existe et crée bien les
  notifications attendues quand elle est appelée, mais rien ne
  l'appelle seule au quotidien — il faut soit une tâche `pg_cron`,
  soit une Edge Function planifiée sur le projet Supabase réel. Les
  notifications déclenchées par événement (nouvel acte, nouvelle
  photo) n'ont pas cette limite : elles fonctionnent dès maintenant
  via des triggers.
- **Portée de l'i18n** : les 6 langues couvrent la page Paramètres, la
  navigation et les textes communs ; le reste de l'application
  (fiches, arbre, carte, statistiques…) reste en français écrit en
  dur. Étendre la couverture consiste à ajouter des clés aux 6
  fichiers `src/i18n/locales/*.json` et à remplacer le texte en dur
  par `useTranslation()` au fur et à mesure.
- **Portée de l'onglet "Historique"** : volontairement limité aux
  modifications de la fiche `individuals` elle-même (pas aux
  événements, unions ou filiations qui la concernent) pour rester
  lisible sur une fiche ; le journal complet, toutes tables
  confondues, reste accessible aux administrateurs via Paramètres →
  Maintenance.
- **Portée des préférences d'affichage** : `date_format` et
  l'affichage surnom/profession ne sont appliqués qu'aux cartes de
  l'arbre (`PersonCard.jsx`) pour l'instant ; les autres écrans qui
  affichent une date (Chronologie, fiche animal, revue de fusion,
  assistant d'import, éventail, recherche d'individu, Statistiques…)
  utilisent encore le format français en toutes lettres existant.
- **Navigation précédent/suivant dans les visionneuses** : câblée
  pour la galerie Photos et l'onglet Photos d'une fiche individu ;
  pas encore pour la visionneuse photo ouverte depuis une fiche
  animal (`PetDetailModal.jsx`).

## Prochaines étapes suggérées

1. Transformer les invitations et les rappels d'anniversaire en
   e-mails réels : créer une Edge Function Supabase (ou un service
   externe) déclenchée par une nouvelle ligne `tree_invitations`, et
   planifier `check_birthday_notifications()` via `pg_cron` ou une
   Edge Function planifiée quotidienne.
2. Étendre la couverture i18n au-delà de Paramètres/navigation/textes
   communs, écran par écran, en réutilisant les 6 fichiers de langue
   déjà en place.
3. Étendre `date_format`/surnoms/professions aux autres écrans qui
   affichent une date ou une carte de personne (Chronologie, fiche
   animal, revue de fusion, assistant d'import, Statistiques…).
4. Si le besoin se présente, passer `audit_findings` d'un recalcul à
   la volée à un calcul périodique persisté (voir "Limites" plus
   haut) — la table existe déjà dans le schéma.
