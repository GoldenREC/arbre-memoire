/**
 * Calculs démographiques et généalogiques — fonctions pures, opérant
 * sur les données déjà chargées par statsData.js, pour rester
 * testables sans Supabase. Toutes les moyennes d'âge se basent sur
 * `computeAge` (lib/utils/dates.js), déjà utilisé ailleurs dans l'app,
 * pour rester cohérentes avec le reste de l'application.
 */
import { computeAge } from '../../lib/utils/dates.js';

function yearOf(dateStr) {
  return dateStr ? Number(dateStr.slice(0, 4)) : null;
}

/** Âge atteint par un individu : à son décès s'il est décédé et daté, sinon son âge actuel s'il est vivant et né. */
export function ageReached(individual) {
  if (individual.isDeceased || individual.deathDate) {
    if (!individual.birthDate || !individual.deathDate) return null;
    return computeAge(individual.birthDate, individual.deathDate);
  }
  if (!individual.birthDate) return null;
  return computeAge(individual.birthDate);
}

const AGE_BAND_SIZE = 10;

/**
 * Pyramide des âges : répartition par tranche de 10 ans et par sexe,
 * de l'ensemble de l'arbre ou restreinte à un siècle de naissance
 * (centuryStart, ex: 1800 pour le XIXe siècle).
 */
export function buildAgePyramid(individuals, { centuryStart } = {}) {
  const pool = centuryStart == null
    ? individuals
    : individuals.filter((i) => {
        const y = yearOf(i.birthDate);
        return y != null && y >= centuryStart && y < centuryStart + 100;
      });

  const bands = new Map(); // bandStart -> {M, F, U}
  let maxBand = 0;
  for (const ind of pool) {
    const age = ageReached(ind);
    if (age == null || age < 0) continue;
    const bandStart = Math.min(Math.floor(age / AGE_BAND_SIZE) * AGE_BAND_SIZE, 100);
    maxBand = Math.max(maxBand, bandStart);
    if (!bands.has(bandStart)) bands.set(bandStart, { M: 0, F: 0, U: 0 });
    const sex = ind.sex === 'M' || ind.sex === 'F' ? ind.sex : 'U';
    bands.get(bandStart)[sex]++;
  }

  const rows = [];
  for (let b = 0; b <= maxBand; b += AGE_BAND_SIZE) {
    const counts = bands.get(b) || { M: 0, F: 0, U: 0 };
    rows.push({ label: b === 100 ? '100+' : `${b}-${b + 9}`, ...counts, total: counts.M + counts.F + counts.U });
  }
  return rows;
}

/** Espérance de vie (âge moyen au décès) regroupée par période de naissance (siècle: 100, décennie: 10). */
export function lifeExpectancyByPeriod(individuals, periodSize = 100) {
  const buckets = new Map(); // periodStart -> {sum, count}
  for (const ind of individuals) {
    if (!ind.birthDate || !ind.deathDate) continue;
    const age = computeAge(ind.birthDate, ind.deathDate);
    if (age == null || age < 0 || age > 130) continue;
    const birthYear = yearOf(ind.birthDate);
    const period = Math.floor(birthYear / periodSize) * periodSize;
    if (!buckets.has(period)) buckets.set(period, { sum: 0, count: 0 });
    const b = buckets.get(period);
    b.sum += age;
    b.count += 1;
  }
  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([period, { sum, count }]) => ({ period, avgAge: Math.round((sum / count) * 10) / 10, count }));
}

/** Âge moyen au mariage, global et par sexe, et écart d'âge moyen entre conjoints. */
export function marriageAgeStats(individuals, unions, partnersByUnion) {
  const individualsById = new Map(individuals.map((i) => [i.id, i]));
  const bySex = { M: { sum: 0, count: 0 }, F: { sum: 0, count: 0 } };
  let gapSum = 0;
  let gapCount = 0;

  for (const union of unions) {
    if (!union.startDate) continue;
    const partnerIds = partnersByUnion.get(union.id) || [];
    const ages = [];
    for (const pid of partnerIds) {
      const person = individualsById.get(pid);
      if (!person?.birthDate) continue;
      const age = computeAge(person.birthDate, union.startDate);
      if (age == null || age < 0 || age > 110) continue;
      ages.push(age);
      if (person.sex === 'M' || person.sex === 'F') {
        bySex[person.sex].sum += age;
        bySex[person.sex].count += 1;
      }
    }
    if (ages.length === 2) {
      gapSum += Math.abs(ages[0] - ages[1]);
      gapCount += 1;
    }
  }

  const overallSum = bySex.M.sum + bySex.F.sum;
  const overallCount = bySex.M.count + bySex.F.count;

  return {
    overall: overallCount ? Math.round((overallSum / overallCount) * 10) / 10 : null,
    male: bySex.M.count ? Math.round((bySex.M.sum / bySex.M.count) * 10) / 10 : null,
    female: bySex.F.count ? Math.round((bySex.F.sum / bySex.F.count) * 10) / 10 : null,
    count: overallCount,
    averageSpouseGap: gapCount ? Math.round((gapSum / gapCount) * 10) / 10 : null,
    gapCount,
  };
}

/** Âge moyen des parents à la naissance de leurs enfants, par sexe (paternité / maternité). */
export function parenthoodAgeStats(individuals, filiations) {
  const individualsById = new Map(individuals.map((i) => [i.id, i]));
  const bySex = { M: { sum: 0, count: 0 }, F: { sum: 0, count: 0 } };

  for (const f of filiations) {
    if (f.filiationType !== 'biological') continue; // l'âge au moment de l'adoption n'a pas le même sens
    const parent = individualsById.get(f.parentId);
    const child = individualsById.get(f.childId);
    if (!parent?.birthDate || !child?.birthDate) continue;
    const age = computeAge(parent.birthDate, child.birthDate);
    if (age == null || age < 10 || age > 75) continue; // écarte les valeurs biologiquement impossibles
    if (parent.sex === 'M' || parent.sex === 'F') {
      bySex[parent.sex].sum += age;
      bySex[parent.sex].count += 1;
    }
  }

  return {
    father: bySex.M.count ? Math.round((bySex.M.sum / bySex.M.count) * 10) / 10 : null,
    fatherCount: bySex.M.count,
    mother: bySex.F.count ? Math.round((bySex.F.sum / bySex.F.count) * 10) / 10 : null,
    motherCount: bySex.F.count,
  };
}

/** Comptage des naissances et décès par décennie — matière première pour repérer un pic de mortalité. */
export function birthsAndDeathsByDecade(individuals) {
  const births = new Map();
  const deaths = new Map();
  for (const ind of individuals) {
    const by = yearOf(ind.birthDate);
    if (by != null) {
      const d = Math.floor(by / 10) * 10;
      births.set(d, (births.get(d) || 0) + 1);
    }
    const dy = yearOf(ind.deathDate);
    if (dy != null) {
      const d = Math.floor(dy / 10) * 10;
      deaths.set(d, (deaths.get(d) || 0) + 1);
    }
  }
  const decades = [...new Set([...births.keys(), ...deaths.keys()])].sort((a, b) => a - b);
  return decades.map((decade) => ({ decade, births: births.get(decade) || 0, deaths: deaths.get(decade) || 0 }));
}

/**
 * Repère les décennies où le nombre de décès dépasse nettement la
 * moyenne (moyenne + 1,5 écart-type) — un signal statistique brut, pas
 * une attribution de cause : l'app n'invente aucun lien avec une
 * épidémie ou un conflit précis, elle se limite à signaler le pic.
 */
export function detectMortalityPeaks(byDecade) {
  const counts = byDecade.map((d) => d.deaths);
  if (counts.length < 3) return [];
  const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
  const variance = counts.reduce((a, b) => a + (b - mean) ** 2, 0) / counts.length;
  const threshold = mean + 1.5 * Math.sqrt(variance);
  if (threshold <= 0) return [];
  return byDecade.filter((d) => d.deaths > threshold && d.deaths >= 2);
}

function splitNameTokens(fullName) {
  return (fullName || '')
    .split(/[\s-]+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

/**
 * Top des prénoms (ou patronymes) avec leur fenêtre d'apparition et
 * leur décennie de pic — field: 'firstNames' (éclaté en jetons, un
 * individu "Jean Marie" compte pour "Jean" et "Marie") ou 'lastName'
 * (pris tel quel).
 */
export function topNames(individuals, field, { limit = 15, splitTokens = field === 'firstNames' } = {}) {
  const stats = new Map(); // name -> { count, years: number[], byDecade: Map }
  for (const ind of individuals) {
    const raw = ind[field];
    if (!raw) continue;
    const year = yearOf(ind.birthDate);
    const tokens = splitTokens ? splitNameTokens(raw) : [raw.trim()];
    for (const name of tokens) {
      if (!name) continue;
      if (!stats.has(name)) stats.set(name, { count: 0, years: [], byDecade: new Map() });
      const s = stats.get(name);
      s.count += 1;
      if (year != null) {
        s.years.push(year);
        const d = Math.floor(year / 10) * 10;
        s.byDecade.set(d, (s.byDecade.get(d) || 0) + 1);
      }
    }
  }

  return [...stats.entries()]
    .map(([name, s]) => {
      let peakDecade = null;
      let peakCount = 0;
      for (const [decade, c] of s.byDecade) {
        if (c > peakCount) { peakCount = c; peakDecade = decade; }
      }
      return {
        name,
        count: s.count,
        firstYear: s.years.length ? Math.min(...s.years) : null,
        lastYear: s.years.length ? Math.max(...s.years) : null,
        peakDecade,
      };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/** Top des lieux pour un type d'événement donné, ou pour la naissance/le décès portés directement par l'individu. */
export function topPlaces(individuals, events, placesById, kind, { limit = 10 } = {}) {
  const counts = new Map();
  function bump(placeId) {
    if (!placeId) return;
    const label = placesById.get(placeId);
    if (!label) return;
    counts.set(label, (counts.get(label) || 0) + 1);
  }

  if (kind === 'birth') individuals.forEach((i) => bump(i.birthPlaceId));
  else if (kind === 'death') individuals.forEach((i) => bump(i.deathPlaceId));
  else events.filter((e) => e.eventType === kind).forEach((e) => bump(e.placeId));

  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/**
 * Flux migratoires : pour chaque individu dont le lieu de naissance et
 * le lieu de décès diffèrent, compte le trajet (lieu de naissance →
 * lieu de décès), agrégé et classé — une version tabulaire des
 * parcours de vie déjà tracés sur la Carte (Phase 5), sans dépendre de
 * Leaflet ici.
 */
export function migrationFlows(individuals, placesById, { limit = 15 } = {}) {
  const counts = new Map(); // "from→to" -> {from, to, count}
  for (const ind of individuals) {
    if (!ind.birthPlaceId || !ind.deathPlaceId || ind.birthPlaceId === ind.deathPlaceId) continue;
    const from = placesById.get(ind.birthPlaceId);
    const to = placesById.get(ind.deathPlaceId);
    if (!from || !to) continue;
    const key = `${from}→${to}`;
    if (!counts.has(key)) counts.set(key, { from, to, count: 0 });
    counts.get(key).count += 1;
  }
  return [...counts.values()].sort((a, b) => b.count - a.count).slice(0, limit);
}

/**
 * Les quatre critères de complétude d'une fiche : date de naissance
 * exacte, lieu de naissance, au moins une photo identifiée, au moins
 * un acte N/M/D validé parmi ceux applicables à cette personne.
 * `nmdStatus` vient de nmdStatus.computeNmdStatus (ou du bulk
 * statsData.bulkNmdStatus) pour cet individu.
 */
export function completenessCriteria(individual, hasPhoto, nmdStatus) {
  const hasExactBirth = !!(individual.birthDate && individual.birthDatePrecision === 'exact');
  const hasBirthPlace = !!individual.birthPlaceId;
  const applicableActs = 1 + (individual.isDeceased ? 1 : 0) + (nmdStatus?.marriage.options.length ? 1 : 0);
  const validatedActs =
    (nmdStatus?.birth.hasAct ? 1 : 0) + (individual.isDeceased && nmdStatus?.death.hasAct ? 1 : 0) + (nmdStatus?.marriage.hasAct ? 1 : 0);
  const hasAct = applicableActs > 0 && validatedActs > 0;
  return { hasExactBirth, hasBirthPlace, hasPhoto: !!hasPhoto, hasAct };
}

function aggregateCompleteness(individuals, individualsWithPhoto, nmdStatusByIndividual) {
  let sumRatio = 0;
  const perCriterion = { exactBirthDate: 0, birthPlace: 0, photo: 0, validatedAct: 0 };

  for (const ind of individuals) {
    const c = completenessCriteria(ind, individualsWithPhoto.has(ind.id), nmdStatusByIndividual.get(ind.id));
    if (c.hasExactBirth) perCriterion.exactBirthDate++;
    if (c.hasBirthPlace) perCriterion.birthPlace++;
    if (c.hasPhoto) perCriterion.photo++;
    if (c.hasAct) perCriterion.validatedAct++;
    sumRatio += [c.hasExactBirth, c.hasBirthPlace, c.hasPhoto, c.hasAct].filter(Boolean).length / 4;
  }

  const n = individuals.length || 1;
  return {
    globalPercent: Math.round((sumRatio / n) * 1000) / 10,
    count: individuals.length,
    criteria: {
      exactBirthDate: Math.round((perCriterion.exactBirthDate / n) * 1000) / 10,
      birthPlace: Math.round((perCriterion.birthPlace / n) * 1000) / 10,
      photo: Math.round((perCriterion.photo / n) * 1000) / 10,
      validatedAct: Math.round((perCriterion.validatedAct / n) * 1000) / 10,
    },
  };
}

/** Taux de complétude global de l'arbre — `nmdStatusByIndividual` vient de statsData.bulkNmdStatus. */
export function completeness(individuals, individualsWithPhoto, nmdStatusByIndividual) {
  return aggregateCompleteness(individuals, individualsWithPhoto, nmdStatusByIndividual);
}

/**
 * Taux de complétude par génération en remontant/descendant depuis une
 * racine choisie (BFS sur le graphe généalogique — voir
 * features/tree/useFamilyGraph.js:loadFamilyGraph) : génération 0 =
 * la racine, -1/-2... = parents/grands-parents, +1/+2... =
 * enfants/petits-enfants. Sert de proxy honnête à une notion de
 * "branche" qui n'a pas de définition unique dans un arbre.
 */
export function completenessByGeneration(graph, rootId, individualsWithPhoto, nmdStatusByIndividual, { maxGenerations = 6 } = {}) {
  const generationOf = new Map([[rootId, 0]]);
  const queueUp = [rootId];
  const queueDown = [rootId];

  while (queueUp.length) {
    const id = queueUp.shift();
    const gen = generationOf.get(id);
    if (Math.abs(gen) >= maxGenerations) continue;
    for (const { parentId } of graph.getParents(id)) {
      if (generationOf.has(parentId)) continue;
      generationOf.set(parentId, gen - 1);
      queueUp.push(parentId);
    }
  }
  while (queueDown.length) {
    const id = queueDown.shift();
    const gen = generationOf.get(id);
    if (Math.abs(gen) >= maxGenerations) continue;
    for (const childId of graph.getChildren(id)) {
      if (generationOf.has(childId)) continue;
      generationOf.set(childId, gen + 1);
      queueDown.push(childId);
    }
  }

  const byGeneration = new Map();
  for (const [id, gen] of generationOf) {
    const individual = graph.getIndividual(id);
    if (!individual) continue;
    if (!byGeneration.has(gen)) byGeneration.set(gen, []);
    byGeneration.get(gen).push(individual);
  }

  return [...byGeneration.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([generation, inds]) => ({ generation, ...aggregateCompleteness(inds, individualsWithPhoto, nmdStatusByIndividual) }));
}

/**
 * Construit un petit graphe de parenté (parents/enfants) à partir des
 * individus et filiations déjà chargés par statsData.loadStatsBundle —
 * même interface minimale (getIndividual/getParents/getChildren) que
 * features/tree/useFamilyGraph.js, pour que completenessByGeneration
 * puisse l'utiliser sans second aller-retour Supabase ni dépendre du
 * graphe de l'onglet Arbre (dont les individus ne portent pas
 * birthPlaceId, nécessaire ici pour le critère "lieu de naissance").
 */
export function buildGenerationGraph(individuals, filiations) {
  const individualsById = new Map(individuals.map((i) => [i.id, i]));
  const parentsOf = new Map();
  const childrenOf = new Map();
  for (const f of filiations) {
    if (!parentsOf.has(f.childId)) parentsOf.set(f.childId, []);
    parentsOf.get(f.childId).push({ parentId: f.parentId });
    if (!childrenOf.has(f.parentId)) childrenOf.set(f.parentId, []);
    childrenOf.get(f.parentId).push(f.childId);
  }
  return {
    getIndividual: (id) => individualsById.get(id) || null,
    getParents: (id) => parentsOf.get(id) || [],
    getChildren: (id) => childrenOf.get(id) || [],
  };
}
