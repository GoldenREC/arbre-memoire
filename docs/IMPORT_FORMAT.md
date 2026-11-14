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
| `parents` | array de `localId` | non | 0 à 2 (ou plus, familles recomposées) `localId` d'autres entrées de `individuals[]`. Laisser vide si les parents ne sont pas transcrits comme fiches séparées. |

### 2.2 `unions[]`

Une entrée par mariage transcrit (acte de mariage).

| Champ | Type | Obligatoire | Notes |
|---|---|---|---|
| `localId` | string | **oui** | Unique dans ce fichier |
| `partners` | array de `localId` | **oui** | 2 `localId` présents dans `individuals[]` |
| `status` | `"ongoing"` \| `"divorced"` \| `"widowed"` \| `"annulled"` \| `"unknown"` | non (défaut `"ongoing"`) | |
| `startDate`, `startDatePrecision`, `place`, `proof` | — | non | Mêmes champs qu'un `DateFacts` (§2.3), sans l'imbrication — directement au niveau de l'union |

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

### 2.5 Objet `proof` (preuve — acte ou information familiale)

```jsonc
{
  "type": "acte",                                    // "acte" | "family"
  "url": "https://archives06.fr/ark:/.../p123",       // permalien, si type="acte" et pas d'image
  "imageFile": "images/durand-jean-naissance-1898.jpg" // chemin dans le zip, si type="acte" et pas d'url
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
d'énumération valides (`sex`, `datePrecision`, `proof.type`, `status`).
En cas d'erreur, rien n'est importé — la liste des erreurs est affichée
pour correction.
