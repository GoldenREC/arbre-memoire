import { Suspense, useEffect, useState } from 'react';
import { useLocation, useNavigation, Outlet } from 'react-router-dom';
import Sidebar from './Sidebar.jsx';
import Topbar from './Topbar.jsx';
import QuickSearch from './QuickSearch.jsx';
import ShortcutsHelp from './ShortcutsHelp.jsx';
import ToastHost from '../ui/ToastHost.jsx';
import { useGlobalShortcuts } from '../../hooks/useGlobalShortcuts.js';

export default function AppShell() {
  const { quickSearchOpen, closeQuickSearch, helpOpen, closeHelp } = useGlobalShortcuts();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const location = useLocation();
  // Vrai pendant le téléchargement d'une page : sans ce repère, un clic
  // dans le menu semble sans effet tant que la page n'est pas arrivée.
  const navigating = useNavigation().state !== 'idle';

  // Referme le tiroir de navigation mobile à chaque changement de page,
  // pour ne pas le retrouver ouvert par-dessus l'écran suivant.
  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  return (
    <div className="flex h-screen w-full bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <Sidebar open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onMenuClick={() => setMobileNavOpen((open) => !open)} />
        {navigating && (
          <div role="status" aria-label="Chargement de la page" className="h-0.5 w-full overflow-hidden bg-accent-100 dark:bg-accent-900/40">
            <div className="h-full w-1/3 animate-pulse bg-accent-600" />
          </div>
        )}
        <main className={`flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 ${navigating ? 'opacity-60' : ''}`}>
          <Suspense fallback={<p className="text-sm text-neutral-500">Chargement…</p>}>
            <Outlet />
          </Suspense>
        </main>
      </div>
      {quickSearchOpen && <QuickSearch onClose={closeQuickSearch} />}
      {helpOpen && <ShortcutsHelp onClose={closeHelp} />}
      <ToastHost />
    </div>
  );
}
