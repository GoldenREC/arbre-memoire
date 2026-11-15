import { supabase } from '../../lib/supabaseClient.js';

/** Passe « décédé » les fiches données (même effet que le trigger SQL deceased_130). */
export async function fixDeceased130(individualIds) {
  for (let i = 0; i < individualIds.length; i += 200) {
    const { error } = await supabase
      .from('individuals')
      .update({ is_deceased: true })
      .in('id', individualIds.slice(i, i + 200));
    if (error) throw error;
  }
  return individualIds.length;
}
