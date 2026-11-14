import { useEffect, useState } from 'react';
import { useLocation, Outlet } from 'react-router-dom';
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
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
      {quickSearchOpen && <QuickSearch onClose={closeQuickSearch} />}
      {helpOpen && <ShortcutsHelp onClose={closeHelp} />}
      <ToastHost />
    </div>
  );
}
