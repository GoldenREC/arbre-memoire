import { useEffect, useRef, useState } from 'react';
import { searchCommunes, searchByPostcode } from '../../lib/geo/banAddressApi.js';
import { toProperCase } from '../../lib/utils/properCase.js';
import { EMPTY_PLACE, composePlaceLabel } from '../../lib/utils/placeLabel.js';

// Ré-exportés pour compatibilité (code existant important depuis ce module) ;
// la définition canonique vit dans lib/utils/placeLabel.js, utilisable aussi
// par la couche données (individualMutations.js) sans dépendre de l'UI.
export { EMPTY_PLACE, composePlaceLabel };

function useDebouncedSuggestions(query, fetcher, minLength = 2) {
  const [suggestions, setSuggestions] = useState([]);
  const requestId = useRef(0);

  useEffect(() => {
    if (!query || query.trim().length < minLength) {
      setSuggestions([]);
      return;
    }
    const id = ++requestId.current;
    const timer = setTimeout(async () => {
      const results = await fetcher(query);
      if (requestId.current === id) setSuggestions(results);
    }, 300);
    return () => clearTimeout(timer);
  }, [query, fetcher, minLength]);

  return [suggestions, setSuggestions];
}

function Suggestions({ items, onPick }) {
  if (!items.length) return null;
  return (
    <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-neutral-200 bg-white text-sm shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
      {items.map((s, i) => (
        <li key={`${s.citycode}-${i}`}>
          <button
            type="button"
            onClick={() => onPick(s)}
            className="block w-full px-2.5 py-1.5 text-left hover:bg-neutral-50 dark:hover:bg-neutral-800"
          >
            {s.label}
            {s.postalCode ? <span className="text-neutral-400"> — {s.postalCode}</span> : null}
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * Lieu structuré en 9 champs (numéro, rue, bâtiment/lieu-dit,
 * arrondissement, commune, code postal, département/état, région,
 * pays) avec autocomplétion de la commune et du code postal via l'API
 * Adresse du gouvernement français (gratuite, sans clé — voir
 * lib/geo/banAddressApi.js). Choisir une suggestion pré-remplit tout ce
 * qui en découle (commune, code postal, département, région, pays,
 * arrondissement pour Paris/Lyon/Marseille) sans jamais toucher aux
 * champs qu'elle ne peut pas connaître (numéro, rue, bâtiment) : ceux-là
 * restent de simples champs libres, à tout moment.
 *
 * `value` : { streetNumber, streetName, buildingName, arrondissement,
 * city, postalCode, department, region, country }. `onChange` reçoit le
 * nouvel objet complet à chaque modification.
 */
export default function StructuredPlaceInput({ value = EMPTY_PLACE, onChange, disabled = false }) {
  const [cityQuery, setCityQuery] = useState(value.city || '');
  const [postcodeFocused, setPostcodeFocused] = useState(false);
  const [cityFocused, setCityFocused] = useState(false);

  useEffect(() => { setCityQuery(value.city || ''); }, [value.city]);

  const [citySuggestions] = useDebouncedSuggestions(cityFocused ? cityQuery : '', searchCommunes);
  const [postcodeSuggestions] = useDebouncedSuggestions(postcodeFocused ? value.postalCode : '', searchByPostcode, 4);

  function patch(fields) {
    onChange({ ...value, ...fields });
  }

  function applySuggestion(s) {
    patch({
      city: s.city,
      postalCode: s.postalCode,
      department: s.department,
      region: s.region,
      country: s.country,
      arrondissement: s.arrondissement || value.arrondissement,
    });
    setCityQuery(s.city);
    setCityFocused(false);
    setPostcodeFocused(false);
  }

  function normalizeOnBlur(field) {
    return () => {
      if (value[field]) patch({ [field]: toProperCase(value[field]) });
    };
  }

  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-3">
      <TextField label="Numéro de rue" value={value.streetNumber} disabled={disabled}
        onChange={(v) => patch({ streetNumber: v })} onBlur={normalizeOnBlur('streetNumber')} />
      <TextField label="Nom de la rue" value={value.streetName} disabled={disabled} className="sm:col-span-2"
        onChange={(v) => patch({ streetName: v })} onBlur={normalizeOnBlur('streetName')} />
      <TextField label="Bâtiment / lieu-dit" value={value.buildingName} disabled={disabled} className="sm:col-span-2"
        onChange={(v) => patch({ buildingName: v })} onBlur={normalizeOnBlur('buildingName')} />
      <TextField label="Arrondissement" value={value.arrondissement} disabled={disabled}
        onChange={(v) => patch({ arrondissement: v })} onBlur={normalizeOnBlur('arrondissement')} />

      <div className="relative">
        <TextField
          label="Commune / ville"
          value={cityQuery}
          disabled={disabled}
          onChange={(v) => { setCityQuery(v); patch({ city: v }); }}
          onFocus={() => setCityFocused(true)}
          onBlurExtra={() => { normalizeOnBlur('city')(); setTimeout(() => setCityFocused(false), 150); }}
        />
        {cityFocused && <Suggestions items={citySuggestions} onPick={applySuggestion} />}
      </div>

      <div className="relative">
        <TextField
          label="Code postal"
          value={value.postalCode}
          disabled={disabled}
          onChange={(v) => patch({ postalCode: v })}
          onFocus={() => setPostcodeFocused(true)}
          onBlurExtra={() => setTimeout(() => setPostcodeFocused(false), 150)}
        />
        {postcodeFocused && <Suggestions items={postcodeSuggestions} onPick={applySuggestion} />}
      </div>

      <TextField label="Département / État" value={value.department} disabled={disabled}
        onChange={(v) => patch({ department: v })} onBlur={normalizeOnBlur('department')} />
      <TextField label="Région" value={value.region} disabled={disabled}
        onChange={(v) => patch({ region: v })} onBlur={normalizeOnBlur('region')} />
      <TextField label="Pays" value={value.country} disabled={disabled}
        onChange={(v) => patch({ country: v })} onBlur={normalizeOnBlur('country')} />
    </div>
  );
}

function TextField({ label, value, onChange, onFocus, onBlur, onBlurExtra, disabled, className = '' }) {
  return (
    <label className={`block text-xs text-neutral-500 dark:text-neutral-400 ${className}`}>
      <span className="mb-1 block">{label}</span>
      <input
        className="field"
        value={value || ''}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        onBlur={onBlurExtra || onBlur}
      />
    </label>
  );
}
