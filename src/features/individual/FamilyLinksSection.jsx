import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import IndividualPicker from './IndividualPicker.jsx';
import {
  addParentLink, addChildLink, removeFiliation, createUnion, removeUnion,
} from './individualMutations.js';
import { pushToast, pushErrorToast } from '../../store/useToastStore.js';
import UnionStatusForm from './UnionStatusForm.jsx';
import { RELATIONSHIP_STATUS_LABELS, relationshipStatusFromUnion } from './unionMutations.js';

export const FILIATION_LABELS = {
  biological: 'Biologique',
  adoption_plenary: 'Adoption plénière',
  adoption_simple: 'Adoption simple',
  foster: "Famille d'accueil",
  late_recognition: 'Reconnaissance tardive',
  unknown: 'Inconnu',
};

function FiliationBadge({ type }) {
  const isBiological = type === 'biological';
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[11px] ${
        isBiological
          ? 'border-neutral-200 text-neutral-500 dark:border-neutral-700 dark:text-neutral-400'
          : 'border-dashed border-accent-400 text-accent-600 dark:text-accent-300'
      }`}
    >
      {FILIATION_LABELS[type] || type}
    </span>
  );
}

function PersonLink({ individual }) {
  if (!individual) return <span className="text-neutral-400">Inconnu</span>;
  return (
    <Link to={`/individus/${individual.id}`} className="font-medium hover:underline">
      {individual.firstNames} {individual.lastName}
    </Link>
  );
}

/**
 * Section "liens familiaux" de la fiche : parents, conjoints/unions et
 * enfants, avec ajout/retrait direct — c'est ici que se construit (ou
 * se corrige) le graphe que consomment les vues de l'arbre.
 */
export default function FamilyLinksSection({ individual, treeId, parents, unions, childGroups, events, canEdit, onChanged }) {
  // Le formulaire d'une union (jusqu'à trois jalons avec lieu et preuve) ne
  // tient pas dans une colonne sur trois : pendant qu'on en modifie une, le
  // bloc des unions passe sur toute la largeur, sous les deux autres.
  const [unionFormOpen, setUnionFormOpen] = useState(false);
  return (
    <div className={`grid gap-4 ${unionFormOpen ? 'sm:grid-cols-2' : 'sm:grid-cols-3'}`}>
      <ParentsBlock individualId={individual.id} treeId={treeId} parents={parents} canEdit={canEdit} onChanged={onChanged} />
      <div className={unionFormOpen ? 'order-last sm:col-span-2' : ''}>
        <UnionsBlock individualId={individual.id} treeId={treeId} unions={unions} events={events} canEdit={canEdit} onChanged={onChanged} onEditingChange={setUnionFormOpen} />
      </div>
      <ChildrenBlock individualId={individual.id} treeId={treeId} unions={unions} childGroups={childGroups} canEdit={canEdit} onChanged={onChanged} />
    </div>
  );
}

function Block({ title, children, onAdd, addLabel }) {
  return (
    <div className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">{title}</h3>
      </div>
      <div className="space-y-2">{children}</div>
      {onAdd && (
        <button onClick={onAdd} className="mt-2 text-xs text-accent-600 hover:underline">
          {addLabel}
        </button>
      )}
    </div>
  );
}

function ParentsBlock({ individualId, treeId, parents, canEdit, onChanged }) {
  const [adding, setAdding] = useState(false);
  const [filiationType, setFiliationType] = useState('biological');

  async function handleSelect(person) {
    try {
      await addParentLink(treeId, individualId, person.id, filiationType);
      setAdding(false);
      onChanged?.();
      pushToast('Parent ajouté.');
    } catch (err) {
      pushErrorToast(err.message);
    }
  }
  async function handleRemove(filiationId) {
    try {
      await removeFiliation(filiationId);
      onChanged?.();
      pushToast('Lien retiré.');
    } catch (err) {
      pushErrorToast(err.message);
    }
  }

  return (
    <Block title="Parents" onAdd={canEdit ? () => setAdding((v) => !v) : null} addLabel={adding ? 'Annuler' : '+ Ajouter un parent'}>
      {parents.length === 0 && <p className="text-sm text-neutral-400">Aucun parent connu.</p>}
      {parents.map((p) => (
        <div key={p.filiationId} className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-1.5">
            <PersonLink individual={p.individual} />
            <FiliationBadge type={p.filiationType} />
          </div>
          {canEdit && (
            <button onClick={() => handleRemove(p.filiationId)} className="text-xs text-neutral-400 hover:text-red-500">
              retirer
            </button>
          )}
        </div>
      ))}
      {adding && (
        <div className="space-y-2 pt-1">
          <select className="field" value={filiationType} onChange={(e) => setFiliationType(e.target.value)}>
            {Object.entries(FILIATION_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <IndividualPicker treeId={treeId} excludeIds={[individualId, ...parents.map((p) => p.individual?.id)]} onSelect={handleSelect} allowCreate />
        </div>
      )}
    </Block>
  );
}

function UnionsBlock({ individualId, treeId, unions, events, canEdit, onChanged, onEditingChange }) {
  const [adding, setAdding] = useState(false);
  const [editingUnionId, setEditingUnionId] = useState(null);
  useEffect(() => {
    onEditingChange?.(editingUnionId !== null);
  }, [editingUnionId, onEditingChange]);
  // Union tout juste créée, pas encore enregistrée avec sa preuve : si on
  // annule ou ferme son formulaire, elle est retirée (pas d'union sans preuve).
  const [pendingUnionId, setPendingUnionId] = useState(null);

  async function discardPendingUnion(unionId) {
    setEditingUnionId(null);
    if (unionId !== pendingUnionId) return;
    setPendingUnionId(null);
    try {
      await removeUnion(unionId);
      onChanged?.();
      pushToast('Union non ajoutée : une preuve est requise.');
    } catch (err) {
      pushErrorToast(err.message);
    }
  }

  async function handleSelect(person) {
    try {
      const unionId = await createUnion(treeId, individualId, person.id, {});
      setAdding(false);
      onChanged?.();
      pushToast('Précise le statut et la preuve de l\'union ci-dessous.');
      setPendingUnionId(unionId);
      setEditingUnionId(unionId);
    } catch (err) {
      pushErrorToast(err.message);
    }
  }
  async function handleRemove(unionId) {
    try {
      await removeUnion(unionId);
      onChanged?.();
      pushToast('Union retirée.');
    } catch (err) {
      pushErrorToast(err.message);
    }
  }

  return (
    <Block title="Conjoints / Unions" onAdd={canEdit ? () => setAdding((v) => !v) : null} addLabel={adding ? 'Annuler' : '+ Ajouter un conjoint'}>
      {unions.length === 0 && <p className="text-sm text-neutral-400">Aucune union enregistrée.</p>}
      {unions.map((u) => (
        <div key={u.id}>
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-1.5">
              <PersonLink individual={u.partner} />
              <span className="text-xs text-neutral-400">({RELATIONSHIP_STATUS_LABELS[relationshipStatusFromUnion(u)]})</span>
            </div>
            {canEdit && (
              <div className="flex items-center gap-2">
                <button onClick={() => (editingUnionId === u.id ? discardPendingUnion(u.id) : setEditingUnionId(u.id))} className="text-xs text-neutral-400 hover:text-accent-600">
                  {editingUnionId === u.id ? 'fermer' : 'modifier'}
                </button>
                <button onClick={() => handleRemove(u.id)} className="text-xs text-neutral-400 hover:text-red-500">
                  retirer
                </button>
              </div>
            )}
          </div>
          {editingUnionId === u.id && (
            <div className="mt-2">
              <UnionStatusForm
                treeId={treeId}
                union={u}
                unionEvents={(events || []).filter((e) => e.origin === 'union' && e.unionId === u.id)}
                onSaved={() => { setPendingUnionId(null); setEditingUnionId(null); onChanged?.(); }}
                onCancel={() => discardPendingUnion(u.id)}
              />
            </div>
          )}
        </div>
      ))}
      {adding && (
        <div className="pt-1">
          <IndividualPicker treeId={treeId} excludeIds={[individualId, ...unions.map((u) => u.partner?.id)]} onSelect={handleSelect} allowCreate />
        </div>
      )}
    </Block>
  );
}

function ChildrenBlock({ individualId, treeId, unions, childGroups, canEdit, onChanged }) {
  const [adding, setAdding] = useState(false);
  const [filiationType, setFiliationType] = useState('biological');
  const [unionId, setUnionId] = useState('');

  const allChildren = childGroups.flatMap((g) => g.children);

  async function handleSelect(person) {
    try {
      await addChildLink(treeId, individualId, person.id, filiationType, unionId || null);
      setAdding(false);
      onChanged?.();
      pushToast('Enfant ajouté.');
    } catch (err) {
      pushErrorToast(err.message);
    }
  }
  async function handleRemove(filiationId) {
    try {
      await removeFiliation(filiationId);
      onChanged?.();
      pushToast('Lien retiré.');
    } catch (err) {
      pushErrorToast(err.message);
    }
  }

  return (
    <Block title="Enfants" onAdd={canEdit ? () => setAdding((v) => !v) : null} addLabel={adding ? 'Annuler' : '+ Ajouter un enfant'}>
      {childGroups.length === 0 && <p className="text-sm text-neutral-400">Aucun enfant enregistré.</p>}
      {childGroups.map((group, gi) => (
        <div key={gi}>
          {group.union && (
            <div className="mb-1 text-xs text-neutral-400">
              ⚭ avec {group.union.partner ? `${group.union.partner.firstNames} ${group.union.partner.lastName}` : 'inconnu(e)'}
            </div>
          )}
          {group.children.map((c) => (
            <div key={c.filiationId} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-1.5">
                <PersonLink individual={c.individual} />
                <FiliationBadge type={c.filiationType} />
              </div>
              {canEdit && (
                <button onClick={() => handleRemove(c.filiationId)} className="text-xs text-neutral-400 hover:text-red-500">
                  retirer
                </button>
              )}
            </div>
          ))}
        </div>
      ))}
      {adding && (
        <div className="space-y-2 pt-1">
          <select className="field" value={filiationType} onChange={(e) => setFiliationType(e.target.value)}>
            {Object.entries(FILIATION_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          {unions.length > 0 && (
            <select className="field" value={unionId} onChange={(e) => setUnionId(e.target.value)}>
              <option value="">Sans union précisée</option>
              {unions.map((u) => (
                <option key={u.id} value={u.id}>avec {u.partner ? `${u.partner.firstNames} ${u.partner.lastName}` : 'inconnu(e)'}</option>
              ))}
            </select>
          )}
          <IndividualPicker treeId={treeId} excludeIds={[individualId, ...allChildren.map((c) => c.individual?.id)]} onSelect={handleSelect} allowCreate />
        </div>
      )}
    </Block>
  );
}
