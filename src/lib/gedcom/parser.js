/**
 * Parseur GEDCOM (5.5.1 et 7.0) — tokenizer + arbre de noeuds.
 *
 * Le format GEDCOM est une suite de lignes :
 *   NIVEAU [@XREF@] TAG [VALEUR]
 * avec une hiérarchie donnée par le niveau (0 = racine d'un enregistrement).
 * Les tags CONT (nouvelle ligne) et CONC (concaténation) permettent de
 * découper une valeur longue sur plusieurs lignes ; on les fusionne dans
 * la valeur du noeud parent plutôt que de les garder comme enfants.
 *
 * Limite connue (v1) : les dates à double calendrier et les formats très
 * exotiques (GEDCOM non conformes exportés par de vieux logiciels) sont
 * traités au mieux ; voir parseGedcomDate().
 */

const LINE_RE = /^(\d+)\s+(?:(@[^@\s]+@)\s+)?(\S+)(?:\s(.*))?$/;

/**
 * Découpe le texte brut en lignes exploitables.
 */
function tokenize(rawText) {
  const normalized = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n');
  const tokens = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/^﻿/, '').trimEnd();
    if (!line.trim()) continue;

    const match = LINE_RE.exec(line.trim());
    if (!match) {
      // Ligne non conforme : on l'ignore mais on pourrait la logger
      // dans un rapport d'import pour diagnostic.
      continue;
    }
    const [, levelStr, xref, tag, value] = match;
    tokens.push({
      level: parseInt(levelStr, 10),
      xref: xref ? xref.replace(/@/g, '') : null,
      tag: tag.toUpperCase(),
      value: value ?? '',
      lineNumber: i + 1,
      children: [],
    });
  }
  return tokens;
}

/**
 * Reconstruit la hiérarchie à partir du niveau de chaque ligne.
 */
function buildTree(tokens) {
  const root = { level: -1, tag: 'ROOT', children: [] };
  const stack = [root];

  for (const node of tokens) {
    while (stack[stack.length - 1].level >= node.level) {
      stack.pop();
    }
    stack[stack.length - 1].children.push(node);
    stack.push(node);
  }
  return root;
}

/**
 * Fusionne récursivement les enfants CONT / CONC dans la valeur du parent.
 */
function mergeContinuations(node) {
  const keptChildren = [];
  for (const child of node.children) {
    if (child.tag === 'CONT') {
      node.value = `${node.value}\n${child.value}`;
    } else if (child.tag === 'CONC') {
      node.value = `${node.value}${child.value}`;
    } else {
      mergeContinuations(child);
      keptChildren.push(child);
    }
  }
  node.children = keptChildren;
  return node;
}

/**
 * Point d'entrée : texte GEDCOM brut -> arbre de noeuds exploitable.
 * Retourne { version, records } où records est la liste des enregistrements
 * de niveau 0 (INDI, FAM, SOUR, NOTE, HEAD, ...).
 */
export function parseGedcom(rawText) {
  const tokens = tokenize(rawText);
  const tree = buildTree(tokens);
  mergeContinuations(tree);

  const records = tree.children;
  const head = records.find((r) => r.tag === 'HEAD');
  const version = findChildValue(findChild(head, 'GEDC'), 'VERS') || 'inconnue';

  return { version, records };
}

// ---------------------------------------------------------------------
// Petits utilitaires de navigation dans l'arbre de noeuds
// ---------------------------------------------------------------------

export function findChild(node, tag) {
  if (!node) return null;
  return node.children.find((c) => c.tag === tag) || null;
}

export function findChildren(node, tag) {
  if (!node) return [];
  return node.children.filter((c) => c.tag === tag);
}

export function findChildValue(node, tag) {
  const child = findChild(node, tag);
  return child ? child.value : null;
}

// ---------------------------------------------------------------------
// Dates GEDCOM -> { date: 'YYYY-MM-DD'|null, precision, raw }
// ---------------------------------------------------------------------

const MONTHS = {
  JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
  JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12',
};

function parseSimpleDate(str) {
  // Formats possibles : "1900", "JAN 1900", "12 JAN 1900"
  const parts = str.trim().split(/\s+/);
  let day = null, month = null, year = null;

  if (parts.length === 3) {
    [day, month, year] = parts;
  } else if (parts.length === 2) {
    [month, year] = parts;
  } else if (parts.length === 1) {
    [year] = parts;
  } else {
    return null;
  }

  year = (year || '').replace(/[^\d]/g, '');
  if (!year) return null;

  const mm = month ? MONTHS[month.toUpperCase().slice(0, 3)] : null;
  const dd = day ? day.padStart(2, '0') : null;

  if (mm && dd) return `${year}-${mm}-${dd}`;
  if (mm) return `${year}-${mm}-01`; // jour inconnu : approximation au 1er du mois
  return `${year}-01-01`; // mois/jour inconnus : approximation au 1er janvier
}

/**
 * Convertit une valeur de champ DATE GEDCOM en objet structuré.
 * Gère : dates exactes, ABT/EST (about), BEF (before), AFT (after),
 * BET ... AND ... (between). Le calendrier julien/hébreu/etc. n'est pas
 * converti (limite connue).
 */
export function parseGedcomDate(raw) {
  if (!raw) return { date: null, datePrecision: 'unknown', raw };
  const trimmed = raw.trim();

  const between = /^BET\s+(.+)\s+AND\s+(.+)$/i.exec(trimmed);
  if (between) {
    return {
      date: parseSimpleDate(between[1]),
      dateEnd: parseSimpleDate(between[2]),
      datePrecision: 'between',
      raw,
    };
  }
  const about = /^(ABT|EST|CAL)\s+(.+)$/i.exec(trimmed);
  if (about) {
    return { date: parseSimpleDate(about[2]), datePrecision: 'about', raw };
  }
  const before = /^BEF\s+(.+)$/i.exec(trimmed);
  if (before) {
    return { date: parseSimpleDate(before[1]), datePrecision: 'before', raw };
  }
  const after = /^AFT\s+(.+)$/i.exec(trimmed);
  if (after) {
    return { date: parseSimpleDate(after[1]), datePrecision: 'after', raw };
  }

  const parsed = parseSimpleDate(trimmed);
  return {
    date: parsed,
    datePrecision: parsed ? 'exact' : 'unknown',
    raw,
  };
}
