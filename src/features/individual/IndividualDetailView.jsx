import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useIndividualDetail } from './useIndividualDetail.js';
import { updateIndividualCivilInfo } from './individualMutations.js';
import { useAuthStore } from '../../store/useAuthStore.js';
import CivilHeader from './CivilHeader.jsx';
import FamilyLinksSection from './FamilyLinksSection.jsx';
import Timeline from './Timeline.jsx';
import NotesTab from './NotesTab.jsx';
import ProfessionsResidencesTab from './ProfessionsResidencesTab.jsx';
import SourcesTab from './SourcesTab.jsx';
import PhotosTab from './PhotosTab.jsx';
import HistoryTab from './HistoryTab.jsx';
import FollowBranchButton from './FollowBranchButton.jsx';

const TABS = [
  { key: 'timeline', label: 'Chronologie' },
  { key: 'notes', label: 'Notes biographiques' },
  { key: 'pro', label: 'Professions & résidences' },
  { key: 'sources', label: 'Sources & preuves' },
  { key: 'photos', label: 'Photos & animaux' },
  { key: 'historique', label: 'Historique' },
];

/**
 * Fiche individu complète : état civil éditable, liens familiaux
 * directs (parents / conjoints / enfants), puis chronologie / notes /
 * professions-résidences / sources en onglets. Alimentée en temps
 * réel par useIndividualDetail (voir ce fichier pour le détail des
 * souscriptions Supabase Realtime).
 */
export default function IndividualDetailView() {
  const { id } = useParams();
  const { role } = useAuthStore();
  const { loading, error, data, reload } = useIndividualDetail(id);
  const [tab, setTab] = useState('timeline');

  const canEdit = role === 'admin' || role === 'family';

  if (loading) return <p className="text-sm text-neutral-400">Chargement de la fiche…</p>;
  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!data) return null;

  const { individual, parents, unions, childGroups, events, places, citations } = data;

  async function handleSaveCivilInfo(patch, placesRaw) {
    await updateIndividualCivilInfo(individual.id, individual.treeId, patch, placesRaw);
    reload();
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-4 flex items-center justify-between">
        <Link to="/individus" className="inline-block text-xs text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200">
          ← Retour à la liste
        </Link>
        <FollowBranchButton individual={individual} />
      </div>

      <CivilHeader
        individual={individual}
        unions={unions}
        places={places}
        canEdit={canEdit}
        onSave={handleSaveCivilInfo}
        events={events}
        citations={citations}
        treeId={individual.treeId}
        onActsChanged={reload}
      />

      <div className="mt-4">
        <FamilyLinksSection
          individual={individual}
          treeId={individual.treeId}
          parents={parents}
          unions={unions}
          childGroups={childGroups}
          canEdit={canEdit}
          onChanged={reload}
        />
      </div>

      <div className="mt-6 flex gap-1 border-b border-neutral-200 dark:border-neutral-800">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              tab === t.key
                ? 'border-accent-600 text-accent-700 dark:text-accent-300'
                : 'border-transparent text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="py-5">
        {tab === 'timeline' && (
          <Timeline
            individual={individual}
            events={events}
            parents={parents}
            childGroups={childGroups}
            places={places}
            treeId={individual.treeId}
            canEdit={canEdit}
            onChanged={reload}
          />
        )}
        {tab === 'notes' && <NotesTab individual={individual} canEdit={canEdit} onChanged={reload} />}
        {tab === 'pro' && (
          <ProfessionsResidencesTab
            individual={individual}
            events={events}
            places={places}
            treeId={individual.treeId}
            canEdit={canEdit}
            onChanged={reload}
          />
        )}
        {tab === 'sources' && (
          <SourcesTab individual={individual} citations={citations} treeId={individual.treeId} canEdit={canEdit} onChanged={reload} />
        )}
        {tab === 'photos' && <PhotosTab individual={individual} canEdit={canEdit} />}
        {tab === 'historique' && <HistoryTab individual={individual} />}
      </div>
    </div>
  );
}
