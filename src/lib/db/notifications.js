import { supabase } from '../supabaseClient.js';

/** Notifications in-app du membre connecté (voir supabase/settings.sql : table notifications + déclencheurs). */
export async function listNotifications(limit = 30) {
  const { data, error } = await supabase
    .from('notifications')
    .select('id, kind, title, body, individual_id, link, read_at, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

export async function markNotificationRead(id) {
  const { error } = await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

export async function markAllNotificationsRead() {
  const { error } = await supabase.from('notifications').update({ read_at: new Date().toISOString() }).is('read_at', null);
  if (error) throw error;
}

export async function deleteNotification(id) {
  const { error } = await supabase.from('notifications').delete().eq('id', id);
  if (error) throw error;
}
