/**
 * Export vers le format d'import personnalisé (voir docs/IMPORT_FORMAT.md)
 * — l'inverse de lib/customImport/mapper.js + commitImport.js : reconstruit
 * un `arbre.json` (+ dossier `images/` le cas échéant) à partir d'un
 * instantané de l'arbre (fetchTreeSnapshot.js), pour que l'utilisateur
 * puisse ré-importer ses propres données ailleurs, ou simplement les
 * archiver dans le format "métier" du site plutôt qu'un dump brut de
 * tables.
 *
 * `buildCustomImportModel` est une fonction pure (testable sans réseau ni
 * DOM, comme gedcomExporter.js/jsonExporter.js) : elle ne fait que lire le
 * snapshot et produire { arbreJson, imageRefs }, où `imageRefs` liste les
 * fichiers média à récupérer (storage_path -> chemin dans le zip),
 * téléchargés séparément par exportCustomImportZip (qui a seul besoin du
 * réseau/Supabase Storage).
 *
 * Correspondance avec les événements de jalon d'union (voir
 * unionMutations.js) :
 *  - `startDate`/`place`/`proof` au niveau de l'union = toujours la mise
 *    en couple (unions.start_date, + l'événement 'union_start' pour la
 *    preuve) ;
 *  - `marriage` (nouveau, optionnel) = jalon mariage, distinct, reconstruit
 *    depuis l'événement 'marriage' dédié ;
 *  - `endDate`/`divorcePlace`/`divorceProof` = jalon divorce, depuis
 *    unions.end_date + l'événement 'divorce'.
 */
import JSZip from 'jszip';
import { fetchTreeSnapshot } from './fetchTreeSnapshot.js';
import { downloadBlob, downloadJson, todayStamp } from './downloadHelpers.js';
import { downloadMediaBlob } from '../db/mediaStorage.js';

const PLACE_FIELD_MAP = {
  streetNumber: 'street_number',
  streetName: 'street_name',
  buildingName: 'building_name',
  arrondissement: 'arrondissement',
  city: 'city',
  postalCode: 'postal_code',
  department: 'department',
  region: 'region',
  country: 'country',
};

/** Lieu structuré (9 champs) à partir de la ligne `places` brute, ou null si vide/absente. */
function placeToStructured(placeRow) {
  if (!placeRow) return null;
  const out = {};
  let hasAny = false;
  for (const [jsonKey, column] of Object.entries(PLACE_FIELD_MAP)) {
    if (placeRow[column]) {
      out[jsonKey] = placeRow[column];
      hasAny = true;
    }
  }
  return hasAny ? out : null;
}

/** Enregistre un média comme image à exporter (dédoublonné par id média) ; retourne le chemin dans le zip. */
function registerImage(imageRefsByMediaId, media) {
  if (!media) return null;
  const existing = imageRefsByMediaId.get(media.id);
  if (existing) return existing.path;
  const basename = (media.storagePath || media.title || `${media.id}.bin`).split('/').pop();
  const path = `images/${basename}`;
  imageRefsByMediaId.set(media.id, { path, storagePath: media.storagePath, mediaId: media.id });
  return path;
}

/**
 * Construit l'objet `proof` (§2.5 du format) pour un événement donné, en
 * remontant citation -> source -> média éventuel. Retourne null si aucune
 * citation n'est rattachée (aucune preuve enregistrée pour ce jalon).
 */
function proofForEvent(snapshot, imageRefsByMediaId, event) {
  if (!event) return null;
  const citation = snapshot.citations.find((c) => c.eventId === event.id);
  if (!citation) return null;
  const source = snapshot.sources.find((s) => s.id === citation.sourceId);
  if (!source) return null;
  const media = snapshot.media.find((m) => m.sourceId === source.id) || null;

  const proof = { type: source.sourceType === 'family_data' ? 'family' : 'acte' };
  if (source.url) proof.url = source.url;
  if (media) proof.imageFile = registerImage(imageRefsByMediaId, media);
  if (source.repository) proof.repository = source.repository;
  if (source.callNumber) proof.reference = source.callNumber;
  if (citation.transcription) proof.transcription = citation.transcription;

  // Un acte sans permalien ni scan récupérable n'est pas valide au
  // ré-import (§2.5) — on le redégrade en "information familiale" plutôt
  // que de produire un fichier qui échouerait à la validation.
  if (proof.type === 'acte' && !proof.url && !proof.imageFile) {
    proof.type = 'family';
  }
  return proof;
}

function findEvent(snapshot, subjectKind, subjectId, eventType) {
  return snapshot.events.find((e) => e.subjectKind === subjectKind && e.subjectId === subjectId && e.eventType === eventType) || null;
}

/** Objet DateFacts (§2.3) pour une naissance/un décès, ou null si rien de renseigné. */
function dateFactsFor(snapshot, imageRefsByMediaId, { date, datePrecision, placeId }, event) {
  const place = placeToStructured(snapshot.placesById.get(placeId));
  const proof = proofForEvent(snapshot, imageRefsByMediaId, event);
  if (!date && !place && !proof) return null;
  return { date: date || null, datePrecision: datePrecision || 'unknown', place, proof };
}

function mapIndividualOut(snapshot, imageRefsByMediaId, ind) {
  const birthEvent = findEvent(snapshot, 'individual', ind.id, 'birth');
  const deathEvent = ind.isDeceased ? findEvent(snapshot, 'individual', ind.id, 'death') : null;

  const entry = {
    localId: ind.id,
    firstNames: ind.firstNames || null,
    lastName: ind.lastName || null,
    birthName: ind.birthName || null,
    nickname: ind.nickname || null,
    sex: ind.sex || 'U',
    occupation: ind.occupation || null,
    biography: ind.biography || null,
    isDeceased: !!ind.isDeceased,
    birth: dateFactsFor(snapshot, imageRefsByMediaId, { date: ind.birthDate, datePrecision: ind.birthDatePrecision, placeId: ind.birthPlaceId }, birthEvent),
  };
  if (ind.isDeceased) {
    entry.death = dateFactsFor(snapshot, imageRefsByMediaId, { date: ind.deathDate, datePrecision: ind.deathDatePrecision, placeId: ind.deathPlaceId }, deathEvent);
  }

  const parents = snapshot.filiations
    .filter((f) => f.childId === ind.id)
    .map((f) => (f.filiationType && f.filiationType !== 'biological' ? { id: f.parentId, filiationType: f.filiationType } : f.parentId));
  if (parents.length) entry.parents = parents;

  return entry;
}

function mapUnionOut(snapshot, imageRefsByMediaId, u) {
  const startEvent = findEvent(snapshot, 'union', u.id, 'union_start');
  const marriageEvent = findEvent(snapshot, 'union', u.id, 'marriage');
  const divorceEvent = findEvent(snapshot, 'union', u.id, 'divorce');

  const entry = {
    localId: u.id,
    partners: (u.partners || []).map((p) => p.individualId),
    unionType: u.unionType || 'unknown',
    status: u.status || 'unknown',
    startDate: u.startDate || null,
    startDatePrecision: u.startDatePrecision || 'unknown',
    place: placeToStructured(snapshot.placesById.get(u.placeId)),
    proof: proofForEvent(snapshot, imageRefsByMediaId, startEvent),
  };

  // Jalon "mariage" : seulement s'il existe en tant qu'événement dédié,
  // distinct de la mise en couple (voir unionMutations.js) — sinon rien à
  // exporter de plus que startDate/unionType ci-dessus.
  if (marriageEvent) {
    entry.marriage = {
      date: marriageEvent.eventDate || null,
      datePrecision: marriageEvent.datePrecision || 'unknown',
      place: placeToStructured(snapshot.placesById.get(marriageEvent.placeId)),
      proof: proofForEvent(snapshot, imageRefsByMediaId, marriageEvent),
    };
  }

  if (u.endDate) {
    entry.endDate = u.endDate;
    entry.endDatePrecision = u.endDatePrecision || 'unknown';
  }
  if (divorceEvent) {
    const divorcePlace = placeToStructured(snapshot.placesById.get(divorceEvent.placeId));
    if (divorcePlace) entry.divorcePlace = divorcePlace;
    const divorceProof = proofForEvent(snapshot, imageRefsByMediaId, divorceEvent);
    if (divorceProof) entry.divorceProof = divorceProof;
    if (!entry.endDate && divorceEvent.eventDate) {
      entry.endDate = divorceEvent.eventDate;
      entry.endDatePrecision = divorceEvent.datePrecision || 'unknown';
    }
  }

  return entry;
}

/**
 * Fonction pure : snapshot -> { arbreJson, imageRefs }. `imageRefs` est un
 * tableau de { path, storagePath, mediaId } — à télécharger séparément
 * (voir exportCustomImportZip) avant de constituer le .zip.
 */
export function buildCustomImportModel(snapshot) {
  const imageRefsByMediaId = new Map();

  const individuals = snapshot.individuals.map((ind) => mapIndividualOut(snapshot, imageRefsByMediaId, ind));
  const unions = snapshot.unions.map((u) => mapUnionOut(snapshot, imageRefsByMediaId, u));

  return {
    arbreJson: { formatVersion: '1.0', individuals, unions },
    imageRefs: Array.from(imageRefsByMediaId.values()),
  };
}

/**
 * Exporte l'arbre complet au format d'import personnalisé : un simple
 * `.json` si aucune image à joindre, sinon un `.zip` (arbre.json +
 * images/), directement ré-importable via l'écran d'import personnalisé.
 * Tolérant aux échecs individuels de téléchargement média (comme
 * exportJsonBackup) : un fichier manquant/inaccessible ne fait pas
 * échouer tout l'export, juste cet `imageFile` précis (le proof reste
 * dans le JSON avec les autres champs, mais sans le scan joint).
 */
export async function exportCustomImportZip(treeId) {
  const snapshot = await fetchTreeSnapshot(treeId);
  const { arbreJson, imageRefs } = buildCustomImportModel(snapshot);
  const stamp = todayStamp();

  if (imageRefs.length === 0) {
    downloadJson(arbreJson, `arbre-memoire-import-${stamp}.json`);
    return { individualCount: arbreJson.individuals.length, unionCount: arbreJson.unions.length, imagesIncluded: 0, imagesFailed: 0 };
  }

  const zip = new JSZip();
  zip.file('arbre.json', JSON.stringify(arbreJson, null, 2));
  const imagesFolder = zip.folder('images');

  let included = 0;
  let failed = 0;
  for (const ref of imageRefs) {
    try {
      const blob = await downloadMediaBlob(ref.storagePath);
      imagesFolder.file(ref.path.slice('images/'.length), blob);
      included++;
    } catch (err) {
      console.error(`Image ${ref.path} non récupérable pour l'export :`, err);
      failed++;
    }
  }

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  downloadBlob(zipBlob, `arbre-memoire-import-${stamp}.zip`);
  return { individualCount: arbreJson.individuals.length, unionCount: arbreJson.unions.length, imagesIncluded: included, imagesFailed: failed };
}
