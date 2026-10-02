import { getPaletteById } from '@shared/palettes';
import { beforeEach, describe, expect, it } from 'vitest';
import { installApiStub, resetStore } from '@/components/__tests__/test-utils';
import { useStore } from '@/store';
import {
  createCreatorProfile,
  deleteCreatorProfile,
  getCreatorProfiles,
  updateCreatorProfile,
} from './creator-profiles';
import { deleteCustomPaletteEverywhere } from './palette-service';

describe('palette deletion preserves scoped choices and accepted snapshots', () => {
  beforeEach(() => {
    resetStore();
    installApiStub();
    for (const profile of getCreatorProfiles()) deleteCreatorProfile(profile.id);
  });

  it('removes only the library entry, not project/profile references or accepted history', () => {
    const palette = { ...getPaletteById('brand'), id: 'custom-kept', builtin: false };
    const profile = createCreatorProfile('Creator');
    updateCreatorProfile(profile.id, { longformPaletteId: palette.id });
    const store = useStore.getState();
    store.addCustomPalette(palette);
    store.setLongformPaletteId(palette.id);
    store.setCreatorProfileOverride('longformPaletteId', palette.id);
    store.setLongformPlan('source', {
      plan: { blocks: [], phrases: [], reasoning: 'saved', generatedAt: 1 },
      skin: 'editorial',
      paletteId: palette.id,
      palette,
    });
    store.acceptLongformPlan('source', 'editorial', palette.id);
    const accepted = structuredClone(useStore.getState().longformPlans.source);
    store.updateCustomPalette(palette.id, { accent: '#123456' });
    expect(useStore.getState().longformPlans.source).toEqual(accepted);
    deleteCustomPaletteEverywhere(palette.id);
    expect(useStore.getState().settings.customPalettes).toEqual([]);
    expect(useStore.getState().settings.longformPaletteId).toBe(palette.id);
    expect(useStore.getState().creatorProfile.overrides.longformPaletteId).toBe(palette.id);
    expect(getCreatorProfiles()[0]?.longformPaletteId).toBe(palette.id);
    expect(useStore.getState().longformPlans.source).toEqual(accepted);
  });
});
