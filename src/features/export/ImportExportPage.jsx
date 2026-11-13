import { useState } from 'react';
import ImportWizard from '../import-export/ImportWizard.jsx';
import ExportPanel from './ExportPanel.jsx';

/**
 * Page combinant les deux faces du module d'import/export : l'assistant
 * d'import GEDCOM existant (Phase 1) et le nouveau panneau d'export
 * (GEDCOM / JSON / PDF).
 */
export default function ImportExportPage() {
  const [tab, setTab] = useState('import');

  return (
    <div>
      <div className="mb-5 flex gap-1 border-b border-neutral-200 dark:border-neutral-800">
        {[
          { key: 'import', label: 'Importer' },
          { key: 'export', label: 'Exporter' },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
              tab === t.key
                ? 'border-accent-600 text-accent-700 dark:text-accent-400'
                : 'border-transparent text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'import' ? <ImportWizard /> : <ExportPanel />}
    </div>
  );
}
