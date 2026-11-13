import { jsPDF } from 'jspdf';
import { loadFamilyGraph } from '../../features/tree/useFamilyGraph.js';
import { buildPedigree } from '../../features/tree/buildPedigree.js';
import { isPrivacyProtected, maskIndividual } from '../utils/privacy.js';
import { formatGenealogyDate } from '../utils/dates.js';
import { todayStamp } from './downloadHelpers.js';

const PAGE_WIDTH = 297; // A4 paysage
const PAGE_HEIGHT = 210;
const MARGIN = 10;

/**
 * Dessine un arbre d'ascendance imprimable (pedigree chart) en PDF, en
 * réutilisant le même adressage binaire (génération, slotIndex) que les
 * vues web Ascendance/Éventail (voir features/tree/buildPedigree.js) —
 * garantit que le PDF correspond exactement à ce que montre l'écran.
 */
export function renderPedigreeChart(graph, rootId, maxGenerations, { maskLiving = true, privacyThresholdYears = 100 } = {}) {
  const clampedGenerations = Math.max(1, Math.min(6, maxGenerations));
  const { nodesBySlot, edges } = buildPedigree(graph, rootId, clampedGenerations);
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });

  const usableWidth = PAGE_WIDTH - MARGIN * 2;
  const usableHeight = PAGE_HEIGHT - MARGIN * 2;
  const colWidth = usableWidth / (clampedGenerations + 1);
  const boxWidth = colWidth - 6;

  function boxGeometry(generation, slotIndex) {
    const slotsInGen = 2 ** generation;
    const rowHeight = usableHeight / slotsInGen;
    const x = MARGIN + generation * colWidth;
    const y = MARGIN + slotIndex * rowHeight;
    const boxHeight = Math.min(rowHeight - 2, 20);
    return { x, y: y + (rowHeight - boxHeight) / 2, width: boxWidth, height: boxHeight, rowHeight };
  }

  // Connecteurs d'abord, pour qu'ils passent derrière les cases.
  doc.setDrawColor(200);
  for (const edge of edges) {
    const from = nodesBySlot.get(edge.from);
    const to = nodesBySlot.get(edge.to);
    if (!from || !to) continue;
    const fromBox = boxGeometry(from.generation, from.slotIndex);
    const toBox = boxGeometry(to.generation, to.slotIndex);
    const x1 = fromBox.x + fromBox.width;
    const y1 = fromBox.y + fromBox.height / 2;
    const x2 = toBox.x;
    const y2 = toBox.y + toBox.height / 2;
    const midX = (x1 + x2) / 2;
    doc.line(x1, y1, midX, y1);
    doc.line(midX, y1, midX, y2);
    doc.line(midX, y2, x2, y2);
  }

  for (const node of nodesBySlot.values()) {
    const { generation, slotIndex, individual } = node;
    const slotsInGen = 2 ** generation;
    const box = boxGeometry(generation, slotIndex);
    const fontSize = slotsInGen > 16 ? 5 : slotsInGen > 8 ? 6 : slotsInGen > 4 ? 7 : 9;

    doc.setDrawColor(180);
    doc.setFillColor(individual ? 250 : 245);
    doc.rect(box.x, box.y, box.width, box.height, individual ? 'FD' : 'D');

    if (individual) {
      const masked = maskLiving && isPrivacyProtected(individual, privacyThresholdYears);
      const display = masked ? maskIndividual(individual) : individual;
      doc.setFontSize(fontSize);
      doc.setTextColor(20);
      doc.text(`${display.firstNames || ''} ${display.lastName || ''}`.trim() || 'Sans nom', box.x + 2, box.y + fontSize / 2 + 2, { maxWidth: box.width - 4 });
      if (!masked && box.height > 8) {
        doc.setFontSize(Math.max(fontSize - 1, 4));
        doc.setTextColor(130);
        const birthLabel = formatGenealogyDate({ date: individual.birthDate, datePrecision: individual.birthDatePrecision });
        doc.text(birthLabel, box.x + 2, box.y + box.height - 2, { maxWidth: box.width - 4 });
        doc.setTextColor(0);
      }
    }
  }

  const rootIndividual = graph.getIndividual(rootId);
  doc.setFontSize(10);
  doc.setTextColor(0);
  doc.text(
    `Ascendance de ${rootIndividual ? `${rootIndividual.firstNames || ''} ${rootIndividual.lastName || ''}`.trim() : ''} — ${clampedGenerations} générations`,
    MARGIN,
    PAGE_HEIGHT - 4
  );

  return doc;
}

export async function exportPedigreeChart(treeId, rootId, maxGenerations = 4, options = {}) {
  const graph = await loadFamilyGraph(treeId);
  const doc = renderPedigreeChart(graph, rootId, maxGenerations, options);
  doc.save(`arbre-ascendance-${todayStamp()}.pdf`);
}
