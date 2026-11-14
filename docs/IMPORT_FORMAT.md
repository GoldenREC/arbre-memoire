# Format d'import personnalisé — Arbre & Mémoire

Ce document spécifie le format de fichier à utiliser pour importer des fiches
(naissance, décès, mariage) transcrites depuis des actes d'état civil — par
exemple via Gemini ou un autre assistant à qui on a envoyé la photo d'un acte.

Contrairement au GEDCOM, ce format permet de joindre directement les images
des actes (scans/photos), qui deviennent les preuves attachées à chaque
fiche — exactement comme le fait le site quand on saisit une date "Exacte"
à la main.

## 1. Conteneur : un fichier `.zip`

Le fichier importé est soit :

- un simple fichier **`.json`** (si aucune image à joindre — uniquement des
  permaliens d'archives en guise de preuve), soit
- un **`.zip`** contenant :
  - `arbre.json` à la racine (le contenu décrit en §2)
  - un dossier `images/` avec les fichiers scannés référencés depuis le JSON

Structure du zip :

```
mon-import.zip
├── arbre.json
└── images/
    ├── durand-jean-naissance-1898.jpg
    └── durand-jean-martin-mariage-1920.jpg
```

Les chemins référencés dans `arbre.json` (champ `proof.imageFile`) sont
relatifs à la racine du zip, par ex. `"images/durand-jean-naissance-1898.jpg"`.

## 2. Structure de `arbre.json`

```jsonc
{
  "formatVersion": "1.0",
  "individuals": [ /* voir §2.1 */ ],
  "unions": [ /* voir §2.2 — optionnel, uniquement si mariage transcrit */ ]
}
```

### 2.1 `individuals[]`

Une entrée par personne mentionnée (le sujet de l'acte, mais aussi ses
parents si l'acte les nomme — ce qui est le cas sur un acte de naissance
français classique).

| Champ | Type | Obligatoire | Notes |
|---|---|---|---|
| `localId` | string | **oui** | Identifiant libre, unique *dans ce fichier* (ex. `"p1"`). Sert à exprimer les liens parent/enfant et les unions. **Voir règle importante au §4.** |
| `firstNames` | string \| null | non | Prénoms tels qu'écrits sur l'acte |
| `lastName` | string \| null | non | |
| `birthName` | string \| null | non | Nom de naissance, si différent (femme mariée, etc.) |
| `nickname` | string \| null | non | |
| `sex` | `"M"` \| `"F"` \| `"U"` | non (défaut `"U"`) | |
| `occupation` | string \| null | non | Profession — y compris pour un parent cité sur l'acte |
| `biography` | string \| null | non | Note libre |
| `isDeceased` | boolean | non (défaut `false`) | Mettre `true` dès qu'un décès est connu, même sans date exacte |
| `birth` | objet `DateFacts` \| null | non | Voir §2.3 |
| `death` | objet `DateFacts` \| null | non | Voir §2.3 — ignoré si `isDeceased` n'est pas `true` |
| `parents` | array de `localId` \| `{id, filiationType}` | non | 0 à 2 (ou plus, familles recomposées) entrées référençant d'autres `individuals[]`. Laisser vide si les parents ne sont pas transcrits comme fiches séparées. **Un parent inconnu (enfant naturel, père non déclaré...) ne doit jamais apparaître comme `null` dans la liste — omettre simplement cette entrée** : `["mere"]`, pas `[null, "mere"]`. Chaque entrée peut être soit un simple `localId` (filiation biologique implicite — forme la plus courante), soit un objet `{ "id": "<localId>", "filiationType": "..." }` pour un lien non biologique. `filiationType` accepte : `biological` (défaut), `adoption_plenary`, `adoption_simple`, `foster` (famille d'accueil), `late_recognition` (reconnaissance tardive), `unknown`. Exemple pour un beau-père adoptif : `"parents": ["mere-biologique", { "id": "pere-adoptif", "filiationType": "adoption_simple" }]`. |

### 2.2 `unions[]`

Une entrée par couple : mariage transcrit, ou simple mise en couple/
concubinage (pas de preuve d'union qu'un mariage).

| Champ | Type | Obligatoire | Notes |
|---|---|---|---|
| `localId` | string | **oui** | Unique dans ce fichier |
| `partners` | array de `localId` | **oui** | 2 `localId` présents dans `individuals[]`. Si un conjoint n'a pas de fiche détaillée (acte non transcrit), créer quand même une entrée minimale dans `individuals[]` pour lui (voir §2.6) plutôt qu'un champ à part. |
| `unionType` | `"marriage"` \| `"civil_union"` \| `"cohabitation"` \| `"unknown"` | non | **Ne pas omettre dès qu'on sait que ce n'est pas un mariage** — sans ce champ, un `status: "divorced"`/`"widowed"` est déduit comme mariage (seul cas où on peut divorcer/être veuf), sinon le type reste `"unknown"` (jamais présumé `"marriage"` par défaut). |
| `status` | `"ongoing"` \| `"divorced"` \| `"widowed"` \| `"annulled"` \| `"unknown"` | non (défaut `"ongoing"`) | Mettre `"divorced"` dès qu'un jugement de divorce est transcrit |
| `startDate`, `startDatePrecision`, `place`, `proof` | — | non | Mêmes champs qu'un `DateFacts` (§2.3), sans l'imbrication — directement au niveau de l'union. Une seule date/lieu par union dans ce format : pour un `unionType: "marriage"`, c'est la date de **mariage** ; sinon (en couple, inconnu), c'est la date de **mise en couple**. `proof` suit la même règle (acte de mariage, ou simple preuve familiale de mise en couple). |
| `endDate` | string (ISO) \| null | non | Date du jugement de divorce (si `status: "divorced"`) |
| `endDatePrecision` | `"exact"` \| `"about"` \| `"before"` \| `"after"` \| `"unknown"` | non (défaut `"exact"` si `endDate` fourni) | |
| `divorceProof` | objet `proof` \| null | non | Preuve du **jugement de divorce** — même forme que `proof` (§2.5), mais distincte : elle sera rattachée à l'événement "divorce", pas à l'acte de mariage. Le tribunal et la date de transcription du jugement, s'ils sont connus, vont dans `divorceProof.transcription` (texte libre). |

### 2.3 Objet `DateFacts` (utilisé par `birth` et `death`)

```jsonc
{
  "date": "1898-04-12",           // ISO YYYY-MM-DD, ou null si inconnue
  "datePrecision": "exact",       // "exact" | "about" | "before" | "after" | "unknown"
  "place": { /* voir §2.4 */ },   // ou null si lieu inconnu
  "proof": { /* voir §2.5 */ }    // ou null si aucune preuve
}
```

Règle pour `date` + `datePrecision` : toujours remplir `date` avec la
meilleure estimation ponctuelle, et qualifier via `datePrecision` —
exactement la convention déjà utilisée par le site :
- Date lisible intégralement sur l'acte → `"exact"`
- "vers 1850" / année seule déduite → `date: "1850-01-01"`, `"about"`
- Antérieur/postérieur à une date connue → `"before"` / `"after"`
- Rien de fiable → `date: null`, `"unknown"`

### 2.4 Objet `place` (lieu structuré — identique au formulaire du site)

```jsonc
{
  "streetNumber": null,            // "12", "14 bis"...
  "streetName": null,
  "buildingName": "Le Moulin",      // bâtiment / lieu-dit
  "arrondissement": null,           // "6e arrondissement" (Paris/Lyon/Marseille)
  "city": "Grasse",
  "postalCode": "06130",
  "department": "Alpes-Maritimes",  // ou état pour un pays hors France
  "region": "Provence-Alpes-Côte d'Azur",
  "country": "France"
}
```

Tous les champs sont optionnels — ne renseigner que ce qui est écrit sur
l'acte ou clairement déduit (ex. le code postal implique souvent le
département). Ce découpage alimente directement la carte interactive du
site (géocodage en cascade : du plus précis au plus général).

**Important — ne jamais envoyer un lieu comme une seule chaîne de texte**
(ex. `"Aix-en-Provence (13), Bouches-du-Rhône, Provence-Alpes-Côte
d'Azur, France"`). Toujours le découper dans les champs ci-dessus :

```jsonc
{ "city": "Aix-en-Provence", "department": "Bouches-du-Rhône", "region": "Provence-Alpes-Côte d'Azur", "country": "France" }
```

Deux pièges fréquents à éviter :
- Le numéro entre parenthèses après une ville (ex. `"(13)"`, `"(75)"`)
  est le **numéro du département**, pas un code postal — ne jamais le
  mettre dans `postalCode`. Soit l'ignorer (le nom complet du
  département dans `department` suffit), soit l'ajouter entre
  parenthèses à la fin de `department` si c'est utile à titre indicatif
  (ex. `"Bouches-du-Rhône (13)"`).
- Une adresse précise ("38 rue Nanteuil") n'est **pas** un champ à part
  — elle va dans `streetNumber`/`streetName` de ce même objet `place`
  (ex. `"streetNumber": "38", "streetName": "rue Nanteuil"`).
- Un arrondissement ("Paris 15e", "13e arrondissement") va dans
  `arrondissement`, et `city` reste la ville seule ("Paris").

### 2.5 Objet `proof` (preuve — acte ou information familiale)

```jsonc
{
  "type": "acte",                                       // "acte" | "family"
  "url": "https://archives06.fr/ark:/.../p123",          // permalien, si type="acte" et pas d'image
  "imageFile": "images/durand-jean-naissance-1898.jpg",  // chemin dans le zip, si type="acte" et pas d'url
  "repository": "Archives de Paris",                     // optionnel — dépôt d'archives
  "reference": "15e arr., acte n°392 du 26/02/1905",     // optionnel — cote exacte de l'acte
  "transcription": "Déclaré par Joseph Ternay (père). Témoins : Louis Fontanie (45 ans, journalier), Émile Van Accempt (30 ans, journalier)." // optionnel — texte libre
}
```

- `type: "acte"` nécessite **soit** `url`, **soit** `imageFile` (les deux
  sont acceptés en même temps si pertinent).
- `type: "family"` ("informations familiales") ne nécessite ni `url` ni
  `imageFile` — c'est l'équivalent exact de l'option "Informations
  familiales" du site (ex. personne née après 1920, acte non consultable
  en ligne).
- Une preuve n'est **obligatoire**, côté site, que lorsque
  `datePrecision: "exact"` — mais elle peut être fournie même pour une
  date approximative si l'acte existe (par ex. un acte dont seule l'année
  est lisible).
- `repository` et `reference` sont optionnels et réservés à `type:
  "acte"` — ils alimentent la fiche de la source (dépôt + cote), pour
  pouvoir retrouver l'acte aux archives plus tard.
- `transcription` est le champ **fourre-tout** pour tout ce que l'acte
  transcrit par Gemini contient et qui n'a pas de case dédiée sur le
  site : heure de l'acte, déclarant (nom, lien, âge, profession),
  témoins, mentions spéciales (légitimation, changement de nom,
  rectification), date de transcription de l'acte dans un autre
  registre. Rédiger ça en une ou deux phrases lisibles plutôt qu'en
  JSON imbriqué — voir l'exemple ci-dessus et §2.6.

### 2.6 Cas particuliers

- **Nom de naissance différent du nom actuel** (légitimation, mariage,
  changement de nom) : utiliser `birthName` sur l'individu (§2.1), pas
  une note à part. Ex. une personne légitimée qui s'appelait `Renaud` à
  la naissance et porte maintenant `Anguille` : `"lastName": "Anguille",
  "birthName": "Renaud"`.
- **Détail individuel notable** (jumeau, rang de naissance, etc.) : dans
  `biography` (§2.1), en texte libre — ex. `"Fille jumelle, deuxième
  née."`
- **Conjoint cité mais sans acte propre** (ex. un remariage où seul le
  nom du second conjoint est connu) : créer tout de même une entrée
  minimale dans `individuals[]` pour lui (juste `localId`,
  `firstNames`, `lastName`, `sex`), et le référencer normalement dans
  `unions[].partners`. Ne pas inventer un champ `conjointNom` à part.
- **Divorce** : voir `endDate`/`endDatePrecision`/`divorceProof` au
  §2.2.

## 3. Exemple complet

```json
{
  "formatVersion": "1.0",
  "individuals": [
    {
      "localId": "pere",
      "firstNames": "Jean Antoine",
      "lastName": "Durand",
      "sex": "M",
      "occupation": "Cultivateur",
      "parents": []
    },
    {
      "localId": "mere",
      "firstNames": "Marie Joséphine",
      "lastName": "Martin",
      "sex": "F",
      "occupation": "Sans profession",
      "parents": []
    },
    {
      "localId": "enfant",
      "firstNames": "Jean Pierre",
      "lastName": "Durand",
      "sex": "M",
      "occupation": "Cultivateur",
      "isDeceased": true,
      "birth": {
        "date": "1898-04-12",
        "datePrecision": "exact",
        "place": {
          "city": "Grasse",
          "postalCode": "06130",
          "department": "Alpes-Maritimes",
          "region": "Provence-Alpes-Côte d'Azur",
          "country": "France"
        },
        "proof": {
          "type": "acte",
          "imageFile": "images/durand-jean-pierre-naissance-1898.jpg"
        }
      },
      "death": {
        "date": "1972-11-03",
        "datePrecision": "exact",
        "place": {
          "city": "Nice",
          "department": "Alpes-Maritimes",
          "country": "France"
        },
        "proof": {
          "type": "family"
        }
      },
      "parents": ["pere", "mere"]
    }
  ],
  "unions": [
    {
      "localId": "mariage-pere-mere",
      "partners": ["pere", "mere"],
      "status": "ongoing",
      "startDate": "1895-06-01",
      "startDatePrecision": "exact",
      "place": { "city": "Grasse", "department": "Alpes-Maritimes", "country": "France" },
      "proof": { "type": "acte", "url": "https://archives06.fr/ark:/exemple" }
    }
  ]
}
```

### 3.1 Exemple avec acte riche, remariage et divorce

Cas réel : un homme né en 1905 à Paris (acte avec déclarant + témoins),
marié une première fois en 1924 (union dissoute par divorce en 1948),
remarié en 1958 à une personne dont seul le nom est connu.

```json
{
  "formatVersion": "1.0",
  "individuals": [
    {
      "localId": "charles",
      "firstNames": "Charles",
      "lastName": "Ternay",
      "sex": "M",
      "birth": {
        "date": "1905-02-23",
        "datePrecision": "exact",
        "place": {
          "streetNumber": "38",
          "streetName": "rue Nanteuil",
          "arrondissement": "15e arrondissement",
          "city": "Paris",
          "department": "Paris",
          "country": "France"
        },
        "proof": {
          "type": "acte",
          "repository": "Archives de Paris",
          "reference": "15e arr., acte n°392 du 26/02/1905",
          "transcription": "Né à 19h00. Déclaré par Joseph Marie Mathurin Ternay (père). Témoins : Louis Fontanie (45 ans, journalier, 32 rue des Hospices), Émile Van Accempt (30 ans, journalier, 2 rue des Vignes au Cure)."
        }
      },
      "isDeceased": true,
      "death": {
        "date": "1979-02-25",
        "datePrecision": "exact",
        "place": { "city": "Donzenac", "department": "Corrèze", "country": "France" },
        "proof": { "type": "family", "transcription": "Acte transcrit le 1er mars 1979." }
      },
      "parents": []
    },
    {
      "localId": "eugenie",
      "firstNames": "Eugénie",
      "lastName": "Cropet",
      "sex": "F",
      "biography": "Fille jumelle, deuxième née.",
      "birth": {
        "date": "1906-12-07",
        "datePrecision": "exact",
        "place": { "streetNumber": "1", "streetName": "rue de Lacépède", "arrondissement": "5e arrondissement", "city": "Paris", "department": "Paris", "country": "France" },
        "proof": {
          "type": "acte",
          "repository": "Archives de Paris",
          "reference": "5e arr., acte n°3239 du 09/12/1906",
          "transcription": "Née à 11h00 du matin, déclarée le jour même à 21h. Déclarant : Gaston Seveque (30 ans, père absent, a assisté à l'accouchement). Témoins : Raoul Acard (40 ans, sous-employé), Pierre Malabre (50 ans, sous-employé)."
        }
      },
      "parents": []
    },
    {
      "localId": "marguerite",
      "firstNames": "Marguerite Marie Florgette",
      "lastName": "Couteau",
      "sex": "F",
      "parents": []
    }
  ],
  "unions": [
    {
      "localId": "mariage-charles-eugenie",
      "partners": ["charles", "eugenie"],
      "status": "divorced",
      "startDate": "1924-04-26",
      "startDatePrecision": "exact",
      "place": { "arrondissement": "13e arrondissement", "city": "Paris", "country": "France" },
      "endDate": "1948-06-07",
      "endDatePrecision": "exact",
      "divorceProof": {
        "type": "family",
        "transcription": "Jugement du tribunal civil de la Seine du 07/06/1948, transcrit le 27/11/1948."
      }
    },
    {
      "localId": "mariage-charles-marguerite",
      "partners": ["charles", "marguerite"],
      "status": "ongoing",
      "startDate": "1958-07-19",
      "startDatePrecision": "exact",
      "place": { "city": "Paris", "country": "France" }
    }
  ]
}
```

Notes sur cet exemple :
- `marguerite` (second conjoint, seulement nommé) a une fiche minimale
  plutôt qu'un champ `conjointNom` (voir §2.6).
- Le divorce porte sa propre preuve (`divorceProof`), distincte de la
  preuve du mariage lui-même (`proof`, absente ici car l'acte de
  mariage n'a pas été transcrit).
- L'heure, le déclarant, les témoins et la date de transcription vont
  tous dans `transcription`, en texte lisible — jamais comme nouveaux
  champs structurés.

## 4. Règle importante : une personne = un seul `localId`

Si tu importes **plusieurs actes dans le même fichier** (ex. les actes de
naissance de plusieurs enfants d'un même couple), les parents doivent
réapparaître avec **exactement le même `localId`** dans chaque fiche —
sinon ils seront créés en double. Il suffit de les décrire en entier une
seule fois ; les occurrences suivantes peuvent être minimales :

```json
{ "localId": "pere", "parents": [] }
```

**Recommandation pratique** : si tu transcris les actes un par un avec
Gemini (une conversation = un acte), il est plus simple d'importer un
fichier par acte (donc par personne + ses parents). Le site rapproche déjà
automatiquement les fiches qui ressemblent à des personnes existantes lors
de chaque import (étape de revue avant écriture) — les doublons entre deux
imports séparés sont donc détectés et proposés à la fusion.

## 5. Validation

Avant toute écriture en base, le fichier est entièrement validé côté
navigateur : `localId` uniques, références `parents`/`partners`
résolues, fichiers `imageFile` bien présents dans le zip, valeurs
d'énumération valides (`sex`, `datePrecision`, `proof.type`, `status`, `unionType`).
En cas d'erreur, rien n'est importé — la liste des erreurs est affichée
pour correction.
