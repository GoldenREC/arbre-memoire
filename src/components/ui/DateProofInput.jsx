/**
 * Sélecteur de preuve pour les groupes naissance/décès (date ou lieu) : "Acte"
 * (état civil/paroissial/notarié — exige un fichier scanné OU un
 * permalien d'archives) ou "Informations familiales" (aucune pièce
 * jointe requise). Utilisé par IndividualCreateForm et CivilHeader
 * dès que la précision choisie est "Exacte", pour éviter qu'une date
 * exacte soit enregistrée sans justification.
 *
 * Aussi utilisé pour les jalons d'une union (UnionStatusForm), avec
 * `allowMarginal` : un troisième choix "Mention marginale" (le mariage
 * ou le divorce porté en marge d'un autre acte, souvent l'acte de
 * naissance) — comme un acte, il exige le scan ou le permalien de
 * l'acte qui porte la mention.
 *
 * `value` : { type: '' | 'acte' | 'marginal' | 'family', url: string, file: File|null }
 */
import { useId } from 'react';

export const EMPTY_DATE_PROOF = { type: '', url: '', file: null };

export function isDateProofValid(value) {
  if (!value) return false;
  if (value.type === 'family') return true;
  if (value.type === 'acte' || value.type === 'marginal') return !!(value.url?.trim() || value.file);
  return false;
}

export default function DateProofInput({ value, onChange, disabled = false, allowMarginal = false, message = 'Une preuve est requise pour cette information.' }) {
  const v = value || EMPTY_DATE_PROOF;
  // Nom de groupe unique : plusieurs sélecteurs peuvent coexister dans un
  // même formulaire (naissance + décès, ou les trois jalons d'une union).
  const groupName = useId();

  function setType(type) {
    onChange({ ...v, type });
  }

  return (
    <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-900/50 dark:bg-amber-950/20">
      <p className="text-xs text-amber-700 dark:text-amber-400">
        {message}
      </p>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <label className="flex items-center gap-1.5">
          <input type="radio" name={groupName} disabled={disabled} checked={v.type === 'acte'} onChange={() => setType('acte')} />
          Acte
        </label>
        {allowMarginal && (
          <label className="flex items-center gap-1.5">
            <input type="radio" name={groupName} disabled={disabled} checked={v.type === 'marginal'} onChange={() => setType('marginal')} />
            Mention marginale
          </label>
        )}
        <label className="flex items-center gap-1.5">
          <input type="radio" name={groupName} disabled={disabled} checked={v.type === 'family'} onChange={() => setType('family')} />
          Informations familiales
        </label>
      </div>

      {(v.type === 'acte' || v.type === 'marginal') && (
        <div className="space-y-1.5">
          {v.type === 'marginal' && (
            <p className="text-[11px] text-neutral-400">Joins l'acte qui porte la mention en marge (souvent l'acte de naissance).</p>
          )}
          <input
            type="file"
            accept="image/*,.pdf"
            disabled={disabled}
            className="field"
            onChange={(e) => onChange({ ...v, file: e.target.files?.[0] || null })}
          />
          <div className="text-center text-[11px] text-neutral-400">ou</div>
          <input
            type="url"
            placeholder="Permalien d'archives (https://...)"
            disabled={disabled}
            className="field"
            value={v.url}
            onChange={(e) => onChange({ ...v, url: e.target.value })}
          />
        </div>
      )}

      {v.type === 'family' && (
        <p className="text-[11px] text-neutral-400">
          Ex. personne née après 1920 : acte non consultable en ligne, information tenue de la famille.
        </p>
      )}
    </div>
  );
}
