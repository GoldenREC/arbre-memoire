/**
 * Écritures pour le module Animaux : CRUD de la fiche animal et de
 * ses rattachements aux membres de la famille (pet_links). Les photos
 * d'un animal passent par mediaMutations.js (media_links, subject_kind
 * 'pet') — pas dupliquées ici.
 */
import { supabase } from '../../lib/supabaseClient.js';

const PET_COLUMNS = 'id, tree_id, name, species, breed, sex, birth_date, death_date, anecdotes, created_at';

function mapPetRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    treeId: row.tree_id,
    name: row.name,
    species: row.species,
    breed: row.breed,
    sex: row.sex,
    birthDate: row.birth_date,
    deathDate: row.death_date,
    anecdotes: row.anecdotes,
  };
}

export async function listPets(treeId) {
  const { data, error } = await supabase.from('pets').select(PET_COLUMNS).eq('tree_id', treeId).order('name');
  if (error) throw error;
  return (data || []).map(mapPetRow);
}

export async function listPetsByIds(ids) {
  const uniqueIds = [...new Set((ids || []).filter(Boolean))];
  if (!uniqueIds.length) return [];
  const { data, error } = await supabase.from('pets').select('id, name, species').in('id', uniqueIds);
  if (error) throw error;
  return data || [];
}

export async function searchPets(treeId, query) {
  const { data, error } = await supabase
    .from('pets')
    .select('id, name, species')
    .eq('tree_id', treeId)
    .ilike('name', `%${query}%`)
    .limit(8);
  if (error) throw error;
  return data || [];
}

export async function createPet(treeId, patch) {
  const { data, error } = await supabase
    .from('pets')
    .insert({
      tree_id: treeId,
      name: patch.name,
      species: patch.species || null,
      breed: patch.breed || null,
      sex: patch.sex || 'U',
      birth_date: patch.birthDate || null,
      death_date: patch.deathDate || null,
      anecdotes: patch.anecdotes || null,
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

export async function updatePet(petId, patch) {
  const { error } = await supabase
    .from('pets')
    .update({
      name: patch.name,
      species: patch.species || null,
      breed: patch.breed || null,
      sex: patch.sex || 'U',
      birth_date: patch.birthDate || null,
      death_date: patch.deathDate || null,
      anecdotes: patch.anecdotes || null,
    })
    .eq('id', petId);
  if (error) throw error;
}

export async function deletePet(petId) {
  const { error } = await supabase.from('pets').delete().eq('id', petId);
  if (error) throw error;
}

/** Membres de la famille associés à un animal (subject_kind 'individual' | 'union'), noms résolus. */
export async function listPetLinks(petId) {
  const { data: links, error } = await supabase.from('pet_links').select('pet_id, subject_kind, subject_id, relationship').eq('pet_id', petId);
  if (error) throw error;
  if (!links?.length) return [];

  const individualIds = links.filter((l) => l.subject_kind === 'individual').map((l) => l.subject_id);
  let individualsById = new Map();
  if (individualIds.length) {
    const { data: inds, error: indErr } = await supabase.from('individuals').select('id, first_names, last_name').in('id', individualIds);
    if (indErr) throw indErr;
    individualsById = new Map(inds.map((i) => [i.id, i]));
  }

  return links.map((l) => ({
    subjectKind: l.subject_kind,
    subjectId: l.subject_id,
    relationship: l.relationship,
    individual: l.subject_kind === 'individual' ? individualsById.get(l.subject_id) || null : null,
  }));
}

export async function linkPetToIndividual(petId, individualId, relationship = null) {
  const { error } = await supabase
    .from('pet_links')
    .upsert({ pet_id: petId, subject_kind: 'individual', subject_id: individualId, relationship }, { onConflict: 'pet_id,subject_kind,subject_id' });
  if (error) throw error;
}

export async function unlinkPet(petId, subjectKind, subjectId) {
  const { error } = await supabase.from('pet_links').delete().match({ pet_id: petId, subject_kind: subjectKind, subject_id: subjectId });
  if (error) throw error;
}

/** Animaux rattachés à un individu donné — pour l'onglet "Photos & animaux" de sa fiche. */
export async function listPetsForIndividual(individualId) {
  const { data: links, error } = await supabase.from('pet_links').select('pet_id').eq('subject_kind', 'individual').eq('subject_id', individualId);
  if (error) throw error;
  const petIds = [...new Set((links || []).map((l) => l.pet_id))];
  if (!petIds.length) return [];
  const { data, error: pErr } = await supabase.from('pets').select(PET_COLUMNS).in('id', petIds);
  if (pErr) throw pErr;
  return (data || []).map(mapPetRow);
}
