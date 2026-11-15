import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useIndividualDetail } from './useIndividualDetail.js';
import { updateIndividualCivilInfo } from './individualMutations.js';
import { deleteIndividual } from '../../lib/db/ownership.js';
import LockToggle from '../../components/ui/LockToggle.jsx';
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
  const { role, isOwner } = useAuthStore();
  const { loading, error, data, reload } = useIndividualDetail(id);
  const [tab, setTab] = useState('timeline');
  // Une fiche cadenassée ne peut plus être modifiée par les admins (le propriétaire, lui, peut tout).
  const [ficheLocked, setFicheLocked] = useState(false);

  const canEdit = role === 'admin' && (!ficheLocked || isOwner);

  if (loading) return <p className="text-sm text-neutral-400">Chargement de la fiche…</p>;
  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!data) return null;

  const { individual, parents, unions, childGroups, events, places, citations } = data;

  async function handleSaveCivilInfo(patch, placesRaw) {
    await updateIndividualCivilInfo(individual.id, individual.treeId, patch, placesRaw);
    reload();
  }

  return (
    <div className="max-w-6xl">
      <div className="mb-4 flex items-center justify-between">
        <Link to="/individus" className="inline-block text-xs text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200">
          ← Retour à la liste
        </Link>
        <div className="flex items-center gap-3">
          <LockToggle treeId={individual.treeId} kind="individual" targetId={individual.id} onStateChange={setFicheLocked} />
          <FollowBranchButton individual={individual} />
        </div>
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
          events={events}
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

      {isOwner && <DeleteFicheZone individual={individual} />}
    </div>
  );
}

/** Suppression d'une fiche : réservée au propriétaire, confirmation par le nom, bloquée par la base si cadenassée. */
function DeleteFicheZone({ individual }) {
  const navigate = useNavigate();
  const fullName = `${individual.firstNames || ''} ${individual.lastName || ''}`.trim();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function handleDelete() {
    setBusy(true);
    setError(null);
    try {
      await deleteIndividual(individual.id);
      navigate('/individus');
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <section className="mt-10 rounded-xl border border-red-200 p-4 dark:border-red-900">
      <h2 className="mb-1 text-sm font-semibold text-red-700 dark:text-red-400">Zone de danger</h2>
      {!open ? (
        <button onClick={() => setOpen(true)} className="text-xs text-red-600 hover:underline">Supprimer cette fiche</button>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-neutral-500">
            Supprime la fiche et ses événements. Impossible si la fiche ou un de ses actes est cadenassé. Pour confirmer, tape le nom complet : <span className="font-medium">{fullName || '—'}</span>
          </p>
          <input value={typed} onChange={(e) => setTyped(e.target.value)} className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900" />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={handleDelete}
              disabled={busy || !fullName || typed.trim() !== fullName}
              className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {busy ? '…' : 'Supprimer définitivement'}
            </button>
            <button onClick={() => { setOpen(false); setTyped(''); setError(null); }} className="text-sm text-neutral-500 hover:underline">Annuler</button>
          </div>
        </div>
      )}
    </section>
  );
}
