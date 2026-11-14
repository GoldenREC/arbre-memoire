import { describe, it, expect } from 'vitest';
import { computeNmdStatus } from './nmdStatus.js';
import { splitName } from './IndividualPicker.jsx';

const individual = { id: 'ind-1', firstNames: 'Jean', lastName: 'Dupont' };

describe('splitName', () => {
  it('sépare le dernier mot comme nom, le reste comme prénoms', () => {
    expect(splitName('Jean Pierre Dupont')).toEqual({ firstNames: 'Jean Pierre', lastName: 'Dupont' });
  });

  it('traite un mot unique comme un nom de famille, sans prénom', () => {
    expect(splitName('Dupont')).toEqual({ firstNames: '', lastName: 'Dupont' });
  });

  it('ignore les espaces superflus', () => {
    expect(splitName('  Marie   Curie  ')).toEqual({ firstNames: 'Marie', lastName: 'Curie' });
  });

  it('renvoie des chaînes vides pour une saisie vide', () => {
    expect(splitName('')).toEqual({ firstNames: '', lastName: '' });
  });
});

describe('computeNmdStatus', () => {
  it('ignore un acte sans média (citation sans image réellement jointe)', () => {
    const events = [{ id: 'ev-birth', origin: 'individual', eventType: 'birth' }];
    const citations = [{ eventId: 'ev-birth', hasMedia: false }];
    const status = computeNmdStatus({ individual, unions: [], events, citations });
    expect(status.birth.eventId).toBe('ev-birth');
    expect(status.birth.hasAct).toBe(false);
  });

  it('valide la pastille naissance dès qu\'une citation avec média cite l\'événement', () => {
    const events = [{ id: 'ev-birth', origin: 'individual', eventType: 'birth', proofLevel: 'proven_original' }];
    const citations = [{ eventId: 'ev-birth', hasMedia: true }];
    const status = computeNmdStatus({ individual, unions: [], events, citations });
    expect(status.birth.hasAct).toBe(true);
    expect(status.birth.proofLevel).toBe('proven_original');
  });

  it('retourne un statut vide (pas d\'option) pour le mariage sans aucune union', () => {
    const status = computeNmdStatus({ individual, unions: [], events: [], citations: [] });
    expect(status.marriage.options).toHaveLength(0);
    expect(status.marriage.hasAct).toBe(false);
  });

  it('propose une option de mariage par union, et agrège hasAct sur la première union prouvée', () => {
    const unions = [
      { id: 'union-1', partner: { firstNames: 'Marie', lastName: 'Martin' } },
      { id: 'union-2', partner: { firstNames: 'Alice', lastName: 'Durand' } },
    ];
    const events = [
      { id: 'ev-m1', origin: 'union', eventType: 'marriage', unionId: 'union-1', proofLevel: 'probable' },
    ];
    const citations = [{ eventId: 'ev-m1', hasMedia: true }];
    const status = computeNmdStatus({ individual, unions, events, citations });
    expect(status.marriage.options).toHaveLength(2);
    expect(status.marriage.options[0].hasAct).toBe(true);
    expect(status.marriage.options[1].eventId).toBeNull();
    expect(status.marriage.options[1].hasAct).toBe(false);
    expect(status.marriage.hasAct).toBe(true); // vrai dès qu'une union au moins a un acte validé
  });

  it('ne rattache jamais l\'acte de décès à l\'acte de naissance même si les deux événements existent', () => {
    const events = [
      { id: 'ev-birth', origin: 'individual', eventType: 'birth' },
      { id: 'ev-death', origin: 'individual', eventType: 'death' },
    ];
    const citations = [{ eventId: 'ev-birth', hasMedia: true }];
    const status = computeNmdStatus({ individual, unions: [], events, citations });
    expect(status.birth.hasAct).toBe(true);
    expect(status.death.hasAct).toBe(false);
    expect(status.death.eventId).toBe('ev-death');
  });
});
