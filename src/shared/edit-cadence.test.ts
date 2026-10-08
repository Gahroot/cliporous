import { expect, it } from 'vitest';
import {
  EDIT_CADENCE_PRESETS,
  EDIT_CADENCES,
  isEditCadence,
  resolveEditCadence,
} from './edit-cadence';

it('accepts only the bounded presets and defaults missing metadata to Selective', () => {
  for (const cadence of EDIT_CADENCES) {
    expect(isEditCadence(cadence)).toBe(true);
    expect(resolveEditCadence(cadence)).toBe(cadence);
    expect(Object.isFrozen(EDIT_CADENCE_PRESETS[cadence])).toBe(true);
  }
  expect(resolveEditCadence(undefined)).toBe('selective');
  for (const invalid of [null, {}, 3, 'fast', '']) expect(isEditCadence(invalid)).toBe(false);
});
