import { EDIT_CADENCES, type EditCadence } from '@shared/edit-cadence';
import { useId } from 'react';

export const EDIT_CADENCE_LABELS = {
  selective: 'Selective',
  balanced: 'Balanced',
  continuous: 'Continuous',
} as const;
const descriptions = {
  selective: 'Occasional explanations and phrase emphasis.',
  balanced: 'More useful explanations, with the speaker visible.',
  continuous: 'Frequent source-backed visual development, not constant cuts.',
} as const;

export function EditCadencePicker({
  value,
  onChange,
  disabled = false,
}: {
  value: EditCadence;
  onChange: (value: EditCadence) => void;
  disabled?: boolean;
}): React.JSX.Element {
  const name = useId();
  return (
    <fieldset disabled={disabled} className="grid min-w-0 gap-2 disabled:opacity-50">
      <legend className="mb-2 text-sm font-medium">Edit cadence (long-form)</legend>
      {EDIT_CADENCES.map((cadence) => (
        <label
          key={cadence}
          className="flex min-w-0 items-start gap-3 rounded-md border border-border p-3"
        >
          <input
            type="radio"
            name={name}
            value={cadence}
            checked={value === cadence}
            onChange={() => onChange(cadence)}
            className="mt-1 accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
          <span className="min-w-0 text-sm">
            <span className="block font-medium">{EDIT_CADENCE_LABELS[cadence]}</span>
            <span className="block text-xs text-muted-foreground">{descriptions[cadence]}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}
