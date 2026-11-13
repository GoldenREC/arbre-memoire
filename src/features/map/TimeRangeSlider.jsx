import { useState } from 'react';

const STEP_OPTIONS = [
  { value: 1, label: 'Année' },
  { value: 10, label: 'Décennie' },
  { value: 100, label: 'Siècle' },
];

/**
 * Frise temporelle : deux curseurs (borne basse / borne haute) pour
 * filtrer dynamiquement les événements affichés sur la carte selon une
 * période. Le pas (année / décennie / siècle) ne change que la
 * granularité des curseurs, pas la précision du filtrage réel (toujours
 * à l'année près côté données).
 */
export default function TimeRangeSlider({ min, max, value, onChange }) {
  const [step, setStep] = useState(10);
  const [from, to] = value;

  function clamp(v) {
    return Math.min(Math.max(v, min), max);
  }

  function setFrom(v) {
    const next = clamp(Number(v));
    onChange([Math.min(next, to), to]);
  }
  function setTo(v) {
    const next = clamp(Number(v));
    onChange([from, Math.max(next, from)]);
  }

  if (min >= max) return null;

  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-neutral-600 dark:text-neutral-300">
          {from} — {to}
        </span>
        <div className="flex gap-1">
          {STEP_OPTIONS.map((s) => (
            <button
              key={s.value}
              onClick={() => setStep(s.value)}
              className={`rounded px-1.5 py-0.5 ${step === s.value ? 'bg-accent-600 text-white' : 'text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'}`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="w-10 text-right text-[10px] text-neutral-400">{min}</span>
        <input type="range" min={min} max={max} step={step} value={from} onChange={(e) => setFrom(e.target.value)} className="flex-1 accent-accent-600" />
        <span className="w-10 text-[10px] text-neutral-400">{max}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="w-10 text-right text-[10px] text-neutral-400">{min}</span>
        <input type="range" min={min} max={max} step={step} value={to} onChange={(e) => setTo(e.target.value)} className="flex-1 accent-accent-600" />
        <span className="w-10 text-[10px] text-neutral-400">{max}</span>
      </div>
    </div>
  );
}
