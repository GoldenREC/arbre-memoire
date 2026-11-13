/**
 * Transforme l'arbre de noeuds GEDCOM (voir parser.js) en un modèle
 * interne "de staging" qui suit la forme du schéma Supabase
 * (supabase/schema.sql), mais avec des identifiants temporaires basés
 * sur les xref GEDCOM (ex: "gedcom:I1") au lieu d'UUID — les UUID
 * définitifs ne sont attribués qu'au moment de l'écriture en base,
 * après la revue de fusion/dédoublonnage (voir dedupe/merge.js).
 */
import { findChild, findChildren, findChildValue, parseGedcomDate } from './parser.js';

const PEDI_TO_FILIATION = {
  birth: 'biological',
  adopted: 'adoption_plenary',
  foster: 'foster',
  sealing: 'unknown',
};

function localIndiId(xref) {
  return `gedcom:${xref}`;
}
function localFamId(xref) {
  return `gedcom:${xref}`;
}

/**
 * Enregistre un lieu brut (chaîne GEDCOM) et retourne une clé stable
 * pour le dédoublonnage (places normalisées par libellé exact pour le
 * moment ; un rapprochement plus fin — accents, abréviations — pourra
 * être ajouté en phase "carte interactive").
 */
function registerPlace(placesMap, rawLabel) {
  if (!rawLabel) return null;
  const key = rawLabel.trim().toLowerCase();
  if (!placesMap.has(key)) {
    placesMap.set(key, { localId: `place:${placesMap.size + 1}`, rawLabel: rawLabel.trim() });
  }
  return placesMap.get(key).localId;
}

function mapIndividualRecord(record, placesMap) {
  const xref = record.xref;
  const nameNode = findChild(record, 'NAME');
  let firstNames = null, lastName = null, birthName = null;
  if (nameNode) {
    // Format GEDCOM standard : "Jean Pierre /Dupont/"
    const raw = nameNode.value || '';
    const m = /^([^/]*)\/([^/]*)\/?(.*)$/.exec(raw);
    if (m) {
      firstNames = m[1].trim() || null;
      lastName = m[2].trim() || null;
    } else {
      firstNames = raw.trim() || null;
    }
    const birthNameNode = findChild(nameNode, 'SURN');
    if (birthNameNode) birthName = birthNameNode.value;
  }

  const sexValue = findChildValue(record, 'SEX');
  const sex = sexValue === 'M' || sexValue === 'F' ? sexValue : 'U';

  const birtNode = findChild(record, 'BIRT');
  const birthDateInfo = parseGedcomDate(findChildValue(birtNode, 'DATE'));
  const birthPlaceLocalId = registerPlace(placesMap, findChildValue(birtNode, 'PLAC'));

  const deatNode = findChild(record, 'DEAT');
  const isDeceased = !!deatNode;
  const deathDateInfo = parseGedcomDate(findChildValue(deatNode, 'DATE'));
  const deathPlaceLocalId = registerPlace(placesMap, findChildValue(deatNode, 'PLAC'));

  const occu = findChildValue(record, 'OCCU');
  const noteNode = findChild(record, 'NOTE');

  const famc = findChildren(record, 'FAMC').map((n) => ({
    famLocalId: localFamId(n.value.replace(/@/g, '')),
    filiationType: PEDI_TO_FILIATION[(findChildValue(n, 'PEDI') || '').toLowerCase()] || 'biological',
  }));
  const fams = findChildren(record, 'FAMS').map((n) => localFamId(n.value.replace(/@/g, '')));

  // Autres événements individuels non essentiels au MVP (résidence, religion...)
  const otherEvents = [];
  for (const tag of ['RESI', 'EVEN', 'EDUC', 'RELI', 'IMMI', 'EMIG']) {
    for (const node of findChildren(record, tag)) {
      otherEvents.push({
        eventType: { RESI: 'residence', EVEN: 'custom', EDUC: 'education', RELI: 'religion', IMMI: 'immigration', EMIG: 'emigration' }[tag],
        ...parseGedcomDate(findChildValue(node, 'DATE')),
        placeLocalId: registerPlace(placesMap, findChildValue(node, 'PLAC')),
        label: node.value || null,
      });
    }
  }

  return {
    localId: localIndiId(xref),
    gedcomXref: xref,
    firstNames,
    lastName,
    birthName,
    sex,
    birthDate: birthDateInfo.date,
    birthDatePrecision: birthDateInfo.datePrecision,
    birthPlaceLocalId,
    deathDate: deathDateInfo.date,
    deathDatePrecision: deathDateInfo.datePrecision,
    deathPlaceLocalId,
    isDeceased,
    occupation: occu,
    biography: noteNode ? noteNode.value : null,
    famc,
    fams,
    otherEvents,
  };
}

function mapFamilyRecord(record, placesMap) {
  const xref = record.xref;
  const husb = findChildValue(record, 'HUSB');
  const wife = findChildValue(record, 'WIFE');
  const children = findChildren(record, 'CHIL').map((n) => localIndiId(n.value.replace(/@/g, '')));

  const marrNode = findChild(record, 'MARR');
  const marriageDateInfo = parseGedcomDate(findChildValue(marrNode, 'DATE'));
  const marriagePlaceLocalId = registerPlace(placesMap, findChildValue(marrNode, 'PLAC'));

  const divNode = findChild(record, 'DIV');
  const divorceDateInfo = divNode ? parseGedcomDate(findChildValue(divNode, 'DATE')) : null;

  let status = 'unknown';
  if (divNode) status = 'divorced';
  else if (marrNode) status = 'ongoing';

  return {
    localId: localFamId(xref),
    gedcomXref: xref,
    husbandLocalId: husb ? localIndiId(husb.replace(/@/g, '')) : null,
    wifeLocalId: wife ? localIndiId(wife.replace(/@/g, '')) : null,
    childrenLocalIds: children,
    unionType: marrNode ? 'marriage' : 'unknown',
    status,
    startDate: marriageDateInfo.date,
    startDatePrecision: marriageDateInfo.datePrecision,
    placeLocalId: marriagePlaceLocalId,
    endDate: divorceDateInfo ? divorceDateInfo.date : null,
    endDatePrecision: divorceDateInfo ? divorceDateInfo.datePrecision : 'unknown',
  };
}

/**
 * Point d'entrée principal : { version, records } (sortie de parseGedcom)
 * -> modèle de staging prêt à être revu (dédoublonnage) puis inséré.
 */
export function mapGedcomToStagingModel({ version, records }) {
  const placesMap = new Map();
  const individuals = [];
  const families = [];
  const sources = [];

  for (const record of records) {
    if (record.tag === 'INDI') {
      individuals.push(mapIndividualRecord(record, placesMap));
    } else if (record.tag === 'FAM') {
      families.push(mapFamilyRecord(record, placesMap));
    } else if (record.tag === 'SOUR') {
      sources.push({
        localId: `source:${record.xref}`,
        gedcomXref: record.xref,
        title: findChildValue(record, 'TITL') || `Source ${record.xref}`,
        repository: findChildValue(record, 'REPO'),
        notes: findChildValue(record, 'NOTE'),
      });
    }
  }

  // Dérive les filiations (enfant -> chaque parent) à partir des familles
  const filiations = [];
  for (const fam of families) {
    for (const childLocalId of fam.childrenLocalIds) {
      const child = individuals.find((i) => i.localId === childLocalId);
      const famcEntry = child?.famc.find((f) => f.famLocalId === fam.localId);
      const filiationType = famcEntry?.filiationType || 'biological';

      if (fam.husbandLocalId) {
        filiations.push({
          childLocalId,
          parentLocalId: fam.husbandLocalId,
          unionLocalId: fam.localId,
          filiationType,
        });
      }
      if (fam.wifeLocalId) {
        filiations.push({
          childLocalId,
          parentLocalId: fam.wifeLocalId,
          unionLocalId: fam.localId,
          filiationType,
        });
      }
    }
  }

  return {
    gedcomVersion: version,
    individuals,
    families,
    filiations,
    sources,
    places: Array.from(placesMap.values()),
    stats: {
      individualCount: individuals.length,
      familyCount: families.length,
    },
  };
}
