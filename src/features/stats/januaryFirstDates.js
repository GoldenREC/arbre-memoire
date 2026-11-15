import { supabase } from '../../lib/supabaseClient.js';

/**
 * Les anciens imports rangeaient une année seule au 1er janvier avec la
 * précision "exacte" : tout l'arbre semblait né un 1er janvier. Ce
 * module repère ces dates et les repasse en "vers", ce qui les fait
 * s'afficher "vers 1829". Une date au 1er janvier appuyée par une
 * preuve (acte rattaché à l'événement) est considérée comme réelle et
 * n'est pas touchée.
 */
const isJanFirst = (date, precision) => precision === 'exact' && /^\d{4}-01-01/.test(date || '');

/** Pur, testé. Renvoie les identifiants à corriger, par colonne. */
export function planJanuaryFirstFix({ individuals = [], unions = [], events = [], citedEventIds = new Set() }) {
  const proven = new Set(); // "kind|subjectId|eventType"
  const eventIds = [];
  for (const e of events) {
    const cited = citedEventIds.has(e.id);
    if (cited) proven.add(`${e.subject_kind}|${e.subject_id}|${e.event_type}`);
    else if (isJanFirst(e.event_date, e.date_precision)) eventIds.push(e.id);
  }
  const pick = (rows, dateCol, precisionCol, kind, eventType) =>
    rows.filter((r) => isJanFirst(r[dateCol], r[precisionCol]) && !proven.has(`${kind}|${r.id}|${eventType}`)).map((r) => r.id);
  return {
    eventIds,
    birthIds: pick(individuals, 'birth_date', 'birth_date_precision', 'individual', 'birth'),
    deathIds: pick(individuals, 'death_date', 'death_date_precision', 'individual', 'death'),
    unionStartIds: pick(unions, 'start_date', 'start_date_precision', 'union', 'union_start'),
    unionEndIds: pick(unions, 'end_date', 'end_date_precision', 'union', 'divorce'),
  };
}

export function countPlan(plan) {
  return Object.values(plan).reduce((n, ids) => n + ids.length, 0);
}

async function loadPlan(treeId) {
  const [ind, uni, ev, cit] = await Promise.all([
    supabase.from('individuals').select('id, birth_date, birth_date_precision, death_date, death_date_precision').eq('tree_id', treeId),
    supabase.from('unions').select('id, start_date, start_date_precision, end_date, end_date_precision').eq('tree_id', treeId),
    supabase.from('events').select('id, subject_kind, subject_id, event_type, event_date, date_precision').eq('tree_id', treeId),
    supabase.from('citations').select('event_id').eq('tree_id', treeId).not('event_id', 'is', null),
  ]);
  const err = ind.error || uni.error || ev.error || cit.error;
  if (err) throw err;
  return planJanuaryFirstFix({
    individuals: ind.data || [], unions: uni.data || [], events: ev.data || [],
    citedEventIds: new Set((cit.data || []).map((c) => c.event_id)),
  });
}

export async function countJanuaryFirstDates(treeId) {
  return countPlan(await loadPlan(treeId));
}

async function setAbout(table, column, ids) {
  for (let i = 0; i < ids.length; i += 200) {
    const { error } = await supabase.from(table).update({ [column]: 'about' }).in('id', ids.slice(i, i + 200));
    if (error) throw error;
  }
}

/** Repasse en "vers" les dates au 1er janvier sans preuve. Renvoie le nombre de dates corrigées. */
export async function fixJanuaryFirstDates(treeId) {
  const plan = await loadPlan(treeId);
  await setAbout('events', 'date_precision', plan.eventIds);
  await setAbout('individuals', 'birth_date_precision', plan.birthIds);
  await setAbout('individuals', 'death_date_precision', plan.deathIds);
  await setAbout('unions', 'start_date_precision', plan.unionStartIds);
  await setAbout('unions', 'end_date_precision', plan.unionEndIds);
  return countPlan(plan);
}
