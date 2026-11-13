import { useEffect, useState } from 'react';

/**
 * Palette de visualisation de données (distincte de l'accent indigo de
 * l'UI, réservé aux boutons/liens) : valeurs reprises telles quelles
 * d'une palette validée (séparation CVD >= 8 ΔE OKLab entre teintes
 * adjacentes, >= 15 ΔE en vision normale), choisies pour que deux
 * séries (ex. Hommes/Femmes, Naissances/Décès) restent distinguables
 * même en daltonisme. Jamais recalculées à l'oeil — voir le
 * commentaire sur chaque table de valeurs.
 */
export const CATEGORICAL = {
  light: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'],
  dark: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'],
};

/** Rampe séquentielle (une seule teinte, clair -> sombre) pour une magnitude unique (barres, jauges). */
export const SEQUENTIAL = {
  light: { 150: '#b7d3f6', 300: '#6da7ec', 450: '#2a78d6', 600: '#184f95' },
  dark: { 150: '#b7d3f6', 300: '#6da7ec', 450: '#3987e5', 600: '#184f95' },
};

/** Couleurs de statut (fixes, jamais réutilisées pour une série) — toujours accompagnées d'une icône + d'un texte, jamais seules. */
export const STATUS = {
  good: { light: '#0ca30c', dark: '#0ca30c', icon: '✓', label: 'OK' },
  warning: { light: '#fab219', dark: '#fab219', icon: '●', label: 'Faible' },
  serious: { light: '#ec835a', dark: '#ec835a', icon: '▲', label: 'Moyen' },
  critical: { light: '#d03b3b', dark: '#d03b3b', icon: '⬤', label: 'Élevé' },
};

export const GRID = { light: '#e1e0d9', dark: '#2c2c2a' };

/** Détecte le thème clair/sombre actuellement actif (classe `dark` sur `<html>`, posée par le toggle de l'app) et le suit en direct. */
export function useChartMode() {
  const [mode, setMode] = useState(() => (typeof document !== 'undefined' && document.documentElement.classList.contains('dark') ? 'dark' : 'light'));
  useEffect(() => {
    const target = document.documentElement;
    const observer = new MutationObserver(() => setMode(target.classList.contains('dark') ? 'dark' : 'light'));
    observer.observe(target, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);
  return mode;
}

export function severityStatus(severity) {
  if (severity === 'high') return STATUS.critical;
  if (severity === 'medium') return STATUS.serious;
  return STATUS.warning;
}
