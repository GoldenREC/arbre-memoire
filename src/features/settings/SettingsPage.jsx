import { useTranslation } from 'react-i18next';
import { NavLink, Navigate, useParams } from 'react-router-dom';
import { useAuthStore } from '../../store/useAuthStore.js';
import MembersPanel from './MembersPanel.jsx';
import PreferencesPanel from './PreferencesPanel.jsx';
import NotificationsPanel from './NotificationsPanel.jsx';
import PrivacyPanel from './PrivacyPanel.jsx';
import MaintenancePanel from './MaintenancePanel.jsx';

/**
 * Page Paramètres : onglets Membres / Préférences / Notifications /
 * Confidentialité / Maintenance. Les trois premiers onglets sont
 * ouverts à tout membre (préférences personnelles) ; Confidentialité
 * et Maintenance sont réservés aux administrateurs de l'arbre (voir
 * is_tree_admin() et les policies de supabase/settings.sql).
 */
export default function SettingsPage() {
  const { t } = useTranslation();
  const { tab } = useParams();
  const role = useAuthStore((s) => s.role);
  const isAdmin = role === 'admin';

  const TABS = [
    { key: 'membres', label: t('settings.tabs.members'), adminOnly: true, Component: MembersPanel },
    { key: 'preferences', label: t('settings.tabs.preferences'), adminOnly: false, Component: PreferencesPanel },
    { key: 'notifications', label: t('settings.tabs.notifications'), adminOnly: false, Component: NotificationsPanel },
    { key: 'confidentialite', label: t('settings.tabs.privacy'), adminOnly: true, Component: PrivacyPanel },
    { key: 'maintenance', label: t('settings.tabs.maintenance'), adminOnly: true, Component: MaintenancePanel },
  ].filter((tabDef) => !tabDef.adminOnly || isAdmin);

  const requestedTabIsValid = tab && TABS.some((tb) => tb.key === tab);
  const activeKey = requestedTabIsValid ? tab : TABS[0]?.key;
  // Redirige vers un onglet valide si l'URL ne précise rien, ou pointe
  // vers un onglet inexistant ou réservé aux administrateurs.
  if (!requestedTabIsValid && activeKey) {
    return <Navigate to={`/parametres/${activeKey}`} replace />;
  }

  const ActivePanel = TABS.find((tb) => tb.key === activeKey)?.Component;

  return (
    <div className="max-w-4xl">
      <h1 className="mb-5 text-lg font-semibold">{t('settings.title')}</h1>

      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-neutral-200 dark:border-neutral-800" data-shortcut-tabs>
        {TABS.map((tb) => (
          <NavLink
            key={tb.key}
            to={`/parametres/${tb.key}`}
            className={({ isActive }) =>
              `whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? 'border-accent-600 text-accent-700 dark:text-accent-300'
                  : 'border-transparent text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200'
              }`
            }
          >
            {tb.label}
          </NavLink>
        ))}
      </div>

      {ActivePanel && <ActivePanel />}
    </div>
  );
}
