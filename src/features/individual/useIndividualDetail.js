import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabaseClient.js';

const INDIVIDUAL_COLUMNS =
  'id, tree_id, first_names, last_name, birth_name, nickname, sex, birth_date, birth_date_precision, birth_place_id, death_date, death_date_precision, death_place_id, is_deceased, occupation, biography';

function mapIndividualRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    treeId: row.tree_id,
    firstNames: row.first_names,
    lastName: row.last_name,
    birthName: row.birth_name,
    nickname: row.nickname,
    sex: row.sex,
    birthDate: row.birth_date,
    birthDatePrecision: row.birth_date_precision,
    birthPlaceId: row.birth_place_id,
    deathDate: row.death_date,
    deathDatePrecision: row.death_date_precision,
    deathPlaceId: row.death_place_id,
    isDeceased: row.is_deceased,
    occupation: row.occupation,
    biography: row.biography,
  };
}

async function fetchIndividualsByIds(ids) {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  if (uniqueIds.length === 0) return new Map();
  const { data, error } = await supabase.from('individuals').select(INDIVIDUAL_COLUMNS).in('id', uniqueIds);
  if (error) throw error;
  return new Map((data || []).map((row) => [row.id, mapIndividualRow(row)]));
}

/**
 * Charge tout ce qu'une fiche individu affiche (état civil, parents,
 * conjoints/unions, enfants groupés par union, événements personnels +
 * événements des unions dont il est partenaire, lieux, citations) et se
 * tient à jour en temps réel via Supabase Realtime : si un autre membre
 * de la famille modifie la même fiche, elle se recharge automatiquement.
 */
export function useIndividualDetail(individualId) {
  const [state, setState] = useState({ loading: true, error: null, data: null });
  const reloadTimer = useRef(null);

  const load = useCallback(async () => {
    if (!individualId) return;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const { data: individualRow, error: indErr } = await supabase
        .from('individuals')
        .select(INDIVIDUAL_COLUMNS)
        .eq('id', individualId)
        .single();
      if (indErr) throw indErr;
      const individual = mapIndividualRow(individualRow);

      const [{ data: parentLinks, error: pErr }, { data: childLinks, error: cErr }, { data: myPartnerRows, error: mpErr }] =
        await Promise.all([
          supabase.from('filiations').select('id, parent_id, union_id, filiation_type').eq('child_id', individualId),
          supabase.from('filiations').select('id, child_id, union_id, filiation_type').eq('parent_id', individualId),
          supabase.from('union_partners').select('union_id').eq('individual_id', individualId),
        ]);
      if (pErr) throw pErr;
      if (cErr) throw cErr;
      if (mpErr) throw mpErr;

      const myUnionIds = [...new Set((myPartnerRows || []).map((r) => r.union_id))];

      const [{ data: unionRows, error: uErr }, { data: allPartnerRows, error: apErr }] = await Promise.all([
        myUnionIds.length
          ? supabase.from('unions').select('id, union_type, status, start_date, start_date_precision, end_date, end_date_precision, place_id').in('id', myUnionIds)
          : Promise.resolve({ data: [], error: null }),
        myUnionIds.length
          ? supabase.from('union_partners').select('union_id, individual_id').in('union_id', myUnionIds)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (uErr) throw uErr;
      if (apErr) throw apErr;

      const spouseIdByUnion = new Map();
      for (const row of allPartnerRows || []) {
        if (row.individual_id !== individualId) spouseIdByUnion.set(row.union_id, row.individual_id);
      }

      const parentIds = (parentLinks || []).map((l) => l.parent_id);
      const childIds = (childLinks || []).map((l) => l.child_id);
      const spouseIds = [...spouseIdByUnion.values()];

      const relatedIndividuals = await fetchIndividualsByIds([...parentIds, ...childIds, ...spouseIds]);

      const parents = (parentLinks || []).map((l) => ({
        filiationId: l.id,
        filiationType: l.filiation_type,
        individual: relatedIndividuals.get(l.parent_id) || null,
      }));

      const unions = (unionRows || []).map((u) => ({
        id: u.id,
        unionType: u.union_type,
        status: u.status,
        startDate: u.start_date,
        startDatePrecision: u.start_date_precision,
        endDate: u.end_date,
        endDatePrecision: u.end_date_precision,
        placeId: u.place_id,
        partner: relatedIndividuals.get(spouseIdByUnion.get(u.id)) || null,
      }));

      // Enfants groupés par union (ou "sans union connue")
      const childGroups = new Map();
      for (const link of childLinks || []) {
        const key = link.union_id || 'none';
        if (!childGroups.has(key)) {
          childGroups.set(key, { union: unions.find((u) => u.id === link.union_id) || null, children: [] });
        }
        childGroups.get(key).children.push({
          filiationId: link.id,
          filiationType: link.filiation_type,
          individual: relatedIndividuals.get(link.child_id) || null,
        });
      }

      // Événements personnels + événements des unions (mariage/divorce)
      const unionIds = unions.map((u) => u.id);
      const { data: personalEventRows, error: evErr } = await supabase
        .from('events')
        .select('id, event_type, label, event_date, date_precision, place_id, description, proof_level')
        .eq('subject_kind', 'individual')
        .eq('subject_id', individualId);
      if (evErr) throw evErr;

      const { data: unionEventRows, error: uevErr } = unionIds.length
        ? await supabase
            .from('events')
            .select('id, event_type, label, event_date, date_precision, place_id, description, proof_level, subject_id')
            .eq('subject_kind', 'union')
            .in('subject_id', unionIds)
        : { data: [], error: null };
      if (uevErr) throw uevErr;

      const events = [
        ...(personalEventRows || []).map((e) => ({ ...mapEventRow(e), origin: 'individual' })),
        ...(unionEventRows || []).map((e) => ({ ...mapEventRow(e), origin: 'union', unionId: e.subject_id })),
      ];

      // Lieux référencés (individu + événements)
      const placeIds = [
        individual.birthPlaceId,
        individual.deathPlaceId,
        ...unions.map((u) => u.placeId),
        ...events.map((e) => e.placeId),
      ].filter(Boolean);
      const places = await fetchPlacesByIds(placeIds);

      // Citations (sources liées) : directement sur l'individu, ou sur un de
      // ses événements — y compris les événements des unions (mariage), sans
      // quoi une citation attachée à l'acte de mariage n'apparaîtrait jamais.
      const eventIds = events.map((e) => e.id);
      const citations = await fetchCitations(individualId, eventIds, events);

      setState({
        loading: false,
        error: null,
        data: { individual, parents, unions, childGroups: [...childGroups.values()], events, places, citations },
      });
    } catch (err) {
      console.error(err);
      setState({ loading: false, error: err.message || 'Impossible de charger cette fiche.', data: null });
    }
  }, [individualId]);

  const debouncedReload = useCallback(() => {
    if (reloadTimer.current) clearTimeout(reloadTimer.current);
    reloadTimer.current = setTimeout(load, 150);
  }, [load]);

  useEffect(() => {
    load();
  }, [load]);

  // Temps réel : toute modification touchant cette fiche (par un autre
  // membre de la famille, ou dans un autre onglet) déclenche un rechargement.
  useEffect(() => {
    if (!individualId) return undefined;
    const channel = supabase
      .channel(`individual-detail-${individualId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'individuals', filter: `id=eq.${individualId}` }, debouncedReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events', filter: `subject_id=eq.${individualId}` }, debouncedReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'filiations', filter: `child_id=eq.${individualId}` }, debouncedReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'filiations', filter: `parent_id=eq.${individualId}` }, debouncedReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'union_partners', filter: `individual_id=eq.${individualId}` }, debouncedReload)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      if (reloadTimer.current) clearTimeout(reloadTimer.current);
    };
  }, [individualId, debouncedReload]);

  return { ...state, reload: load };
}

function mapEventRow(e) {
  return {
    id: e.id,
    eventType: e.event_type,
    label: e.label,
    date: e.event_date,
    datePrecision: e.date_precision,
    placeId: e.place_id,
    description: e.description,
    proofLevel: e.proof_level,
  };
}

async function fetchPlacesByIds(ids) {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  if (uniqueIds.length === 0) return new Map();
  const { data, error } = await supabase.from('places').select('id, raw_label').in('id', uniqueIds);
  if (error) throw error;
  return new Map((data || []).map((p) => [p.id, p.raw_label]));
}

async function fetchCitations(individualId, eventIds, events = []) {
  const orFilter = eventIds.length
    ? `individual_id.eq.${individualId},event_id.in.(${eventIds.join(',')})`
    : `individual_id.eq.${individualId}`;
  const { data, error } = await supabase
    .from('citations')
    .select('id, source_id, event_id, transcription, page_ref')
    .or(orFilter);
  if (error) throw error;

  const sourceIds = [...new Set((data || []).map((c) => c.source_id))];
  let sourcesById = new Map();
  let mediaSourceIds = new Set();
  if (sourceIds.length) {
    const [{ data: sources, error: sErr }, { data: mediaRows, error: mErr }] = await Promise.all([
      supabase.from('sources').select('id, title, repository').in('id', sourceIds),
      supabase.from('media').select('source_id').in('source_id', sourceIds),
    ]);
    if (sErr) throw sErr;
    if (mErr) throw mErr;
    sourcesById = new Map(sources.map((s) => [s.id, s]));
    mediaSourceIds = new Set((mediaRows || []).map((m) => m.source_id));
  }
  const eventsById = new Map(events.map((e) => [e.id, e]));

  return (data || []).map((c) => ({
    id: c.id,
    sourceId: c.source_id,
    eventId: c.event_id,
    transcription: c.transcription,
    pageRef: c.page_ref,
    source: sourcesById.get(c.source_id) || null,
    proofLevel: c.event_id ? eventsById.get(c.event_id)?.proofLevel || null : null,
    // Un acte est "effectivement joint" quand la source citée porte au
    // moins un média (scan) — une simple référence bibliographique sans
    // image ne suffit pas à valider une pastille N/M/D.
    hasMedia: mediaSourceIds.has(c.source_id),
  }));
}
