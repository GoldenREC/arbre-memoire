import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient.js';
import { listNotifications, markNotificationRead, markAllNotificationsRead } from '../lib/db/notifications.js';

/**
 * Cloche de notifications (Topbar) : charge les notifications in-app du
 * membre connecté et se met à jour en direct (voir supabase/settings.sql
 * — table notifications ajoutée à la publication realtime) dès qu'un
 * déclencheur (nouvel acte, nouveau portrait, anniversaire) en insère une.
 */
export function useNotifications(userId) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!userId) { setNotifications([]); setLoading(false); return; }
    try {
      setNotifications(await listNotifications());
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { reload(); }, [reload]);

  useEffect(() => {
    if (!userId) return undefined;
    const channel = supabase
      .channel(`notifications-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, reload)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [userId, reload]);

  const unreadCount = notifications.filter((n) => !n.read_at).length;

  async function markRead(id) {
    await markNotificationRead(id);
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n)));
  }

  async function markAllRead() {
    await markAllNotificationsRead();
    setNotifications((prev) => prev.map((n) => ({ ...n, read_at: n.read_at || new Date().toISOString() })));
  }

  return { notifications, loading, unreadCount, markRead, markAllRead, reload };
}
