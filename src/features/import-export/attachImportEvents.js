/**
 * Événements libres d'un import personnalisé (individuals[].events :
 * recensement, résidence, parcours militaire, baptême... — voir
 * docs/IMPORT_FORMAT.md), créés une fois les vrais UUID connus, comme les
 * preuves (attachImportProofs.js). Un événement déjà présent à
 * l'identique sur la fiche (même type, même date, même libellé) n'est pas
 * recréé : ré-importer le même acte ne duplique rien. Sa preuve éventuelle
 * est rattachée à cet événement précis.
 */
import { supabase } from '../../lib/supabaseClient.js';
import { attachDateProof } from '../individual/actsMutations.js';

export async function attachImportEvents(treeId, events, { individualIdMap, placeIdMap }, imagesByPath) {
  let created = 0;
  let attached = 0;
  const failed = [];

  for (const ev of events || []) {
    try {
      const subjectId = individualIdMap.get(ev.subjectLocalId);
      if (!subjectId) throw new Error('Personne correspondante introuvable après écriture.');

      const { data: existing, error: findErr } = await supabase
        .from('events')
        .select('id, event_date, label')
        .eq('subject_kind', 'individual')
        .eq('subject_id', subjectId)
        .eq('event_type', ev.eventType);
      if (findErr) throw findErr;
      const same = (existing || []).find((e) => (e.event_date || null) === (ev.date || null) && (e.label || null) === (ev.label || null));

      let eventId = same?.id;
      if (!eventId) {
        const { data: inserted, error: insErr } = await supabase
          .from('events')
          .insert({
            tree_id: treeId,
            subject_kind: 'individual',
            subject_id: subjectId,
            event_type: ev.eventType,
            label: ev.label || null,
            event_date: ev.date || null,
            date_precision: ev.datePrecision || 'unknown',
            place_id: ev.placeLocalId ? placeIdMap.get(ev.placeLocalId) ?? null : null,
            description: ev.description || null,
            proof_level: 'hypothesis',
          })
          .select('id')
          .single();
        if (insErr) throw insErr;
        eventId = inserted.id;
        created += 1;
      }

      if (ev.proof) {
        await attachDateProof(treeId, {
          eventId,
          subjectId,
          individualId: subjectId,
          eventType: ev.eventType,
          title: ev.title,
          proof: {
            type: ev.proof.type,
            url: ev.proof.url || '',
            file: ev.proof.imageFile ? imagesByPath.get(ev.proof.imageFile) || null : null,
            reference: ev.proof.reference || '',
            repository: ev.proof.repository || '',
            transcription: ev.proof.transcription || '',
          },
        });
        attached += 1;
      }
    } catch (err) {
      failed.push({ title: ev.title || ev.label || ev.eventType, error: err.message || String(err) });
    }
  }
  return { created, attached, failed };
}
