/**
 * Audit des règles en vigueur : repère les données enregistrées qui ne
 * sont plus permises par les règles actuelles, et propose la correction
 * quand elle est sûre.
 *
 *  - deceased_130 : une personne née il y a plus de 130 ans doit être
 *    « décédée ». Correction proposée : cocher la case (même effet que
 *    le trigger SQL, appliqué ici en bloc).
 *  - proof_birth / proof_death : une naissance ou un décès renseigné
 *    (date ou lieu) doit être rattaché à un acte, une mention marginale
 *    ou une information familiale. Pas de correction automatique : il
 *    faut une source, on renvoie vers la fiche.
 *  - proof_union : même règle pour les jalons d'une union (début,
 *    mariage, divorce).
 *
 * Fonctions pures, testées (les corrections en base sont dans ruleAuditFixes.js).
 */
import { bornMoreThanYearsAgo, DECEASED_AFTER_YEARS } from '../../lib/utils/deceasedRule.js';

const UNION_PROOF_EVENTS = { union_start: 'du début de l\'union', marriage: 'du mariage', divorce: 'du divorce' };

const fullName = (ind) => `${ind?.firstNames || ''} ${ind?.lastName || ''}`.trim() || 'Personne inconnue';

/**
 * @param {object} data
 * @param {Array} data.individuals  fiches (format statsData : birthDate, birthPlaceId, deathDate, deathPlaceId, isDeceased)
 * @param {Array} data.events       événements (format statsData : subjectKind, subjectId, eventType, date, placeId)
 * @param {Array} data.citations    citations (format statsData : eventId)
 * @param {Map}   data.partnersByUnion  union id -> ids des partenaires
 * @param {Date}  [data.now]
 * @returns {Array<{id, kind, fixable, individualIds, link, message}>}
 */
export function planRuleAudit({ individuals = [], events = [], citations = [], partnersByUnion = new Map(), now = new Date() }) {
  const cited = new Set(citations.map((c) => c.eventId).filter(Boolean));
  const eventFor = new Map();
  for (const e of events) eventFor.set(`${e.subjectKind}|${e.subjectId}|${e.eventType}`, e);
  const proved = (kind, id, type) => {
    const ev = eventFor.get(`${kind}|${id}|${type}`);
    return !!ev && cited.has(ev.id);
  };
  const findings = [];

  for (const ind of individuals) {
    const name = fullName(ind);
    const link = `/individus/${ind.id}`;

    if (!ind.isDeceased && bornMoreThanYearsAgo(ind.birthDate, DECEASED_AFTER_YEARS, now)) {
      findings.push({
        id: `deceased_130:${ind.id}`, kind: 'deceased_130', fixable: true, individualIds: [ind.id], link,
        message: `${name} : né(e) il y a plus de ${DECEASED_AFTER_YEARS} ans, mais pas marqué(e) « décédé(e) ».`,
      });
    }

    if ((ind.birthDate || ind.birthPlaceId) && !proved('individual', ind.id, 'birth')) {
      findings.push({
        id: `proof_birth:${ind.id}`, kind: 'proof_birth', fixable: false, individualIds: [ind.id], link,
        message: `${name} : la naissance est renseignée sans acte, mention ou information familiale rattaché.`,
      });
    }

    if (ind.isDeceased && (ind.deathDate || ind.deathPlaceId) && !proved('individual', ind.id, 'death')) {
      findings.push({
        id: `proof_death:${ind.id}`, kind: 'proof_death', fixable: false, individualIds: [ind.id], link,
        message: `${name} : le décès est renseigné sans acte, mention ou information familiale rattaché.`,
      });
    }
  }

  for (const e of events) {
    if (e.subjectKind !== 'union' || !(e.eventType in UNION_PROOF_EVENTS)) continue;
    if (!(e.date || e.placeId) || cited.has(e.id)) continue;
    const individualIds = partnersByUnion.get(e.subjectId) || [];
    findings.push({
      id: `proof_union:${e.id}`, kind: 'proof_union', fixable: false, individualIds,
      link: individualIds[0] ? `/individus/${individualIds[0]}` : null,
      message: `Union : la date ou le lieu ${UNION_PROOF_EVENTS[e.eventType]} est renseigné(e) sans acte ni information familiale rattaché(e).`,
    });
  }

  return findings;
}

export const RULE_KIND_LABELS = {
  deceased_130: 'Décédé(e) non coché(e) (né(e) il y a plus de 130 ans)',
  proof_birth: 'Naissance sans preuve',
  proof_death: 'Décès sans preuve',
  proof_union: 'Union sans preuve',
};

