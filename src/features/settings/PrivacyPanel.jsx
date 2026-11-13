import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../store/useAuthStore.js';
import { updateTreePrivacyThreshold } from '../../lib/db/settingsMutations.js';

/** Onglet Paramètres → Confidentialité & RGPD. Réservé aux administrateurs (voir SettingsPage.jsx). */
export default function PrivacyPanel() {
  const { t } = useTranslation();
  const { currentTreeId, privacyThresholdYears } = useAuthStore();
  const [value, setValue] = useState(privacyThresholdYears);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      await updateTreePrivacyThreshold(currentTreeId, value);
      useAuthStore.setState({ privacyThresholdYears: value, trees: useAuthStore.getState().trees.map((tr) => (tr.id === currentTreeId ? { ...tr, privacyThresholdYears: value } : tr)) });
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-xl space-y-6">
      <section className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
        <h2 className="mb-1 text-sm font-semibold">{t('settings.privacy.title')}</h2>
        <p className="mb-4 text-xs text-neutral-500">{t('settings.privacy.thresholdHelp')}</p>

        <label className="mb-1 block text-xs text-neutral-500">{t('settings.privacy.thresholdLabel')}</label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={1}
            max={150}
            value={value}
            onChange={(e) => setValue(Number(e.target.value))}
            className="w-24 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-accent-500 dark:border-neutral-700 dark:bg-neutral-900"
          />
          <span className="text-sm text-neutral-500">{t('settings.privacy.years')}</span>
          <button
            onClick={handleSave}
            disabled={saving || value === privacyThresholdYears}
            className="rounded-lg bg-accent-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-700 disabled:opacity-50"
          >
            {saving ? '…' : t('common.save')}
          </button>
        </div>
        {saved && <p className="mt-2 text-xs text-emerald-600">{t('common.saved')}</p>}
        <p className="mt-3 text-xs text-neutral-400">{t('settings.privacy.currentValue')} : {privacyThresholdYears} {t('settings.privacy.years')}</p>
      </section>
    </div>
  );
}
