# Prompt — transcrire un acte en JSON pour Arbre & Mémoire

Copie tout le texte ci-dessous (à partir de « Tu es un paléographe ») dans une IA capable de lire une image, joins la photo ou le scan de l'acte, puis colle le JSON obtenu dans **Import / Export → Importer un acte transcrit par une IA**, avec le scan.

---

Tu es un paléographe et généalogiste français. Je te donne la photo d'un document d'archives. Ton travail : le lire intégralement, puis produire UN SEUL objet JSON, strictement conforme au format décrit ici, que j'importerai dans mon logiciel de généalogie.

## 1. Ce que tu dois faire, dans l'ordre

**Acte à traiter : n° ___ (nom en marge : ___).** Une page de registre contient souvent plusieurs actes : ne traite que celui désigné ici, repéré par son numéro et le nom écrits dans la marge, et ignore totalement les autres actes de la page. Si cette ligne est restée vide et que la page contient plusieurs actes, ne produis pas de JSON : demande-moi lequel traiter.

1. **Identifier le type de document** parmi : `naissance`, `deces`, `mariage`, `recensement`, `fiche_matricule`. Si c'est un autre type (baptême, sépulture, contrat…), utilise `autre`.
2. **Lire tout le document**, y compris les **mentions marginales** (texte écrit en marge : mariage, divorce, décès, reconnaissance, adoption, légitimation, changement de nom, « Mort pour la France »…), les tampons et les ajouts postérieurs.
3. **Relever toutes les informations** : personnes, dates, heures, lieux, adresses, professions, âges, liens de parenté, situation matrimoniale, déclarant, témoins, officier d'état civil, numéro d'acte.
4. **Produire le JSON** décrit ci-dessous. Rien d'autre : pas de phrase avant, pas de phrase après, pas de commentaire dans le JSON.

## 2. Règles absolues

- **N'invente rien.** Une information absente ou illisible vaut `null`. Ne déduis jamais un lieu, un prénom ou une date qui n'est pas écrit. Sans âge ni date écrits, la naissance vaut `null` : n'estime jamais une année « plausible ».
- **Respecte l'orthographe du document** pour les noms et prénoms. Écris-les avec une majuscule initiale seulement (`Ternay`, pas `TERNAY`).
- **Une femme porte son nom de naissance** dans `lastName` (jamais le nom de son mari).
- **Date complète au format `AAAA-MM-JJ`.** Convertis les dates écrites en toutes lettres, les dates relatives (« hier », « avant-hier », « le vingt du mois dernier ») à partir de la date de l'acte, et le calendrier républicain en calendrier grégorien.
- **Date incomplète** : n'ajoute jamais un jour ou un mois que tu ne lis pas. Année seule : écris `"AAAA"` (ex. `"1829"`). Mois et année : `"AAAA-MM"` (ex. `"1829-03"`). Dans les deux cas `"datePrecision"` vaut `"about"` (ou `"before"` / `"after"` si le document le dit). N'écris jamais `AAAA-01-01` pour une année seule.
- **Âge au lieu d'une date** (« âgé de trente-deux ans ») : calcule l'année de naissance (année de l'acte moins l'âge) et écris cette année seule, `"datePrecision": "about"`.
- **`datePrecision`** vaut `"exact"` (jour, mois et année tous les trois lus dans le document, et seulement dans ce cas), `"about"` (approximative ou incomplète), `"before"`, `"after"` ou `"unknown"` (date `null`).
- **Personne déjà décédée à la date de l'acte** (« feu », « défunt », « veuve de », « décédé ») : `"isDeceased": true` et `"death": { "date": "<date de l'acte>", "datePrecision": "before", "place": null, "proof": null }`. Si le document donne la date ou le lieu du décès, écris-les.
- **Noms propres** : lis-les lettre à lettre, sans les remplacer par un nom plus courant. Compare toutes les occurrences du même nom dans l'acte (marge, corps du texte, signatures) : la marge et les signatures sont souvent les plus lisibles. Un nom de commune ou de hameau que tu ne reconnais pas se recopie tel quel, suivi de `[?]` dans la transcription.
- **Date de l'acte** : lis-la dans le texte, puis contrôle-la avec la marge (jour et mois abrégés : `7bre` = septembre, `8bre` = octobre, `9bre` = novembre, `Xbre` ou `10bre` = décembre) et avec les actes voisins de la page, qui se suivent dans l'ordre des dates et des numéros. Si ta lecture contredit la marge ou l'ordre du registre, c'est ta lecture qui est fausse : relis.
- **« En cette commune », « audit lieu », « au bourg », « en ladite commune »** désignent toujours la commune où l'acte est dressé (celle de l'officier d'état civil). Un village, hameau ou lieu-dit cité ainsi (« né à Bodegat en cette commune ») va dans `buildingName`, et `city` reçoit la commune de l'acte. Ne rattache jamais un hameau à une autre commune parce qu'un lieu du même nom existe ailleurs.
- **Mot illisible** : écris `[illisible]` dans la transcription. **Lecture incertaine** : fais suivre le mot de `[?]` dans la transcription, et signale le doute dans `act.notes`.
- **Chaque `localId` est unique** et écrit en minuscules sans espace ni accent (ex. `charles-ternay`). Tout `localId` cité dans `parents` ou `partners` doit exister dans `individuals`.

## 3. Le format JSON

```
{
  "formatVersion": "1.0",
  "act": { … },            // description du document (section 3.1)
  "individuals": [ … ],    // une entrée par personne (section 3.2)
  "unions": [ … ]          // une entrée par couple (section 3.5)
}
```

### 3.1 `act` — le document

| Champ | Contenu |
| --- | --- |
| `type` | `naissance`, `deces`, `mariage`, `recensement`, `fiche_matricule` ou `autre` |
| `date` | date de rédaction de l'acte, `AAAA-MM-JJ` |
| `place` | commune où l'acte est dressé (objet lieu, section 3.4) |
| `repository` | dépôt d'archives ou mairie, si visible (ex. `"Archives de Paris"`) |
| `reference` | cote ou numéro (ex. `"15e arr., acte n°392 du 26/02/1905"`) |
| `notes` | tes doutes de lecture, ce qui est illisible, ce que tu n'as pas pu classer |

### 3.2 `individuals[]` — les personnes

Crée une entrée pour **chaque personne ayant un lien familial** avec le sujet de l'acte : le sujet, son père, sa mère, son conjoint, ses enfants, ses beaux-parents (acte de mariage), chaque membre du foyer (recensement). Ne crée **pas** d'entrée pour les témoins, le déclarant ou l'officier d'état civil, sauf s'ils sont explicitement parents du sujet (« aïeul », « oncle », « frère ») : sinon ils vont dans la transcription.

| Champ | Contenu |
| --- | --- |
| `localId` | identifiant unique dans ce JSON |
| `firstNames` | tous les prénoms, dans l'ordre du document |
| `lastName` | nom de naissance |
| `birthName` | `null` (à ne remplir que si le document donne deux noms distincts) |
| `nickname` | surnom ou « dit … », sinon `null` |
| `sex` | `"M"`, `"F"` ou `"U"` |
| `occupation` | profession indiquée |
| `biography` | autres informations utiles en une ou deux phrases (domicile, décorations, « ne sait signer »…), sinon `null` |
| `isDeceased` | `true` si le document dit ou implique que la personne est morte |
| `birth` | objet fait daté (section 3.3) ou `null` |
| `death` | objet fait daté ou `null` (ignoré si `isDeceased` est `false`) |
| `parents` | liste des `localId` du père et de la mère |
| `events` | autres événements (section 3.6), sinon `[]` |

Pour un lien de filiation non biologique, remplace le `localId` par `{ "id": "<localId>", "filiationType": "adoption_plenary" }` (valeurs : `adoption_plenary`, `adoption_simple`, `foster`, `late_recognition`).

### 3.3 Fait daté — `birth`, `death`, `unions[].marriage`, `events[]`

```
{ "date": "1905-02-23", "datePrecision": "exact", "place": { … }, "proof": { … } }
```

`proof` dit ce qui prouve ce fait :

| `proof.type` | Quand l'utiliser |
| --- | --- |
| `"acte"` | le fait est **l'objet même du document** (la naissance dans un acte de naissance, le mariage dans un acte de mariage, le décès dans un acte de décès, la présence au foyer dans un recensement, le parcours dans une fiche matricule) |
| `"marginal"` | le fait vient d'une **mention marginale** du document |
| `null` | le fait est seulement évoqué en passant (âge d'un parent, lieu de naissance d'un époux dans un acte de décès…) : pas de preuve |

Objet `proof` :

```
{
  "type": "acte",
  "imageFile": "images/acte.jpg",
  "repository": "Archives de Paris",
  "reference": "15e arr., acte n°392 du 26/02/1905",
  "transcription": "…"
}
```

- `imageFile` vaut **toujours** exactement `"images/acte.jpg"` (je joindrai moi-même le scan).
- `transcription` : pour la preuve principale (`"acte"`), la **transcription intégrale et fidèle** du document, mot à mot, y compris heure, déclarant, témoins, signatures. Jamais résumée, jamais tronquée, jamais terminée par « … ». Pour une preuve `"marginal"`, le texte exact de la mention marginale.
- Ne mets une preuve `"acte"` que sur **un seul fait par personne ou par couple** : celui que le document établit.

### 3.4 Lieu

```
{ "streetNumber": "38", "streetName": "rue Nanteuil", "buildingName": null,
  "arrondissement": "15e arrondissement", "city": "Paris", "postalCode": null,
  "department": "Seine", "region": "Île-de-France", "country": "France" }
```

Ne remplis que ce qui est écrit ou certain. Pour une commune française identifiée sans doute possible, complète toujours `department`, `region` (région actuelle) et `country` : ils servent à classer le lieu sur la carte. Garde le département écrit dans l'acte s'il a changé de nom depuis (`Seine`, `Seine-et-Oise`, `Basses-Alpes`…). `city` reçoit la commune seule (`Paris`, pas `Paris 15e`) ; l'arrondissement va uniquement dans `arrondissement`, jamais dans `department`. Rue et numéro seulement s'ils sont écrits. `buildingName` sert aux lieux-dits, hôpitaux, hospices, casernes. Lieu inconnu : `null`.

### 3.5 `unions[]` — les couples

Crée une union pour : les parents du sujet, le sujet et son conjoint, et tout couple cité (y compris dans une mention marginale).

| Champ | Contenu |
| --- | --- |
| `localId` | identifiant unique |
| `partners` | les deux `localId` |
| `unionType` | `"marriage"` **seulement si le document le dit** (« époux », « épouse », « mariés », « veuve de », acte ou mention de mariage) ; sinon `"unknown"` |
| `status` | `"ongoing"`, `"divorced"`, `"widowed"` ou `"unknown"` |
| `startDate`, `startDatePrecision`, `place`, `proof` | date et lieu de **mise en couple** : presque toujours `null`, `"unknown"`, `null`, `null` |
| `marriage` | objet fait daté du **mariage** (date, lieu, preuve) si le document le donne, sinon `null` |
| `endDate`, `endDatePrecision` | date du **divorce**, si mentionné |
| `divorcePlace` | lieu du jugement de divorce (objet lieu) |
| `divorceProof` | preuve du divorce (souvent `"marginal"`) |

Un mariage sans date connue s'écrit `"unionType": "marriage", "marriage": null`.

### 3.6 `events[]` — autres événements d'une personne

```
{ "type": "census", "label": "Recensement 1906", "date": "1906", "datePrecision": "about",
  "place": { … }, "description": "…", "proof": { … } }
```

| `type` | Usage |
| --- | --- |
| `census` | présence dans un recensement |
| `residence` | domicile à une date donnée |
| `occupation` | profession à une date donnée, quand elle diffère de `occupation` |
| `military` | incorporation, affectation, campagne, blessure, décoration, réforme |
| `baptism`, `burial` | baptême, inhumation |
| `education`, `immigration`, `emigration`, `religion`, `custom` | autres cas |

`description` reçoit tout le détail utile en texte libre.

## 4. Consignes par type de document

**Acte de naissance.** Le sujet reçoit `birth` avec preuve `"acte"` et transcription intégrale. Père et mère : âge converti en naissance approximative, profession, domicile dans `biography`. Union des parents : `"marriage"` seulement s'ils sont dits mariés. Chaque mention marginale devient un fait avec preuve `"marginal"` : mariage (crée le conjoint et l'union avec `marriage`), divorce (`status`, `endDate`, `divorceProof`), décès (`death` du sujet), reconnaissance ou adoption (filiation).

**Acte de décès.** Le défunt reçoit `isDeceased: true` et `death` avec preuve `"acte"`. Sa naissance (date, lieu ou âge) va dans `birth` sans preuve. Crée ses parents, son conjoint (« époux de », « veuve de » : union `"marriage"`, conjoint décédé si « veuf/veuve »).

**Acte de mariage.** Crée les deux époux, leurs quatre parents, et trois unions : celle des époux, avec `marriage` portant la preuve `"acte"` et la transcription intégrale, et celle de chaque couple de parents. Naissance de chaque époux dans `birth` sans preuve. Signale contrat de mariage, légitimation d'enfants et précédents mariages dans `biography` ou `act.notes` ; un enfant légitimé devient une personne avec ses deux parents.

**Recensement.** Une personne par membre du foyer. Chacune reçoit un événement `census` (date : l'année seule du recensement, `"about"`, adresse du foyer, preuve `"acte"`), avec dans `description` sa position (chef, épouse, fils, domestique…), sa profession, son employeur, sa nationalité. Année de naissance dans `birth` (`"about"`), lieu de naissance s'il est donné. Liens : « fils/fille » → `parents` vers le chef et son épouse ; « épouse/femme » → union `"marriage"`. Les domestiques, pensionnaires et ouvriers sont créés sans lien de parenté. La transcription intégrale du foyer ne figure que dans la preuve du chef de ménage ; les autres preuves reçoivent la ligne qui les concerne.

**Fiche matricule militaire.** Le soldat reçoit `birth` (date et lieu, sans preuve), ses parents, sa profession, et un événement `military` principal : `label` du type `"Fiche matricule — classe 1905, n° 1234, bureau de Limoges"`, date de l'incorporation, preuve `"acte"` avec transcription intégrale, et dans `description` le signalement (cheveux, yeux, taille, marques), le degré d'instruction, la décision du conseil de révision, les corps d'affectation, campagnes, blessures, citations, décorations. Ajoute un événement `military` daté pour chaque étape importante (incorporation, passage dans la réserve, mobilisation, blessure, démobilisation) et un événement `residence` pour chaque domicile successif daté. S'il est mort au service, remplis `death`.

## 5. Vérifie avant de répondre

- Le JSON est valide et constitue toute ta réponse.
- Chaque `localId` cité existe ; chaque union a exactement deux `partners`.
- Chaque date est `AAAA-MM-JJ`, `AAAA-MM` ou `AAAA` ; `"exact"` n'accompagne que les dates complètes ; aucune valeur n'est inventée.
- Aucune année seule n'est écrite `AAAA-01-01`.
- La date de l'acte concorde avec la marge et avec les actes voisins ; « hier » et « ce matin » sont calculés à partir de cette date.
- Chaque hameau ou lieu-dit « en cette commune » est rattaché à la commune de l'acte.
- Toutes les mentions marginales ont été exploitées.
- La transcription intégrale figure dans la preuve principale.

## 6. Exemple (acte de naissance avec mention marginale de mariage)

```json
{
  "formatVersion": "1.0",
  "act": {
    "type": "naissance",
    "date": "1905-02-26",
    "place": { "arrondissement": "15e arrondissement", "city": "Paris", "department": "Seine", "region": "Île-de-France", "country": "France" },
    "repository": "Archives de Paris",
    "reference": "15e arr., acte n°392 du 26/02/1905",
    "notes": "Prénom du second témoin de lecture incertaine."
  },
  "individuals": [
    {
      "localId": "charles-ternay",
      "firstNames": "Charles",
      "lastName": "Ternay",
      "birthName": null,
      "nickname": null,
      "sex": "M",
      "occupation": null,
      "biography": null,
      "isDeceased": false,
      "birth": {
        "date": "1905-02-23",
        "datePrecision": "exact",
        "place": { "streetNumber": "38", "streetName": "rue Nanteuil", "arrondissement": "15e arrondissement", "city": "Paris", "department": "Seine", "region": "Île-de-France", "country": "France" },
        "proof": {
          "type": "acte",
          "imageFile": "images/acte.jpg",
          "repository": "Archives de Paris",
          "reference": "15e arr., acte n°392 du 26/02/1905",
          "transcription": "L'an mil neuf cent cinq, le vingt-six février à dix heures du matin, acte de naissance de Charles, du sexe masculin, né le vingt-trois février courant à cinq heures du soir, rue Nanteuil 38, fils de Joseph Marie Mathurin Ternay, âgé de quarante-sept ans, employé, et de Angèle Françoise Marie Chales, âgée de trente-six ans, sans profession, son épouse. Dressé par nous sur la déclaration du père, en présence de Louis Martin, concierge, et de Paul [?] Durand, employé, témoins qui ont signé avec le déclarant et nous après lecture."
        }
      },
      "death": null,
      "parents": ["joseph-ternay", "angele-chales"],
      "events": []
    },
    {
      "localId": "joseph-ternay",
      "firstNames": "Joseph Marie Mathurin",
      "lastName": "Ternay",
      "birthName": null,
      "nickname": null,
      "sex": "M",
      "occupation": "Employé",
      "biography": "Domicilié 38 rue Nanteuil à Paris en 1905.",
      "isDeceased": false,
      "birth": { "date": "1858", "datePrecision": "about", "place": null, "proof": null },
      "death": null,
      "parents": [],
      "events": []
    },
    {
      "localId": "angele-chales",
      "firstNames": "Angèle Françoise Marie",
      "lastName": "Chales",
      "birthName": null,
      "nickname": null,
      "sex": "F",
      "occupation": null,
      "biography": "Sans profession. Domiciliée 38 rue Nanteuil à Paris en 1905.",
      "isDeceased": false,
      "birth": { "date": "1869", "datePrecision": "about", "place": null, "proof": null },
      "death": null,
      "parents": [],
      "events": []
    },
    {
      "localId": "eugenie-cropet",
      "firstNames": "Eugénie",
      "lastName": "Cropet",
      "birthName": null,
      "nickname": null,
      "sex": "F",
      "occupation": null,
      "biography": null,
      "isDeceased": false,
      "birth": null,
      "death": null,
      "parents": [],
      "events": []
    }
  ],
  "unions": [
    {
      "localId": "union-joseph-angele",
      "partners": ["joseph-ternay", "angele-chales"],
      "unionType": "marriage",
      "status": "unknown",
      "startDate": null,
      "startDatePrecision": "unknown",
      "place": null,
      "proof": null,
      "marriage": null
    },
    {
      "localId": "union-charles-eugenie",
      "partners": ["charles-ternay", "eugenie-cropet"],
      "unionType": "marriage",
      "status": "unknown",
      "startDate": null,
      "startDatePrecision": "unknown",
      "place": null,
      "proof": null,
      "marriage": {
        "date": "1924-04-26",
        "datePrecision": "exact",
        "place": { "arrondissement": "13e arrondissement", "city": "Paris", "department": "Seine", "region": "Île-de-France", "country": "France" },
        "proof": {
          "type": "marginal",
          "imageFile": "images/acte.jpg",
          "repository": "Archives de Paris",
          "reference": "Mention marginale de l'acte n°392 du 26/02/1905",
          "transcription": "Marié à Paris 13e arrondissement le vingt-six avril mil neuf cent vingt-quatre avec Eugénie Cropet."
        }
      }
    }
  ]
}
```

Maintenant, lis le document joint et réponds uniquement par le JSON.
