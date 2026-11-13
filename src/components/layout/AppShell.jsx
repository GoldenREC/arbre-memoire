import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar.jsx';
import Topbar from './Topbar.jsx';
import QuickSearch from './QuickSearch.jsx';
import ShortcutsHelp from './ShortcutsHelp.jsx';
import { useGlobalShortcuts } from '../../hooks/useGlobalShortcuts.js';

export default function AppShell() {
  const { quickSearchOpen, closeQuickSearch, helpOpen, closeHelp } = useGlobalShortcuts();

  return (
    <div className="flex h-screen w-full bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="flex-1 overflow-y-auto p-8">
          <Outlet />
        </main>
      </div>
      {quickSearchOpen && <QuickSearch onClose={closeQuickSearch} />}
      {helpOpen && <ShortcutsHelp onClose={closeHelp} />}
    </div>
  );
}
