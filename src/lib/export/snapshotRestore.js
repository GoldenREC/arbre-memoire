import { supabase } from '../supabaseClient.js';

/**
 * Restauration d'une sauvegarde JSON complète (voir jsonExporter.js /
 * fetchTreeSnapshot.js pour le format produit). Remplace tout le
 * contenu généalogique de l'arbre courant par celui du fichier — les
 * adhésions (tree_members), invitations, préférences, notifications et
 * l'historique des modifications ne sont PAS touchés : seules les
 * tables "métier" listées ci-dessous sont effacées puis recréées.
 *
 * Portée connue : un fichier de sauvegarde "sans médias" (.json) ne
 * contient que les métadonnées des fichiers (storage_path) ; les
 * binaires eux-mêmes ne sont pas restaurés automatiquement — seule une
 * sauvegarde "avec médias" (.zip, voir exportJsonBackup) permet de les
 * réimporter dans le Storage. Les horodatages created_at/updated_at
 * d'origine ne sont pas conservés (nouvelles valeurs à la restauration).
 */

const REQUIRED_ARRAYS = ['individuals', 'unions', 'filiations', 'places', 'events', 'sources', 'citations', 'media', 'pets'];

/** Vérifie qu'un fichier importé a bien la forme d'une sauvegarde Arbre & Mémoire, avant toute écriture. */
export function validateSnapshotShape(backup) {
  const errors = [];
  if (!backup || typeof backup !== 'object') {
    return ['Fichier illisible ou vide.'];
  }
  if (backup.format !== 'arbre-et-memoire-backup') {
    errors.push("Ce fichier n'est pas reconnu comme une sauvegarde Arbre & Mémoire.");
  }
  for (const key of REQUIRED_ARRAYS) {
    if (!Array.isArray(backup[key])) errors.push(`Section "${key}" manquante ou invalide dans le fichier.`);
  }
  return errors;
}

/** Résumé chiffré d'une sauvegarde, pour l'aperçu affiché avant confirmation de restauration. */
export function summarizeSnapshot(backup) {
  return {
    exportedAt: backup.exportedAt || null,
    version: backup.version ?? 1,
    individuals: backup.individuals?.length || 0,
    unions: backup.unions?.length || 0,
    filiations: backup.filiations?.length || 0,
    places: backup.places?.length || 0,
    events: backup.events?.length || 0,
    sources: backup.sources?.length || 0,
    citations: backup.citations?.length || 0,
    media: backup.media?.length || 0,
    pets: backup.pets?.length || 0,
  };
}

/** Ordre d'effacement : des tables dépendantes vers les tables référencées (voir schema.sql pour les contraintes FK). */
const DELETE_ORDER = ['citations', 'media', 'filiations', 'unions', 'events', 'pets', 'sources', 'individuals', 'places'];

async function deleteAllForTree(table, treeId) {
  const { error } = await supabase.from(table).delete().eq('tree_id', treeId);
  if (error) throw new Error(`Effacement de "${table}" : ${error.message}`);
}

async function insertRows(table, rows) {
  if (!rows.length) return;
  // Par lots, pour éviter une requête démesurée sur un très gros arbre.
  const BATCH = 500;
  for (let i = 0; i < rows.length; i += BATCH) {
    const { error } = await supabase.from(table).insert(rows.slice(i, i + BATCH));
    if (error) throw new Error(`Insertion dans "${table}" : ${error.message}`);
  }
}

function toPlaceRow(p, treeId) {
  return {
    id: p.id, tree_id: treeId, raw_label: p.raw_label, normalized: p.normalized ?? null,
    latitude: p.latitude ?? null, longitude: p.longitude ?? null, country: p.country ?? null, region: p.region ?? null,
  };
}

function toIndividualRow(i, treeId) {
  return {
    id: i.id, tree_id: treeId, first_names: i.firstNames ?? null, last_name: i.lastName ?? null,
    birth_name: i.birthName ?? null, nickname: i.nickname ?? null, sex: i.sex || 'U',
    birth_date: i.birthDate ?? null, birth_date_precision: i.birthDatePrecision ?? 'unknown', birth_place_id: i.birthPlaceId ?? null,
    death_date: i.deathDate ?? null, death_date_precision: i.deathDatePrecision ?? 'unknown', death_place_id: i.deathPlaceId ?? null,
    is_deceased: !!i.isDeceased, occupation: i.occupation ?? null, biography: i.biography ?? null, gedcom_xref: i.gedcomXref ?? null,
  };
}

function toSourceRow(s, treeId) {
  return { id: s.id, tree_id: treeId, title: s.title, repository: s.repository ?? null, call_number: s.callNumber ?? null, url: s.url ?? null, notes: s.notes ?? null };
}

function toEventRow(e, treeId) {
  return {
    id: e.id, tree_id: treeId, subject_kind: e.subjectKind, subject_id: e.subjectId, event_type: e.eventType,
    label: e.label ?? null, event_date: e.eventDate ?? null, date_precision: e.datePrecision ?? 'unknown',
    place_id: e.placeId ?? null, description: e.description ?? null, proof_level: e.proofLevel ?? 'hypothesis',
  };
}

function toUnionRow(u, treeId) {
  return {
    id: u.id, tree_id: treeId, union_type: u.unionType || 'unknown', status: u.status || 'unknown',
    start_date: u.startDate ?? null, start_date_precision: u.startDatePrecision ?? 'unknown',
    end_date: u.endDate ?? null, end_date_precision: u.endDatePrecision ?? 'unknown',
    place_id: u.placeId ?? null, notes: u.notes ?? null, gedcom_xref: u.gedcomXref ?? null,
  };
}

function toFiliationRow(f, treeId) {
  return { id: f.id, tree_id: treeId, child_id: f.childId, parent_id: f.parentId, union_id: f.unionId ?? null, filiation_type: f.filiationType || 'biological', notes: f.notes ?? null };
}

function toMediaRow(m, treeId) {
  return {
    id: m.id, tree_id: treeId, media_type: m.mediaType || 'photo', storage_path: m.storagePath,
    title: m.title ?? null, description: m.description ?? null, taken_at: m.takenAt ?? null, source_id: m.sourceId ?? null,
  };
}

function toCitationRow(c, treeId) {
  return { id: c.id, tree_id: treeId, source_id: c.sourceId, event_id: c.eventId ?? null, individual_id: c.individualId ?? null, transcription: c.transcription ?? null, page_ref: c.pageRef ?? null };
}

function toPetRow(p, treeId) {
  return { id: p.id, tree_id: treeId, name: p.name, species: p.species ?? null, breed: p.breed ?? null, sex: p.sex || 'U', birth_date: p.birthDate ?? null, death_date: p.deathDate ?? null, anecdotes: p.anecdotes ?? null };
}

/**
 * Restaure une sauvegarde dans l'arbre `treeId` : efface tout le
 * contenu généalogique actuel de cet arbre puis réinsère celui du
 * fichier, en conservant les identifiants d'origine (les références
 * croisées du fichier restent donc valides). Opération destructive et
 * non réversible pour l'arbre visé — un appelant doit avoir obtenu une
 * confirmation explicite de l'utilisateur avant d'appeler cette
 * fonction (voir SettingsMaintenance.jsx).
 */
export async function restoreTreeSnapshot(treeId, backup, { onProgress } = {}) {
  const errors = validateSnapshotShape(backup);
  if (errors.length) throw new Error(errors.join(' '));

  const report = (step) => onProgress && onProgress(step);

  report('Effacement du contenu actuel…');
  for (const table of DELETE_ORDER) {
    await deleteAllForTree(table, treeId);
  }

  report('Réécriture des lieux…');
  await insertRows('places', (backup.places || []).map((p) => toPlaceRow(p, treeId)));

  report('Réécriture des individus…');
  await insertRows('individuals', (backup.individuals || []).map((i) => toIndividualRow(i, treeId)));

  report('Réécriture des sources…');
  await insertRows('sources', (backup.sources || []).map((s) => toSourceRow(s, treeId)));

  report('Réécriture des événements…');
  await insertRows('events', (backup.events || []).map((e) => toEventRow(e, treeId)));

  report('Réécriture des unions…');
  await insertRows('unions', (backup.unions || []).map((u) => toUnionRow(u, treeId)));

  report('Réécriture des partenaires d\'union…');
  const unionPartnerRows = (backup.unions || []).flatMap((u) =>
    (u.partners || []).map((p) => ({ union_id: u.id, individual_id: p.individualId, role_label: p.roleLabel ?? null }))
  );
  await insertRows('union_partners', unionPartnerRows);

  report('Réécriture des filiations…');
  await insertRows('filiations', (backup.filiations || []).map((f) => toFiliationRow(f, treeId)));

  report('Réécriture des médias…');
  await insertRows('media', (backup.media || []).map((m) => toMediaRow(m, treeId)));

  report('Réécriture des rattachements de médias…');
  await insertRows('media_links', (backup.mediaLinks || []).map((l) => ({ media_id: l.mediaId, subject_kind: l.subjectKind, subject_id: l.subjectId })));
  await insertRows('media_face_tags', (backup.mediaFaceTags || []).map((t) => ({ id: t.id, media_id: t.mediaId, individual_id: t.individualId, x: t.x, y: t.y, width: t.width, height: t.height })));

  report('Réécriture des animaux…');
  await insertRows('pets', (backup.pets || []).map((p) => toPetRow(p, treeId)));
  const petLinkRows = (backup.petLinks || []).map((l) => ({ pet_id: l.petId, subject_kind: l.subjectKind, subject_id: l.subjectId, relationship: l.relationship ?? null }));
  await insertRows('pet_links', petLinkRows);

  report('Réécriture des citations…');
  await insertRows('citations', (backup.citations || []).map((c) => toCitationRow(c, treeId)));

  if (backup.privacyThresholdYears) {
    report('Application du seuil de confidentialité…');
    await supabase.from('trees').update({ privacy_threshold_years: backup.privacyThresholdYears }).eq('id', treeId);
  }

  report('Terminé.');
  return summarizeSnapshot(backup);
}
