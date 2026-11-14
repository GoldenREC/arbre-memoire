/**
 * Rôle de chaque personne d'un fichier d'import par rapport aux autres
 * ("père ou mère de Jean Dupont", "conjoint(e) de Marie Martin"), pour
 * que l'écran de revue dise de qui il s'agit quand l'acte ne donne qu'un
 * nom. Fonction pure sur le modèle de staging.
 */
function nameOf(ind) {
  return `${ind?.firstNames || ''} ${ind?.lastName || ''}`.trim() || 'sans nom';
}

export function describeIncomingRoles(stagingModel) {
  const byId = new Map(stagingModel.individuals.map((i) => [i.localId, i]));
  const parts = new Map(stagingModel.individuals.map((i) => [i.localId, []]));
  const add = (localId, text) => { if (parts.has(localId)) parts.get(localId).push(text); };

  const childrenByParent = new Map();
  const parentsByChild = new Map();
  for (const f of stagingModel.filiations || []) {
    if (!childrenByParent.has(f.parentLocalId)) childrenByParent.set(f.parentLocalId, []);
    childrenByParent.get(f.parentLocalId).push(f.childLocalId);
    if (!parentsByChild.has(f.childLocalId)) parentsByChild.set(f.childLocalId, []);
    parentsByChild.get(f.childLocalId).push(f.parentLocalId);
  }
  for (const [parentId, children] of childrenByParent) {
    const sex = byId.get(parentId)?.sex;
    const word = sex === 'M' ? 'père' : sex === 'F' ? 'mère' : 'parent';
    add(parentId, `${word} de ${children.map((id) => nameOf(byId.get(id))).join(', ')}`);
  }
  for (const [childId, parents] of parentsByChild) {
    add(childId, `enfant de ${parents.map((id) => nameOf(byId.get(id))).join(' et ')}`);
  }
  for (const fam of stagingModel.families || []) {
    const partners = (fam.partnerLocalIds || [fam.husbandLocalId, fam.wifeLocalId]).filter(Boolean);
    for (const id of partners) {
      const others = partners.filter((p) => p !== id).map((p) => nameOf(byId.get(p)));
      if (others.length) add(id, `conjoint(e) de ${others.join(', ')}`);
    }
  }
  return new Map([...parts].map(([id, list]) => [id, list.join(' ; ')]));
}
