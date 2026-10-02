import { useStore } from '@/store';

/** Remove a library entry without rewriting project choices, profiles or version snapshots. */
export function deleteCustomPaletteEverywhere(paletteId: string): void {
  const state = useStore.getState();
  if (!state.settings.customPalettes.some((palette) => palette.id === paletteId)) return;

  state.removeCustomPalette(paletteId);
}
