import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';

import { useAuthStore } from '../../store/useAuthStore.js';
import { fetchMapEvents, fetchPlacesWithStatus, buildIndividualPath, EVENT_FILTERS } from './mapData.js';
import { MAP_CATEGORIES, categoryOf, pathColorAt } from './eventTypeStyles.js';
import { PROOF_LEVEL_LABELS, proofLevelBadgeClass, proofLevelHex } from '../../lib/utils/proofLevel.js';
import { EVENT_TYPE_LABELS } from '../individual/EventForm.jsx';
import { formatGenealogyDate } from '../../lib/utils/dates.js';
import TimeRangeSlider from './TimeRangeSlider.jsx';
import PlacesResolverPanel from './PlacesResolverPanel.jsx';
import EventQuickEditPanel from './EventQuickEditPanel.jsx';
import IndividualPicker from '../individual/IndividualPicker.jsx';
import { geocodeAllPendingPlaces, GEOCODE_PRECISION_LABELS, isApproximateGeocodePrecision } from '../../lib/geo/geocoder.js';
import { pushErrorToast } from '../../store/useToastStore.js';

const DEFAULT_CENTER = [46.6, 2.5]; // France — utilisé seulement avant le premier chargement de données
const DEFAULT_ZOOM = 5;

// La couleur de fond identifie la catégorie d'événement (naissance,
// décès...) ; la bordure reprend la couleur de l'indice de preuve — un
// marqueur donne donc les deux informations d'un coup d'œil, sans
// attendre l'ouverture de l'infobulle. Un pin "approximatif" (lieu
// résolu au département/région/pays seulement, voir
// isApproximateGeocodePrecision) est en plus cerclé en pointillés et
// légèrement transparent : contrairement à une commune, qui reste une
// précision tout à fait normale pour un acte généalogique, ce niveau
// peut être très loin du lieu réel.
function markerIcon(color, icon, borderColor, approximate) {
  const borderStyle = approximate ? 'dashed' : 'solid';
  const opacity = approximate ? 0.65 : 1;
  return L.divIcon({
    className: 'arbre-map-marker',
    html: `<div style="background:${color};width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 4px rgba(0,0,0,0.4);border:3px ${borderStyle} ${borderColor};opacity:${opacity};font-size:13px;line-height:1;">${icon}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -13],
  });
}

/** Centre la carte sur un point choisi dans le panneau des lieux. */
function FlyTo({ target }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo([target.latitude, target.longitude], 12, { duration: 0.8 });
  }, [target, map]);
  return null;
}

function FitBounds({ points }) {
  const map = useMap();
  useEffect(() => {
    if (!points.length) return;
    if (points.length === 1) {
      map.setView([points[0].latitude, points[0].longitude], 8);
      return;
    }
    const bounds = L.latLngBounds(points.map((p) => [p.latitude, p.longitude]));
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 10 });
    // Un seul ajustement automatique au premier chargement : l'utilisateur
    // garde ensuite le contrôle du zoom/pan sans que la carte ne "saute".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

/**
 * Carte interactive de l'arbre : chaque événement géolocalisé (avec un
 * lieu résolu en coordonnées, voir lib/geo/geocoder.js) apparaît comme
 * un marqueur, regroupé en grappes au dézoom. Filtres par catégorie,
 * frise temporelle, chemins de migration par personne, et indice de
 * preuve visible dans chaque infobulle.
 */
export default function WorldMapView() {
  const { currentTreeId, role, privacyThresholdYears } = useAuthStore();
  const canEdit = role === 'admin';

  const [events, setEvents] = useState([]);
  const [places, setPlaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('all');
  const [yearRange, setYearRange] = useState(null);
  const [pathPeople, setPathPeople] = useState([]); // [{id, name}]
  const [showResolver, setShowResolver] = useState(false);
  const [editingEventId, setEditingEventId] = useState(null);
  const [resolving, setResolving] = useState(false);
  const [resolveProgress, setResolveProgress] = useState(null); // { index, total }
  const [searchParams] = useSearchParams();

  // Permet de pré-sélectionner un parcours de vie depuis l'extérieur
  // (ex: onglet "Photos & animaux" d'une fiche individu, qui pointe
  // ici vers /carte?individual=<id>&name=<nom>) sans dupliquer le
  // traçage de chemins de migration déjà construit pour cette carte.
  useEffect(() => {
    const id = searchParams.get('individual');
    if (!id) return;
    setPathPeople((prev) => (prev.some((p) => p.id === id) ? prev : [...prev, { id, name: searchParams.get('name') || 'Personne' }]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // `silent` : recharge les données sans démonter la carte (zoom et position conservés).
  async function reload({ silent = false } = {}) {
    if (!currentTreeId) return;
    if (!silent) setLoading(true);
    const [ev, pl] = await Promise.all([
      fetchMapEvents(currentTreeId, role, privacyThresholdYears),
      fetchPlacesWithStatus(currentTreeId),
    ]);
    setEvents(ev);
    setPlaces(pl);
    const years = ev.map((e) => e.year).filter(Boolean);
    if (years.length) setYearRange((prev) => prev || [Math.min(...years), Math.max(...years)]);
    setLoading(false);
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTreeId]);

  /**
   * Après un import GEDCOM, les lieux sont créés sans coordonnées
   * (geocode_status "pending") : rien n'apparaît sur la carte tant
   * qu'ils n'ont pas été résolus. Plutôt que de laisser une carte vide
   * sans explication, ce bouton lance la résolution en masse
   * directement depuis la carte (même logique que le panneau "Lieux à
   * résoudre"), avec un retour de progression — Nominatim est limité à
   * ~1 requête/seconde, la résolution de beaucoup de lieux prend donc
   * plusieurs minutes.
   */
  async function handleResolveAll() {
    setResolving(true);
    setResolveProgress({ index: 0, total: unresolvedCount });
    try {
      await geocodeAllPendingPlaces(currentTreeId, {
        includeFailedRetries: true,
        onProgress: (p) => setResolveProgress(p),
      });
      await reload();
    } catch (err) {
      pushErrorToast(err.message);
    } finally {
      setResolving(false);
      setResolveProgress(null);
    }
  }

  const yearBounds = useMemo(() => {
    const years = events.map((e) => e.year).filter(Boolean);
    if (!years.length) return [1500, new Date().getFullYear()];
    return [Math.min(...years), Math.max(...years)];
  }, [events]);

  const filteredEvents = useMemo(() => {
    const types = EVENT_FILTERS[category]?.types;
    return events.filter((e) => {
      if (types && !types.includes(e.eventType)) return false;
      if (yearRange && e.year != null && (e.year < yearRange[0] || e.year > yearRange[1])) return false;
      if (yearRange && e.year == null) return false;
      return true;
    });
  }, [events, category, yearRange]);

  const paths = useMemo(
    () => pathPeople.map((p, i) => ({ person: p, color: pathColorAt(i), points: buildIndividualPath(events, p.id) })),
    [pathPeople, events]
  );

  const [focusTarget, setFocusTarget] = useState(null);
  const editingEvent = editingEventId ? events.find((e) => e.id === editingEventId) || null : null;
  const eventCountByPlaceId = useMemo(() => {
    const counts = new Map();
    for (const e of events) if (e.placeId) counts.set(e.placeId, (counts.get(e.placeId) || 0) + 1);
    return counts;
  }, [events]);

  const unresolvedCount = places.filter((p) => p.geocode_status === 'pending' || p.geocode_status === 'failed').length;

  return (
    <div className="flex h-[calc(100vh-7rem)] gap-0">
      <div className="flex flex-1 flex-col gap-3">
        <div className="flex flex-wrap items-start gap-3">
          <div className="flex gap-1.5">
            {Object.entries(EVENT_FILTERS).map(([key, def]) => (
              <button
                key={key}
                onClick={() => setCategory(key)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium ${category === key ? 'bg-accent-600 text-white' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300'}`}
              >
                {key !== 'all' && MAP_CATEGORIES[key] && <span className="mr-1">{MAP_CATEGORIES[key].icon}</span>}
                {def.label}
              </button>
            ))}
          </div>

          {yearRange && <TimeRangeSlider min={yearBounds[0]} max={yearBounds[1]} value={yearRange} onChange={setYearRange} />}

          <button
            onClick={() => setShowResolver((v) => !v)}
            className="ml-auto rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            Lieux{unresolvedCount > 0 ? ` (${unresolvedCount} à résoudre)` : ''}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-neutral-500 dark:text-neutral-400">Chemins de migration :</span>
          <div className="relative z-[1100] w-64">
            <IndividualPicker
              treeId={currentTreeId}
              excludeIds={pathPeople.map((p) => p.id)}
              placeholder="Ajouter une personne…"
              onSelect={(r) => setPathPeople((prev) => [...prev, { id: r.id, name: `${r.first_names || ''} ${r.last_name || ''}`.trim() }])}
            />
          </div>
          {pathPeople.map((p, i) => (
            <span key={p.id} className="flex items-center gap-1 rounded-full px-2 py-1" style={{ backgroundColor: `${pathColorAt(i)}22`, color: pathColorAt(i) }}>
              {p.name}
              <button onClick={() => setPathPeople((prev) => prev.filter((x) => x.id !== p.id))} className="hover:opacity-70">✕</button>
            </span>
          ))}
        </div>

        <div className="relative flex-1 overflow-hidden rounded-xl border border-neutral-200 dark:border-neutral-800">
          {loading ? (
            <div className="flex h-full items-center justify-center text-sm text-neutral-400">Chargement de la carte…</div>
          ) : (
            <MapContainer center={DEFAULT_CENTER} zoom={DEFAULT_ZOOM} scrollWheelZoom className="h-full w-full">
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <FitBounds points={filteredEvents.length ? filteredEvents : events} />
              <FlyTo target={focusTarget} />

              <MarkerClusterGroup chunkedLoading>
                {filteredEvents.map((e) => {
                  const cat = categoryOf(e.eventType);
                  const def = MAP_CATEGORIES[cat];
                  const approximate = isApproximateGeocodePrecision(e.geocodePrecision);
                  return (
                    <Marker key={e.id} position={[e.latitude, e.longitude]} icon={markerIcon(def.color, def.icon, proofLevelHex(e.proofLevel), approximate)}>
                      <Popup>
                        <div className="min-w-[180px] text-xs">
                          <div className="mb-1 font-semibold">{e.label || EVENT_TYPE_LABELS[e.eventType] || e.eventType}</div>
                          <div className="text-neutral-500">{e.placeLabel}</div>
                          {e.date && <div className="text-neutral-500">{formatGenealogyDate({ date: e.date, datePrecision: e.datePrecision })}</div>}
                          <ul className="mt-1 space-y-0.5">
                            {e.people.map((p) => <li key={p.id}><Link to={`/individus/${p.id}`} title="Ouvrir la fiche">{p.name}</Link></li>)}
                          </ul>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {e.proofLevel && (
                              <span className={`inline-block rounded-full px-1.5 py-0.5 text-[10px] ${proofLevelBadgeClass(e.proofLevel)}`}>
                                {PROOF_LEVEL_LABELS[e.proofLevel]}
                              </span>
                            )}
                            {e.geocodePrecision && (
                              <span className={`inline-block rounded-full px-1.5 py-0.5 text-[10px] ${approximate ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' : 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400'}`}>
                                {approximate ? '≈ ' : ''}{GEOCODE_PRECISION_LABELS[e.geocodePrecision] || e.geocodePrecision}
                              </span>
                            )}
                          </div>
                          {canEdit && (
                            <button
                              onClick={() => setEditingEventId(e.id)}
                              className="mt-2 rounded bg-accent-600 px-2 py-1 text-[11px] font-medium text-white"
                            >
                              ✎ Modifier la date et le lieu
                            </button>
                          )}
                        </div>
                      </Popup>
                    </Marker>
                  );
                })}
              </MarkerClusterGroup>

              {paths.map(({ person, color, points }) =>
                points.length > 1 ? (
                  <Polyline
                    key={person.id}
                    positions={points.map((p) => [p.latitude, p.longitude])}
                    pathOptions={{ color, weight: 3, opacity: 0.8, dashArray: '6 4' }}
                  />
                ) : null
              )}
            </MapContainer>
          )}

          {editingEvent && (
            <EventQuickEditPanel
              treeId={currentTreeId}
              event={editingEvent}
              onClose={() => setEditingEventId(null)}
              onSaved={async () => { await reload({ silent: true }); setEditingEventId(null); }}
            />
          )}

          {!loading && (
            <div className="pointer-events-none absolute bottom-3 left-3 z-[1000] rounded-lg bg-white/90 px-2.5 py-2 text-[10px] shadow dark:bg-neutral-900/90">
              <div className="mb-1 font-medium text-neutral-500 dark:text-neutral-400">Couleur = type · bordure = fiabilité</div>
              {filteredEvents.some((e) => isApproximateGeocodePrecision(e.geocodePrecision)) && (
                <div className="mb-1 text-neutral-400">Pin pointillé/translucide = position approximative (département, région ou pays seulement)</div>
              )}
              <div className="flex gap-2">
                {Object.entries(MAP_CATEGORIES).map(([key, def]) => (
                  <span key={key} className="flex items-center gap-1">
                    <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: def.color }} />
                    {def.label}
                  </span>
                ))}
              </div>
            </div>
          )}

          {!loading && events.length === 0 && unresolvedCount > 0 && (
            <div className="absolute inset-0 z-[1000] flex items-center justify-center bg-white/80 p-6 text-center dark:bg-neutral-950/80">
              <div className="max-w-sm rounded-xl border border-neutral-200 bg-white p-5 shadow-lg dark:border-neutral-800 dark:bg-neutral-900">
                <p className="mb-1 text-sm font-medium">La carte est vide pour l'instant</p>
                <p className="mb-4 text-xs text-neutral-500 dark:text-neutral-400">
                  {unresolvedCount} lieu{unresolvedCount > 1 ? 'x' : ''} {unresolvedCount > 1 ? 'ne sont' : "n'est"} pas encore géolocalisé{unresolvedCount > 1 ? 's' : ''}
                  {' '}— c'est normal juste après un import GEDCOM. Aucun marqueur ne peut s'afficher tant que les lieux n'ont pas de coordonnées.
                </p>
                {canEdit ? (
                  resolving ? (
                    <div className="text-xs text-neutral-500 dark:text-neutral-400">
                      Résolution en cours… {resolveProgress ? `${resolveProgress.index}/${resolveProgress.total}` : ''}
                      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
                        <div
                          className="h-full bg-accent-600 transition-all"
                          style={{ width: resolveProgress ? `${(resolveProgress.index / Math.max(1, resolveProgress.total)) * 100}%` : '0%' }}
                        />
                      </div>
                      <p className="mt-2 text-[11px] text-neutral-400">Peut prendre plusieurs minutes (1 lieu/seconde environ).</p>
                    </div>
                  ) : (
                    <button
                      onClick={handleResolveAll}
                      className="rounded-lg bg-accent-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-700"
                    >
                      Localiser les {unresolvedCount} lieu{unresolvedCount > 1 ? 'x' : ''} maintenant
                    </button>
                  )
                ) : (
                  <p className="text-xs text-neutral-400">Demande à un membre admin ou famille de résoudre les lieux.</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {showResolver && (
        <PlacesResolverPanel
          treeId={currentTreeId}
          places={places}
          canEdit={canEdit}
          onPlacesChanged={reload}
          onClose={() => setShowResolver(false)}
          eventCountByPlaceId={eventCountByPlaceId}
          onFocusPlace={(point) => point && setFocusTarget({ ...point })}
        />
      )}
    </div>
  );
}
