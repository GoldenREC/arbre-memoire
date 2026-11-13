import { formatGenealogyDateWithPref } from '../../lib/utils/dates.js';
import { useAuthStore } from '../../store/useAuthStore.js';

function initials(individual) {
  const f = individual?.firstNames?.trim()?.[0] || '';
  const l = individual?.lastName?.trim()?.[0] || '';
  return (f + l).toUpperCase() || '?';
}

const SEX_ICON = { M: '♂', F: '♀', U: '' };

/**
 * Carte individu partagée par les vues Ascendance et Descendance.
 * `individual === null` rend une carte "branche manquante" (pointillés).
 */
export default function PersonCard({
  individual,
  highlighted = false,
  compact = false,
  onCenter,
  onOpen,
}) {
  const preferences = useAuthStore((s) => s.preferences);
  const showNicknames = preferences?.showNicknames !== false;
  const showProfessions = preferences?.showProfessions !== false;
  const dateFormat = preferences?.dateFormat || 'dmy';

  if (!individual) {
    return (
      <div
        className={`flex items-center justify-center rounded-xl border border-dashed border-neutral-300 text-xs text-neutral-400 dark:border-neutral-700 ${
          compact ? 'h-14 w-44' : 'h-16 w-52'
        }`}
      >
        Inconnu
      </div>
    );
  }

  const avatarColor =
    individual.sex === 'M'
      ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300'
      : individual.sex === 'F'
      ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300'
      : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300';

  return (
    <div
      className={[
        'group relative flex items-center gap-2.5 rounded-xl border bg-white px-3 py-2 shadow-sm transition-shadow hover:shadow-md dark:bg-neutral-900',
        highlighted
          ? 'border-accent-500 ring-1 ring-accent-500'
          : 'border-neutral-200 dark:border-neutral-800',
        compact ? 'w-44' : 'w-52',
      ].join(' ')}
    >
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${avatarColor}`}>
        {initials(individual)}
      </div>

      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium leading-tight">
          {individual.firstNames} {individual.lastName}
          {showNicknames && individual.nickname && <span className="font-normal text-neutral-400"> « {individual.nickname} »</span>}
          <span className="ml-1 text-neutral-400">{SEX_ICON[individual.sex] || ''}</span>
        </div>
        <div className="truncate text-xs text-neutral-500 dark:text-neutral-400">
          {formatGenealogyDateWithPref({ date: individual.birthDate, datePrecision: individual.birthDatePrecision }, dateFormat)}
          {' – '}
          {individual.isDeceased
            ? formatGenealogyDateWithPref({ date: individual.deathDate, datePrecision: individual.deathDatePrecision }, dateFormat)
            : ''}
        </div>
        {showProfessions && individual.occupation && (
          <div className="truncate text-xs italic text-neutral-400">{individual.occupation}</div>
        )}
      </div>

      {(onCenter || onOpen) && (
        <div className="absolute -top-2 right-1 hidden gap-1 group-hover:flex">
          {onCenter && (
            <button
              title="Centrer l'arbre sur cette personne"
              onClick={() => onCenter(individual.id)}
              className="flex h-6 w-6 items-center justify-center rounded-full border border-neutral-200 bg-white text-xs shadow-sm hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800"
            >
              ⌖
            </button>
          )}
          {onOpen && (
            <button
              title="Ouvrir la fiche détaillée"
              onClick={() => onOpen(individual.id)}
              className="flex h-6 w-6 items-center justify-center rounded-full border border-neutral-200 bg-white text-xs shadow-sm hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800"
            >
              🔍
            </button>
          )}
        </div>
      )}
    </div>
  );
}
