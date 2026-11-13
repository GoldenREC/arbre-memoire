import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../store/useAuthStore.js';
import { updateMemberPreferences } from '../../lib/db/settingsMutations.js';
import { listFollowedIndividuals, unfollowIndividual } from '../../lib/db/followedIndividuals.js';

const EVENT_KEYS = [
  { key: 'notifyNewAct', label: 'newAct' },
  { key: 'notifyNewPhoto', label: 'newPhoto' },
  { key: 'notifyBirthdays', label: 'birthdays' },
];

/** Onglet Paramètres → Notifications (canaux x évènements, et gestion des branches suivies). Ouvert à tout membre. */
export default function NotificationsPanel() {
  const { t } = useTranslation();
  const { currentTreeId, user, preferences, setPreferences } = useAuthStore();
  const prefs = preferences || {};

  const [followed, setFollowed] = useState([]);
  const [loadingFollowed, setLoadingFollowed] = useState(true);

  useEffect(() => {
    if (!currentTreeId) return;
    listFollowedIndividuals(currentTreeId).then(setFollowed).finally(() => setLoadingFollowed(false));
  }, [currentTreeId]);

  async function save(patch) {
    await updateMemberPreferences(currentTreeId, user.id, patch);
    setPreferences(patch);
  }

  async function handleUnfollow(individualId) {
    await unfollowIndividual(currentTreeId, user.id, individualId);
    setFollowed((prev) => prev.filter((f) => f.individualId !== individualId));
  }

  return (
    <div className="max-w-xl space-y-8">
      <section className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
        <h2 className="mb-1 text-sm font-semibold">{t('settings.notifications.title')}</h2>
        <p className="mb-3 text-xs text-neutral-400">{t('settings.notifications.emailNote')}</p>

        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-neutral-400">
              <th className="py-1.5 font-normal">{t('settings.notifications.events')}</th>
              <th className="w-20 py-1.5 text-center font-normal">{t('settings.notifications.inapp')}</th>
              <th className="w-20 py-1.5 text-center font-normal">{t('settings.notifications.email')}</th>
            </tr>
          </thead>
          <tbody>
            {EVENT_KEYS.map((row) => (
              <tr key={row.key} className="border-t border-neutral-100 dark:border-neutral-800">
                <td className="py-2">{t(`settings.notifications.${row.label}`)}</td>
                <td className="text-center">
                  <input
                    type="checkbox"
                    checked={prefs[row.key] !== false}
                    onChange={(e) => save({ [row.key]: e.target.checked })}
                    className="h-4 w-4 accent-accent-600"
                  />
                </td>
                <td className="text-center">
                  <input
                    type="checkbox"
                    checked={prefs[row.key] !== false && prefs.notifyEmail !== false}
                    disabled={prefs[row.key] === false}
                    onChange={(e) => save({ notifyEmail: e.target.checked })}
                    className="h-4 w-4 accent-accent-600 disabled:opacity-30"
                  />
                </td>
              </tr>
            ))}
            <tr className="border-t border-neutral-100 dark:border-neutral-800">
              <td className="py-2 font-medium">{t('settings.notifications.inapp')}</td>
              <td className="text-center">
                <input type="checkbox" checked={prefs.notifyInapp !== false} onChange={(e) => save({ notifyInapp: e.target.checked })} className="h-4 w-4 accent-accent-600" />
              </td>
              <td />
            </tr>
          </tbody>
        </table>
      </section>

      <section className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
        <h2 className="mb-1 text-sm font-semibold">{t('settings.notifications.followedBranches')}</h2>
        <p className="mb-3 text-xs text-neutral-500">{t('settings.notifications.followedBranchesHelp')}</p>
        {loadingFollowed ? (
          <p className="text-xs text-neutral-400">{t('common.loading')}</p>
        ) : followed.length === 0 ? (
          <p className="text-xs text-neutral-400">{t('settings.notifications.noFollowed')}</p>
        ) : (
          <ul className="space-y-1.5">
            {followed.map((f) => (
              <li key={f.individualId} className="flex items-center justify-between rounded-lg border border-neutral-100 px-3 py-1.5 text-sm dark:border-neutral-800">
                <span>{f.name}</span>
                <button onClick={() => handleUnfollow(f.individualId)} className="text-xs text-red-600 hover:underline">
                  {t('settings.notifications.unfollow')}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
