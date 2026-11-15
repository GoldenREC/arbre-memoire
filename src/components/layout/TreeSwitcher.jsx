import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/useAuthStore.js';

/**
 * Sélecteur d'arbre de la barre latérale : liste des arbres de l'utilisateur,
 * bascule (retour à l'accueil) et création d'un nouvel arbre à nom libre.
 * Tous les arbres fonctionnent de la même façon ; seul le rôle change.
 */
export default function TreeSwitcher({ onNavigate = () => {} }) {
  const navigate = useNavigate();
  const { trees, currentTreeId, setCurrentTreeId, createTree } = useAuthStore();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function handleSwitch(e) {
    const id = e.target.value;
    if (id === currentTreeId) return;
    await setCurrentTreeId(id);
    navigate('/');
    onNavigate();
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await createTree(name);
      setName('');
      setCreating(false);
      navigate('/');
      onNavigate();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!currentTreeId) return null;

  return (
    <div className="space-y-2 px-3">
      <label className="block text-[11px] font-medium uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
        Arbre
      </label>
      <select
        value={currentTreeId}
        onChange={handleSwitch}
        className="w-full rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-accent-500 dark:border-neutral-700 dark:bg-neutral-900"
      >
        {trees.map((t) => (
          <option key={t.id} value={t.id}>{t.name || 'Sans nom'}</option>
        ))}
      </select>

      {!creating ? (
        <button
          onClick={() => setCreating(true)}
          className="w-full rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-accent-700 hover:bg-accent-50 dark:text-accent-300 dark:hover:bg-accent-900/30"
        >
          + Nouvel arbre
        </button>
      ) : (
        <form onSubmit={handleCreate} className="space-y-1.5">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nom de l'arbre"
            maxLength={120}
            className="w-full rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-accent-500 dark:border-neutral-700 dark:bg-neutral-900"
          />
          <div className="flex gap-1.5">
            <button type="submit" disabled={busy || !name.trim()} className="flex-1 rounded-lg bg-accent-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-accent-700 disabled:opacity-50">
              {busy ? '…' : 'Créer'}
            </button>
            <button type="button" onClick={() => { setCreating(false); setError(null); }} className="rounded-lg px-2.5 py-1.5 text-xs text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800">
              Annuler
            </button>
          </div>
          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
        </form>
      )}
    </div>
  );
}
