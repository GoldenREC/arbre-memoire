import { fetchTreeSnapshot, placeLabel } from './fetchTreeSnapshot.js';
import { downloadText, todayStamp } from './downloadHelpers.js';
import { isPrivacyProtected } from '../utils/privacy.js';

const GEDCOM_MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

const FILIATION_TO_PEDI = {
  biological: null, // "birth" est la valeur par défaut, pas besoin de PEDI explicite
  adoption_plenary: 'adopted',
  adoption_simple: 'adopted',
  foster: 'foster',
  late_recognition: 'birth',
  unknown: 'sealing',
};

function formatSimpleDate(iso) {
  if (!iso) return null;
  const [year, month, day] = iso.split('-');
  const mm = GEDCOM_MONTHS[parseInt(month, 10) - 1];
  return mm ? `${parseInt(day, 10)} ${mm} ${year}` : year;
}

/** Inverse de parseGedcomDate() (voir lib/gedcom/parser.js) : modèle interne -> valeur GEDCOM DATE. */
export function formatGedcomDate({ date, datePrecision, dateEnd } = {}) {
  if (!date) return null;
  const formatted = formatSimpleDate(date);
  switch (datePrecision) {
    case 'about':
      return `ABT ${formatted}`;
    case 'before':
      return `BEF ${formatted}`;
    case 'after':
      return `AFT ${formatted}`;
    case 'between':
      return dateEnd ? `BET ${formatted} AND ${formatSimpleDate(dateEnd)}` : formatted;
    default:
      return formatted;
  }
}

/**
 * Détermine l'ensemble des individus à exporter selon le périmètre
 * choisi : tout l'arbre, ou seulement la branche (ascendants /
 * descendants) d'un individu racine.
 */
function resolveScope(snapshot, scope) {
  if (!scope || scope.mode === 'all' || !scope.rootId) {
    return new Set(snapshot.individuals.map((i) => i.id));
  }

  const parentsOf = new Map(); // childId -> [parentId]
  const childrenOf = new Map(); // parentId -> [childId]
  for (const f of snapshot.filiations) {
    if (!parentsOf.has(f.childId)) parentsOf.set(f.childId, []);
    parentsOf.get(f.childId).push(f.parentId);
    if (!childrenOf.has(f.parentId)) childrenOf.set(f.parentId, []);
    childrenOf.get(f.parentId).push(f.childId);
  }

  const included = new Set([scope.rootId]);
  const queue = [scope.rootId];
  const next = scope.mode === 'ascendants' ? parentsOf : childrenOf;
  while (queue.length) {
    const id = queue.shift();
    for (const relId of next.get(id) || []) {
      if (!included.has(relId)) {
        included.add(relId);
        queue.push(relId);
      }
    }
  }
  return included;
}

/**
 * Construit le texte GEDCOM 5.5.1 à partir d'un instantané d'arbre.
 * Fonction pure (testable) — le téléchargement se fait séparément dans
 * exportGedcom().
 */
export function buildGedcomText(snapshot, { maskLiving = true, scope = { mode: 'all' }, privacyThresholdYears } = {}) {
  const thresholdYears = privacyThresholdYears ?? snapshot.privacyThresholdYears ?? 100;
  const includedIds = resolveScope(snapshot, scope);
  const individuals = snapshot.individuals.filter((i) => includedIds.has(i.id));
  const unions = snapshot.unions.filter(
    (u) => u.partners.some((p) => includedIds.has(p.individualId)) || snapshot.filiations.some((f) => f.unionId === u.id && includedIds.has(f.childId))
  );

  const indiXref = new Map(individuals.map((ind, idx) => [ind.id, `I${idx + 1}`]));
  const famXref = new Map(unions.map((u, idx) => [u.id, `F${idx + 1}`]));

  // child_id -> [{parentId, unionId, filiationType}]
  const parentsByChild = new Map();
  for (const f of snapshot.filiations) {
    if (!includedIds.has(f.childId)) continue;
    if (!parentsByChild.has(f.childId)) parentsByChild.set(f.childId, []);
    parentsByChild.get(f.childId).push(f);
  }
  // union_id -> [childId]
  const childrenByUnion = new Map();
  for (const f of snapshot.filiations) {
    if (!includedIds.has(f.childId) || !f.unionId) continue;
    if (!childrenByUnion.has(f.unionId)) childrenByUnion.set(f.unionId, []);
    childrenByUnion.get(f.unionId).push(f.childId);
  }

  const lines = [];
  const add = (level, tag, value) => lines.push(value !== null && value !== undefined && value !== '' ? `${level} ${tag} ${value}` : `${level} ${tag}`);

  lines.push('0 HEAD');
  add(1, 'SOUR', 'ArbreEtMemoire');
  add(1, 'GEDC');
  add(2, 'VERS', '5.5.1');
  add(2, 'FORM', 'LINEAGE-LINKED');
  add(1, 'CHAR', 'UTF-8');

  for (const ind of individuals) {
    const masked = maskLiving && isPrivacyProtected(ind, thresholdYears);
    lines.push(`0 @${indiXref.get(ind.id)}@ INDI`);

    if (masked) {
      add(1, 'NAME', 'Vivant /Masqué/');
      add(1, 'SEX', ind.sex || 'U');
    } else {
      const first = ind.firstNames || '';
      const last = ind.lastName || '';
      add(1, 'NAME', `${first} /${last}/`);
      if (ind.birthName) add(2, 'SURN', ind.birthName);
      add(1, 'SEX', ind.sex || 'U');

      lines.push('1 BIRT');
      const birthDateValue = formatGedcomDate({ date: ind.birthDate, datePrecision: ind.birthDatePrecision });
      if (birthDateValue) add(2, 'DATE', birthDateValue);
      const birthPlace = placeLabel(snapshot, ind.birthPlaceId);
      if (birthPlace) add(2, 'PLAC', birthPlace);

      if (ind.isDeceased || ind.deathDate) {
        lines.push('1 DEAT');
        lines.push('2 Y');
        const deathDateValue = formatGedcomDate({ date: ind.deathDate, datePrecision: ind.deathDatePrecision });
        if (deathDateValue) add(2, 'DATE', deathDateValue);
        const deathPlace = placeLabel(snapshot, ind.deathPlaceId);
        if (deathPlace) add(2, 'PLAC', deathPlace);
      }

      if (ind.occupation) add(1, 'OCCU', ind.occupation);
      if (ind.biography) add(1, 'NOTE', ind.biography);
    }

    for (const f of parentsByChild.get(ind.id) || []) {
      if (!f.unionId || !famXref.has(f.unionId)) continue;
      lines.push(`1 FAMC @${famXref.get(f.unionId)}@`);
      const pedi = FILIATION_TO_PEDI[f.filiationType];
      if (pedi) add(2, 'PEDI', pedi);
    }
    for (const u of unions) {
      if (u.partners.some((p) => p.individualId === ind.id)) {
        lines.push(`1 FAMS @${famXref.get(u.id)}@`);
      }
    }
  }

  const individualsById = new Map(snapshot.individuals.map((i) => [i.id, i]));
  for (const u of unions) {
    lines.push(`0 @${famXref.get(u.id)}@ FAM`);
    // Le format GEDCOM standard ne distingue HUSB/WIFE que pour deux
    // partenaires ; au-delà (rare), seuls les deux premiers sont
    // positionnés, les autres restent reliés via leurs propres FAMS.
    const present = u.partners.filter((p) => includedIds.has(p.individualId));
    const husband = present.find((p) => individualsById.get(p.individualId)?.sex === 'M') || present[0] || null;
    const wife = present.find((p) => p !== husband && individualsById.get(p.individualId)?.sex === 'F') || present.find((p) => p !== husband) || null;
    if (husband) lines.push(`1 HUSB @${indiXref.get(husband.individualId)}@`);
    if (wife) lines.push(`1 WIFE @${indiXref.get(wife.individualId)}@`);

    if (u.unionType === 'marriage' || u.startDate) {
      lines.push('1 MARR');
      const marrDateValue = formatGedcomDate({ date: u.startDate, datePrecision: u.startDatePrecision });
      if (marrDateValue) add(2, 'DATE', marrDateValue);
      const marrPlace = placeLabel(snapshot, u.placeId);
      if (marrPlace) add(2, 'PLAC', marrPlace);
    }
    if (u.status === 'divorced') {
      lines.push('1 DIV');
      const divDateValue = formatGedcomDate({ date: u.endDate, datePrecision: u.endDatePrecision });
      if (divDateValue) add(2, 'DATE', divDateValue);
    }

    for (const childId of childrenByUnion.get(u.id) || []) {
      if (indiXref.has(childId)) lines.push(`1 CHIL @${indiXref.get(childId)}@`);
    }
  }

  for (const s of snapshot.sources) {
    lines.push(`0 @S${s.id.slice(0, 8)}@ SOUR`);
    add(1, 'TITL', s.title);
    if (s.repository) add(1, 'REPO', s.repository);
    if (s.notes) add(1, 'NOTE', s.notes);
  }

  lines.push('0 TRLR');
  return lines.join('\n');
}

export async function exportGedcom(treeId, options = {}) {
  const snapshot = await fetchTreeSnapshot(treeId);
  const text = buildGedcomText(snapshot, options);
  downloadText(text, `arbre-memoire-${todayStamp()}.ged`, 'text/plain;charset=utf-8');
  return { individualCount: resolveScope(snapshot, options.scope).size };
}
