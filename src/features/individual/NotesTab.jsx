import { useState } from 'react';
import { updateBiography } from './individualMutations.js';
import { pushToast, pushErrorToast } from '../../store/useToastStore.js';

export default function NotesTab({ individual, canEdit, onChanged }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(individual.biography || '');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await updateBiography(individual.id, text);
      setEditing(false);
      onChanged?.();
      pushToast('Note enregistrée.');
    } catch (err) {
      pushErrorToast(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div>
        <textarea className="field" rows={8} value={text} onChange={(e) => setText(e.target.value)} />
        <div className="mt-2 flex gap-2">
          <button onClick={handleSave} disabled={saving} className="rounded-lg bg-accent-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-700 disabled:opacity-60">
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
          <button onClick={() => { setText(individual.biography || ''); setEditing(false); }} className="rounded-lg px-3 py-1.5 text-sm text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800">
            Annuler
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {individual.biography ? (
        <p className="whitespace-pre-wrap text-sm text-neutral-600 dark:text-neutral-300">{individual.biography}</p>
      ) : (
        <p className="text-sm text-neutral-400">Aucune note biographique pour l'instant.</p>
      )}
      {canEdit && (
        <button onClick={() => setEditing(true)} className="mt-3 text-xs text-accent-600 hover:underline">
          Modifier
        </button>
      )}
    </div>
  );
}
