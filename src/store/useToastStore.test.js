import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useToastStore, pushToast, pushErrorToast } from './useToastStore.js';

beforeEach(() => {
  useToastStore.setState({ toasts: [] });
});

describe('useToastStore', () => {
  it('ajoute une confirmation de succès', () => {
    pushToast('Fiche enregistrée.');
    expect(useToastStore.getState().toasts).toHaveLength(1);
    expect(useToastStore.getState().toasts[0]).toMatchObject({ type: 'success', message: 'Fiche enregistrée.' });
  });

  it("ajoute une erreur avec un message par défaut si aucun n'est fourni", () => {
    pushErrorToast();
    expect(useToastStore.getState().toasts[0]).toMatchObject({ type: 'error' });
    expect(useToastStore.getState().toasts[0].message).toMatch(/erreur/i);
  });

  it('retire un toast par id', () => {
    const id = pushToast('Test');
    expect(useToastStore.getState().toasts).toHaveLength(1);
    useToastStore.getState().dismiss(id);
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it('se retire automatiquement après son délai', () => {
    vi.useFakeTimers();
    pushToast('Test');
    expect(useToastStore.getState().toasts).toHaveLength(1);
    vi.advanceTimersByTime(3000);
    expect(useToastStore.getState().toasts).toHaveLength(0);
    vi.useRealTimers();
  });

  it('garde une erreur affichée plus longtemps qu\'un succès', () => {
    vi.useFakeTimers();
    pushErrorToast('Oups');
    vi.advanceTimersByTime(3000);
    expect(useToastStore.getState().toasts).toHaveLength(1); // pas encore retirée
    vi.advanceTimersByTime(3000);
    expect(useToastStore.getState().toasts).toHaveLength(0);
    vi.useRealTimers();
  });
});
