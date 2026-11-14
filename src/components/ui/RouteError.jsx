import { useRouteError, Link } from 'react-router-dom';

/**
 * Écran de secours quand une page plante (erreur de rendu ou de
 * chargement) : sans lui, React démonte tout et laisse une page blanche.
 * Cas particulier fréquent après un déploiement : le navigateur a encore
 * l'ancienne version en mémoire et demande un fichier de page qui
 * n'existe plus — un simple rechargement suffit, on le propose en premier.
 */
export default function RouteError() {
  const error = useRouteError();
  const message = error?.message || String(error || '');
  const staleBuild = /dynamically imported module|Importing a module script failed|Failed to fetch/i.test(message);

  return (
    <div role="alert" className="mx-auto max-w-lg p-6 text-neutral-900 dark:text-neutral-100">
      <h1 className="text-lg font-semibold">
        {staleBuild ? 'Une nouvelle version du site est disponible' : 'Cette page a rencontré une erreur'}
      </h1>
      <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">
        {staleBuild
          ? 'Recharge la page pour l’obtenir.'
          : 'Tes données ne sont pas touchées. Recharge la page ; si l’erreur revient, note le message ci-dessous.'}
      </p>
      {!staleBuild && message && (
        <pre className="mt-3 overflow-x-auto rounded-lg bg-neutral-100 p-3 text-xs text-neutral-700 dark:bg-neutral-900 dark:text-neutral-300">{message}</pre>
      )}
      <div className="mt-4 flex gap-2">
        <button
          onClick={() => window.location.reload()}
          className="rounded-lg bg-accent-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-700"
        >
          Recharger la page
        </button>
        <Link to="/" className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800">
          Tableau de bord
        </Link>
      </div>
    </div>
  );
}
