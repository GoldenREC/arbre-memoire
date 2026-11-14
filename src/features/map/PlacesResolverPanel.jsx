import { useEffect, useMemo, useState } from 'react';
import { groupPlacesByHierarchy, countCities } from './placeHierarchy.js';
import {
  listHistoricalAliases, createHistoricalAlias, deleteHistoricalAlias,
  geocodePlace, geocodeAllPendingPlaces, setPlaceCoordinatesManually,
} from '../../lib/geo/geocoder.js';
import { STARTER_HISTORICAL_ALIASES } from '../../lib/geo/starterHistoricalAliases.js';

const STATUS_LABELS = {
  pending: { label: 'À géocoder', className: 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300' },
  ok: { label: 'Résolu', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
  manual: { label: 'Saisi à la main', className: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300' },
  failed: { label: 'Non trouvé', className: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
};

/**
 * Panneau latéral "Lieux à résoudre" : géocodage des lieux (manuel ou
 * en masse via Nominatim), saisie manuelle de coordonnées pour les cas
 * en échec, et gestion de la table de correspondances historiques
 * (toponymes disparus/renommés) consultée en priorité par le
 * géocodeur.
 */
export default function PlacesResolverPanel({ treeId, places, eventCountByPlaceId, canEdit, onPlacesChanged, onClose, onFocusPlace }) {
  const [tab, setTab] = useState('geocoded'); // geocoded | places | aliases
  const [busyAll, setBusyAll] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [manualEditId, setManualEditId] = useState(null);
  const [manualForm, setManualForm] = useState({ latitude: '', longitude: '', country: '', region: '' });

  const [aliases, setAliases] = useState([]);
  const [aliasForm, setAliasForm] = useState({ pattern: '', yearStart: '', yearEnd: '', canonicalLabel: '', latitude: '', longitude: '', country: '', region: '', notes: '' });

  useEffect(() => {
    if (tab === 'aliases') listHistoricalAliases(treeId).then(setAliases);
  }, [tab, treeId]);

  const unresolved = places.filter((p) => p.geocode_status === 'pending' || p.geocode_status === 'failed');
  const resolved = places.filter((p) => p.geocode_status === 'ok' || p.geocode_status === 'manual');
  const hierarchy = useMemo(() => groupPlacesByHierarchy(places, eventCountByPlaceId), [places, eventCountByPlaceId]);
  const cityCount = countCities(hierarchy);

  async function handleGeocodeOne(place) {
    setBusyId(place.id);
    try {
      await geocodePlace(place, { aliases: tab === 'aliases' ? aliases : await listHistoricalAliases(treeId) });
      onPlacesChanged();
    } finally {
      setBusyId(null);
    }
  }

  async function handleGeocodeAll() {
    setBusyAll(true);
    try {
      await geocodeAllPendingPlaces(treeId, { includeFailedRetries: true });
      onPlacesChanged();
    } finally {
      setBusyAll(false);
    }
  }

  function openManualForm(place) {
    setManualEditId(place.id);
    setManualForm({ latitude: place.latitude ?? '', longitude: place.longitude ?? '', country: place.country || '', region: place.region || '' });
  }

  async function handleSaveManual(e) {
    e.preventDefault();
    await setPlaceCoordinatesManually(manualEditId, {
      latitude: parseFloat(manualForm.latitude),
      longitude: parseFloat(manualForm.longitude),
      country: manualForm.country,
      region: manualForm.region,
    });
    setManualEditId(null);
    onPlacesChanged();
  }

  async function handleCreateAlias(e) {
    e.preventDefault();
    await createHistoricalAlias(treeId, {
      ...aliasForm,
      yearStart: aliasForm.yearStart ? Number(aliasForm.yearStart) : null,
      yearEnd: aliasForm.yearEnd ? Number(aliasForm.yearEnd) : null,
      latitude: parseFloat(aliasForm.latitude),
      longitude: parseFloat(aliasForm.longitude),
    });
    setAliasForm({ pattern: '', yearStart: '', yearEnd: '', canonicalLabel: '', latitude: '', longitude: '', country: '', region: '', notes: '' });
    setAliases(await listHistoricalAliases(treeId));
  }

  async function handleDeleteAlias(id) {
    await deleteHistoricalAlias(id);
    setAliases(await listHistoricalAliases(treeId));
  }

  async function handleImportStarter() {
    for (const a of STARTER_HISTORICAL_ALIASES) {
      await createHistoricalAlias(treeId, a);
    }
    setAliases(await listHistoricalAliases(treeId));
  }

  return (
    <div className="flex h-full w-80 flex-col border-l border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
      <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-3 dark:border-neutral-800">
        <h2 className="text-sm font-semibold">Lieux</h2>
        <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200">✕</button>
      </div>

      <div className="flex gap-1 border-b border-neutral-100 px-3 pt-2 dark:border-neutral-800">
        {[{ key: 'geocoded', label: `Communes (${cityCount})` }, { key: 'places', label: `À résoudre (${unresolved.length})` }, { key: 'aliases', label: 'Correspondances' }].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 px-2 py-1.5 text-xs font-medium ${tab === t.key ? 'border-accent-600 text-accent-700 dark:text-accent-400' : 'border-transparent text-neutral-500'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-3 text-sm">
        {tab === 'geocoded' && (
          <div className="space-y-1 text-sm">
            {hierarchy.length === 0 && <p className="text-xs text-neutral-400">Aucun lieu géocodé pour l'instant.</p>}
            {hierarchy.map((country) => (
              <details key={country.name} open={hierarchy.length <= 3}>
                <summary className="cursor-pointer py-1 font-medium">{country.name} <span className="text-xs font-normal text-neutral-400">({country.count})</span></summary>
                <div className="ml-3 border-l border-neutral-200 pl-2 dark:border-neutral-800">
                  {country.regions.map((region) => (
                    <details key={region.name}>
                      <summary className="cursor-pointer py-0.5">{region.name} <span className="text-xs text-neutral-400">({region.count})</span></summary>
                      <div className="ml-3 border-l border-neutral-200 pl-2 dark:border-neutral-800">
                        {region.departments.map((department) => (
                          <details key={department.name}>
                            <summary className="cursor-pointer py-0.5 text-neutral-600 dark:text-neutral-300">{department.name} <span className="text-xs text-neutral-400">({department.count})</span></summary>
                            <ul className="ml-3 border-l border-neutral-200 pl-2 dark:border-neutral-800">
                              {department.cities.map((city) => (
                                <li key={city.name}>
                                  <button
                                    onClick={() => onFocusPlace?.(city.point)}
                                    className="w-full py-0.5 text-left text-xs text-accent-600 hover:underline dark:text-accent-400"
                                    title="Centrer la carte sur cette commune"
                                  >
                                    {city.name} <span className="text-neutral-400">({city.count})</span>
                                  </button>
                                </li>
                              ))}
                            </ul>
                          </details>
                        ))}
                      </div>
                    </details>
                  ))}
                </div>
              </details>
            ))}
            {hierarchy.length > 0 && <p className="pt-2 text-[11px] text-neutral-400">Entre parenthèses : nombre d'événements. Clique sur une commune pour y centrer la carte.</p>}
          </div>
        )}
        {tab === 'geocoded' ? null : tab === 'places' ? (
          <div className="space-y-3">
            {canEdit && unresolved.length > 0 && (
              <button
                onClick={handleGeocodeAll}
                disabled={busyAll}
                className="w-full rounded-lg bg-accent-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-700 disabled:opacity-60"
              >
                {busyAll ? 'Géocodage en cours…' : `Géocoder les ${unresolved.length} lieux en attente`}
              </button>
            )}
            {unresolved.length === 0 && <p className="text-xs text-neutral-400">Tous les lieux sont résolus 🎉</p>}
            <ul className="space-y-2">
              {unresolved.map((p) => (
                <li key={p.id} className="rounded-lg border border-neutral-200 p-2 dark:border-neutral-800">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs">{p.raw_label}</span>
                    <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] ${STATUS_LABELS[p.geocode_status]?.className}`}>
                      {STATUS_LABELS[p.geocode_status]?.label}
                    </span>
                  </div>
                  {canEdit && (
                    <div className="mt-1.5 flex gap-2 text-[11px]">
                      <button disabled={busyId === p.id} onClick={() => handleGeocodeOne(p)} className="text-accent-600 hover:underline disabled:opacity-60">
                        {busyId === p.id ? 'Géocodage…' : 'Géocoder'}
                      </button>
                      <button onClick={() => openManualForm(p)} className="text-neutral-500 hover:underline">
                        Saisir manuellement
                      </button>
                    </div>
                  )}
                  {manualEditId === p.id && (
                    <form onSubmit={handleSaveManual} className="mt-2 space-y-1.5 border-t border-neutral-100 pt-2 dark:border-neutral-800">
                      <div className="grid grid-cols-2 gap-1.5">
                        <input required type="number" step="any" placeholder="Latitude" value={manualForm.latitude} onChange={(e) => setManualForm((f) => ({ ...f, latitude: e.target.value }))} className="field text-xs" />
                        <input required type="number" step="any" placeholder="Longitude" value={manualForm.longitude} onChange={(e) => setManualForm((f) => ({ ...f, longitude: e.target.value }))} className="field text-xs" />
                      </div>
                      <div className="grid grid-cols-2 gap-1.5">
                        <input placeholder="Pays" value={manualForm.country} onChange={(e) => setManualForm((f) => ({ ...f, country: e.target.value }))} className="field text-xs" />
                        <input placeholder="Région" value={manualForm.region} onChange={(e) => setManualForm((f) => ({ ...f, region: e.target.value }))} className="field text-xs" />
                      </div>
                      <div className="flex gap-2">
                        <button type="submit" className="rounded bg-accent-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-accent-700">Enregistrer</button>
                        <button type="button" onClick={() => setManualEditId(null)} className="text-[11px] text-neutral-500">Annuler</button>
                      </div>
                    </form>
                  )}
                </li>
              ))}
            </ul>
            {resolved.length > 0 && (
              <p className="pt-2 text-[11px] text-neutral-400">{resolved.length} lieu(x) déjà résolu(s).</p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {canEdit && (
              <button onClick={handleImportStarter} className="w-full rounded-lg border border-accent-600 px-3 py-1.5 text-xs font-medium text-accent-700 hover:bg-accent-50 dark:text-accent-400 dark:hover:bg-accent-950">
                Importer les exemples de départ
              </button>
            )}
            <ul className="space-y-2">
              {aliases.map((a) => (
                <li key={a.id} className="rounded-lg border border-neutral-200 p-2 text-xs dark:border-neutral-800">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">« {a.pattern} »</span>
                    {canEdit && (
                      <button onClick={() => handleDeleteAlias(a.id)} className="text-red-500 hover:underline">Suppr.</button>
                    )}
                  </div>
                  <div className="text-neutral-500">{a.canonical_label}</div>
                  <div className="text-neutral-400">
                    {a.year_start || a.year_end ? `${a.year_start ?? '…'} – ${a.year_end ?? '…'}` : 'Toute période'}
                  </div>
                </li>
              ))}
              {aliases.length === 0 && <p className="text-xs text-neutral-400">Aucune correspondance historique pour l'instant.</p>}
            </ul>

            {canEdit && (
              <form onSubmit={handleCreateAlias} className="space-y-1.5 border-t border-neutral-100 pt-3 dark:border-neutral-800">
                <p className="text-[11px] font-medium text-neutral-500">+ Ajouter une correspondance</p>
                <input required placeholder="Motif (ex: strasbourg)" value={aliasForm.pattern} onChange={(e) => setAliasForm((f) => ({ ...f, pattern: e.target.value }))} className="field text-xs" />
                <input required placeholder="Libellé moderne" value={aliasForm.canonicalLabel} onChange={(e) => setAliasForm((f) => ({ ...f, canonicalLabel: e.target.value }))} className="field text-xs" />
                <div className="grid grid-cols-2 gap-1.5">
                  <input type="number" placeholder="Année début" value={aliasForm.yearStart} onChange={(e) => setAliasForm((f) => ({ ...f, yearStart: e.target.value }))} className="field text-xs" />
                  <input type="number" placeholder="Année fin" value={aliasForm.yearEnd} onChange={(e) => setAliasForm((f) => ({ ...f, yearEnd: e.target.value }))} className="field text-xs" />
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <input required type="number" step="any" placeholder="Latitude" value={aliasForm.latitude} onChange={(e) => setAliasForm((f) => ({ ...f, latitude: e.target.value }))} className="field text-xs" />
                  <input required type="number" step="any" placeholder="Longitude" value={aliasForm.longitude} onChange={(e) => setAliasForm((f) => ({ ...f, longitude: e.target.value }))} className="field text-xs" />
                </div>
                <input placeholder="Notes (source de l'information)" value={aliasForm.notes} onChange={(e) => setAliasForm((f) => ({ ...f, notes: e.target.value }))} className="field text-xs" />
                <button type="submit" className="w-full rounded bg-accent-600 px-2 py-1.5 text-[11px] font-medium text-white hover:bg-accent-700">Ajouter</button>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
