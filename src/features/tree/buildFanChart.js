/**
 * Transforme les slots d'un pedigree (buildPedigree.js) en segments
 * d'arc exploitables par d3.arc() : génération 0 = centre, chaque
 * génération suivante est un anneau divisé en 2^g parts égales.
 */
export function computeCompleteness(individual) {
  if (!individual) return 0;
  const fields = [
    individual.firstNames,
    individual.lastName,
    individual.birthDate,
    individual.sex && individual.sex !== 'U' ? individual.sex : null,
    individual.deathDate || individual.isDeceased ? true : null,
  ];
  return fields.filter(Boolean).length / fields.length;
}

export function computeFanSegments(nodesBySlot, maxGenerations) {
  const segments = [];
  for (let generation = 1; generation <= maxGenerations; generation++) {
    const slotCount = 2 ** generation;
    const anglePerSlot = (2 * Math.PI) / slotCount;
    for (let slotIndex = 0; slotIndex < slotCount; slotIndex++) {
      const node = nodesBySlot.get(`${generation}:${slotIndex}`);
      segments.push({
        generation,
        slotIndex,
        startAngle: slotIndex * anglePerSlot,
        endAngle: (slotIndex + 1) * anglePerSlot,
        individual: node?.individual ?? null,
        completeness: computeCompleteness(node?.individual),
      });
    }
  }
  return segments;
}
