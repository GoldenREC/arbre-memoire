import { jsPDF } from 'jspdf';
import { fetchTreeSnapshot, placeLabel } from './fetchTreeSnapshot.js';
import { formatGenealogyDate } from '../utils/dates.js';
import { isPrivacyProtected, maskIndividual } from '../utils/privacy.js';
import { todayStamp } from './downloadHelpers.js';

const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const MARGIN = 20;

function fullName(ind) {
  return `${ind.firstNames || ''} ${ind.lastName || ''}`.trim() || 'Sans nom';
}

/**
 * Génère un livret familial synthétique : page de couverture, puis une
 * fiche par individu (ordre alphabétique) avec état civil, filiation et
 * union(s) résumées. Reçoit déjà un instantané (fetchTreeSnapshot) pour
 * rester réutilisable/testable indépendamment de la récupération réseau.
 */
export function renderFamilyBooklet(snapshot, { title = 'Livret familial', maskLiving = true, privacyThresholdYears } = {}) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const thresholdYears = privacyThresholdYears ?? snapshot.privacyThresholdYears ?? 100;

  const parentsByChild = new Map();
  const childrenByParent = new Map();
  for (const f of snapshot.filiations) {
    if (!parentsByChild.has(f.childId)) parentsByChild.set(f.childId, []);
    parentsByChild.get(f.childId).push(f.parentId);
    if (!childrenByParent.has(f.parentId)) childrenByParent.set(f.parentId, []);
    childrenByParent.get(f.parentId).push(f.childId);
  }
  const unionsByIndividual = new Map();
  for (const u of snapshot.unions) {
    for (const p of u.partners) {
      if (!unionsByIndividual.has(p.individualId)) unionsByIndividual.set(p.individualId, []);
      unionsByIndividual.get(p.individualId).push(u);
    }
  }
  const individualsById = new Map(snapshot.individuals.map((i) => [i.id, i]));
  const nameOf = (id) => {
    const ind = individualsById.get(id);
    if (!ind) return 'Inconnu';
    return maskLiving && isPrivacyProtected(ind, thresholdYears) ? 'Personne vivante' : fullName(ind);
  };

  // Couverture
  doc.setFontSize(26);
  doc.text(title, PAGE_WIDTH / 2, 100, { align: 'center' });
  doc.setFontSize(11);
  doc.setTextColor(120);
  doc.text(`Généré le ${new Date().toLocaleDateString('fr-FR')} — ${snapshot.individuals.length} personnes`, PAGE_WIDTH / 2, 112, { align: 'center' });
  doc.setTextColor(0);

  const sorted = [...snapshot.individuals].sort((a, b) =>
    `${a.lastName || ''}${a.firstNames || ''}`.localeCompare(`${b.lastName || ''}${b.firstNames || ''}`)
  );

  for (const ind of sorted) {
    doc.addPage();
    let y = MARGIN;
    const masked = maskLiving && isPrivacyProtected(ind, thresholdYears);
    const display = masked ? maskIndividual(ind) : ind;

    doc.setFontSize(18);
    doc.text(fullName(display), MARGIN, y);
    y += 10;

    doc.setFontSize(11);
    doc.setTextColor(90);
    const sexLabel = { M: 'Masculin', F: 'Féminin', U: 'Non renseigné' }[ind.sex] || 'Non renseigné';
    doc.text(`Sexe : ${sexLabel}`, MARGIN, y);
    y += 7;
    doc.setTextColor(0);

    if (!masked) {
      doc.text(`Naissance : ${formatGenealogyDate({ date: ind.birthDate, datePrecision: ind.birthDatePrecision })}${ind.birthPlaceId ? ` — ${placeLabel(snapshot, ind.birthPlaceId)}` : ''}`, MARGIN, y);
      y += 7;
      if (ind.isDeceased || ind.deathDate) {
        doc.text(`Décès : ${formatGenealogyDate({ date: ind.deathDate, datePrecision: ind.deathDatePrecision })}${ind.deathPlaceId ? ` — ${placeLabel(snapshot, ind.deathPlaceId)}` : ''}`, MARGIN, y);
        y += 7;
      }
      if (ind.occupation) {
        doc.text(`Profession : ${ind.occupation}`, MARGIN, y);
        y += 7;
      }
    } else {
      doc.text('Informations masquées (personne vivante).', MARGIN, y);
      y += 7;
    }

    y += 3;
    const parentIds = parentsByChild.get(ind.id) || [];
    if (parentIds.length) {
      doc.setFont(undefined, 'bold');
      doc.text('Parents', MARGIN, y);
      doc.setFont(undefined, 'normal');
      y += 6;
      for (const pid of parentIds) {
        doc.text(`• ${nameOf(pid)}`, MARGIN + 4, y);
        y += 6;
      }
      y += 2;
    }

    const unions = unionsByIndividual.get(ind.id) || [];
    for (const u of unions) {
      const spouseIds = u.partners.map((p) => p.individualId).filter((id) => id !== ind.id);
      doc.setFont(undefined, 'bold');
      doc.text('Union', MARGIN, y);
      doc.setFont(undefined, 'normal');
      y += 6;
      doc.text(`• avec ${spouseIds.map(nameOf).join(', ') || 'conjoint inconnu'}`, MARGIN + 4, y);
      y += 6;
      if (u.startDate) {
        doc.text(`  ${formatGenealogyDate({ date: u.startDate, datePrecision: u.startDatePrecision })}`, MARGIN + 4, y);
        y += 6;
      }
      const childIds = (childrenByParent.get(ind.id) || []).filter((cid) =>
        spouseIds.length ? spouseIds.some((sid) => (childrenByParent.get(sid) || []).includes(cid)) : true
      );
      if (childIds.length) {
        doc.text(`  Enfants : ${childIds.map(nameOf).join(', ')}`, MARGIN + 4, y);
        y += 6;
      }
      y += 2;
    }

    doc.setFontSize(9);
    doc.setTextColor(150);
    doc.text(`${title} — page ${doc.internal.getNumberOfPages()}`, PAGE_WIDTH / 2, PAGE_HEIGHT - 10, { align: 'center' });
  }

  return doc;
}

export async function exportFamilyBooklet(treeId, options = {}) {
  const snapshot = await fetchTreeSnapshot(treeId);
  const doc = renderFamilyBooklet(snapshot, options);
  doc.save(`livret-familial-${todayStamp()}.pdf`);
  return { individualCount: snapshot.individuals.length };
}
