import { useToastStore } from '../../store/useToastStore.js';

/**
 * Pile de confirmations en bas à droite de l'écran (bas, centré sur
 * mobile) — montée une seule fois dans AppShell. Voir useToastStore.js.
 */
export default function ToastHost() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:right-4 sm:items-end">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          onClick={() => dismiss(t.id)}
          className={`w-full max-w-sm cursor-pointer rounded-lg px-4 py-2.5 text-sm text-white shadow-lg ${
            t.type === 'error' ? 'bg-red-600' : 'bg-neutral-800 dark:bg-neutral-700'
          }`}
        >
          {t.type === 'error' ? '✕ ' : '✓ '}{t.message}
        </div>
      ))}
    </div>
  );
}
