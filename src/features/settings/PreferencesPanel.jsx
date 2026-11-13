import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../store/useAuthStore.js';
import { useTheme } from '../../hooks/useTheme.js';
import { updateMemberPreferences } from '../../lib/db/settingsMutations.js';
import { SUPPORTED_LANGUAGES } from '../../i18n/index.js';
import IndividualPicker from '../individual/IndividualPicker.jsx';

function Toggle({ checked, onChange, label }) {
  return (
    <label className="flex items-center justify-between gap-3 py-1.5 text-sm">
      <span>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-5 w-9 flex-shrink-0 rounded-full transition-colors ${checked ? 'bg-accent-600' : 'bg-neutral-300 dark:bg-neutral-700'}`}
      >
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${checked ? 'translate-x-4' : 'translate-x-0.5'}`} />
      </button>
    </label>
  );
}

/** Onglet Paramètres → Préférences (langues, format de date, affichage de l'arbre, apparence, fiche-racine). Ouvert à tout membre. */
export default function PreferencesPanel() {
  const { t } = useTranslation();
  const { currentTreeId, user, preferences, setPreferences } = useAuthStore();
  const { theme, setTheme } = useTheme();
  const [saving, setSaving] = useState(false);
  const [rootName, setRootName] = useState(null);

  async function save(patch) {
    setSaving(true);
    try {
      await updateMemberPreferences(currentTreeId, user.id, patch);
      setPreferences(patch);
    } finally {
      setSaving(false);
    }
  }

  const prefs = preferences || {};

  return (
    <div className="max-w-xl space-y-8">
      <section className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
        <h2 className="mb-3 text-sm font-semibold">{t('settings.preferences.title')}</h2>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs text-neutral-500">{t('settings.preferences.uiLanguage')}</label>
            <select
              value={prefs.uiLanguage || 'fr'}
              onChange={(e) => save({ uiLanguage: e.target.value })}
              className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-accent-500 dark:border-neutral-700 dark:bg-neutral-900"
            >
              {SUPPORTED_LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-neutral-500">{t('settings.preferences.emailLanguage')}</label>
            <select
              value={prefs.emailLanguage || 'fr'}
              onChange={(e) => save({ emailLanguage: e.target.value })}
              className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-accent-500 dark:border-neutral-700 dark:bg-neutral-900"
            >
              {SUPPORTED_LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
            </select>
          </div>
        </div>

        <div className="mt-4">
          <label className="mb-1 block text-xs text-neutral-500">{t('settings.preferences.dateFormat')}</label>
          <div className="flex gap-2">
            {[{ v: 'dmy', l: t('settings.preferences.dateFormatDmy') }, { v: 'ymd', l: t('settings.preferences.dateFormatYmd') }].map((opt) => (
              <button
                key={opt.v}
                onClick={() => save({ dateFormat: opt.v })}
                className={`rounded-lg px-2.5 py-1 text-xs ${(prefs.dateFormat || 'dmy') === opt.v ? 'bg-accent-600 text-white' : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300'}`}
              >
                {opt.l}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4">
          <label className="mb-1 block text-xs text-neutral-500">{t('settings.preferences.theme')}</label>
          <div className="flex gap-2">
            <button onClick={() => setTheme('light')} className={`rounded-lg px-2.5 py-1 text-xs ${theme === 'light' ? 'bg-accent-600 text-white' : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300'}`}>
              ☀️ {t('settings.preferences.themeLight')}
            </button>
            <button onClick={() => setTheme('dark')} className={`rounded-lg px-2.5 py-1 text-xs ${theme === 'dark' ? 'bg-accent-600 text-white' : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300'}`}>
              🌙 {t('settings.preferences.themeDark')}
            </button>
          </div>
        </div>

        <div className="mt-2 divide-y divide-neutral-100 dark:divide-neutral-800">
          <Toggle checked={prefs.showNicknames !== false} onChange={(v) => save({ showNicknames: v })} label={t('settings.preferences.showNicknames')} />
          <Toggle checked={prefs.showProfessions !== false} onChange={(v) => save({ showProfessions: v })} label={t('settings.preferences.showProfessions')} />
        </div>
        {saving && <p className="mt-2 text-xs text-neutral-400">{t('common.saved')}</p>}
      </section>

      <section className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
        <h2 className="mb-1 text-sm font-semibold">{t('settings.preferences.defaultRoot')}</h2>
        <p className="mb-3 text-xs text-neutral-500">{t('settings.preferences.defaultRootHelp')}</p>
        {prefs.defaultRootIndividualId ? (
          <div className="flex items-center gap-2 text-sm">
            <span className="flex-1 rounded-lg bg-neutral-50 px-3 py-1.5 dark:bg-neutral-800">{rootName || prefs.defaultRootIndividualId}</span>
            <button onClick={() => save({ defaultRootIndividualId: null })} className="text-xs text-red-600 hover:underline">
              {t('settings.preferences.defaultRootClear')}
            </button>
          </div>
        ) : (
          <>
            <p className="mb-2 text-xs text-neutral-400">{t('settings.preferences.defaultRootNone')}</p>
            <IndividualPicker
              treeId={currentTreeId}
              onSelect={(r) => {
                setRootName(`${r.first_names || ''} ${r.last_name || ''}`.trim());
                save({ defaultRootIndividualId: r.id });
              }}
              placeholder="Choisir une personne…"
            />
          </>
        )}
      </section>
    </div>
  );
}
