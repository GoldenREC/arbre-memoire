import { useMemo, useState } from 'react';
import { useFamilyTree } from './FamilyTreeContext.jsx';
import { buildDescendantTree } from './buildDescendants.js';
import PersonCard from './PersonCard.jsx';
import { branchColor } from './branchColor.js';

/**
 * Vue Descendance en cascade indentée : un noeud = un individu + le(s)
 * groupe(s) "⚭ avec conjoint" portant ses enfants. Repliable branche
 * par branche. Ce format est volontairement plus simple qu'un arbre
 * "tidy tree" à calcul de positions : il reste lisible et fluide même
 * sur une famille nombreuse, et le repliement évite la surcharge.
 */
export default function DescendancyView({ onOpenIndividual }) {
  const { graph, rootId, setRootId } = useFamilyTree();
  const [collapsed, setCollapsed] = useState(() => new Set());

  const tree = useMemo(() => buildDescendantTree(graph, rootId, { collapsed }), [graph, rootId, collapsed]);

  function toggle(individualId) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(individualId)) next.delete(individualId);
      else next.add(individualId);
      return next;
    });
  }

  if (!tree) {
    return <p className="text-sm text-neutral-400">Aucun individu sélectionné.</p>;
  }

  return (
    <div className="rounded-xl border border-neutral-200 p-6 dark:border-neutral-800">
      <p className="mb-4 text-xs text-neutral-400">
        Clique sur ▾ pour replier une branche. La pastille de couleur indique la lignée patronymique.
      </p>
      <DescendantNode
        node={tree}
        isRoot
        rootId={rootId}
        onToggle={toggle}
        onCenter={setRootId}
        onOpen={onOpenIndividual}
      />
    </div>
  );
}

function DescendantNode({ node, isRoot = false, rootId, onToggle, onCenter, onOpen }) {
  const color = branchColor(node.individual?.lastName);

  return (
    <div className={isRoot ? '' : 'relative border-l border-neutral-200 pl-6 dark:border-neutral-800'}>
      {!isRoot && <span className="absolute -left-px top-5 h-px w-6 bg-neutral-200 dark:bg-neutral-800" />}

      <div className="flex items-center gap-2 py-1.5">
        <span className={`h-2 w-2 shrink-0 rounded-full ${color.dot}`} title="Lignée patronymique" />

        <PersonCard
          individual={node.individual}
          highlighted={node.individualId === rootId}
          onCenter={onCenter}
          onOpen={onOpen}
        />

        {node.hasChildren && (
          <button
            onClick={() => onToggle(node.individualId)}
            className="flex h-6 w-6 items-center justify-center rounded-full text-xs text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            title={node.isCollapsed ? 'Déplier' : 'Replier'}
          >
            {node.isCollapsed ? '▸' : '▾'}
          </button>
        )}
      </div>

      {!node.isCollapsed && node.familyGroups.length > 0 && (
        <div className="space-y-3">
          {node.familyGroups.map((group, gi) => (
            <div key={gi}>
              {group.partner && (
                <div className="ml-2 flex items-center gap-2 pb-1 pl-6 text-xs text-neutral-400">
                  <span>⚭</span>
                  <span>
                    {group.partner.firstNames} {group.partner.lastName}
                  </span>
                </div>
              )}
              <div className="space-y-1">
                {group.children.map((child) => (
                  <DescendantNode
                    key={child.individualId}
                    node={child}
                    rootId={rootId}
                    onToggle={onToggle}
                    onCenter={onCenter}
                    onOpen={onOpen}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
