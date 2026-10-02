import { findLongformPalette } from '@shared/longform-palette';
import type { Palette } from '@shared/palettes';
import { DEFAULT_STORYBOARD_STYLE, type StoryboardStyle } from '@shared/storyboards';
import { PalettePicker } from '@/components/PalettePicker';
import { StoryboardStylePicker } from '@/components/StoryboardStylePicker';
import { useCreatorProfiles } from '@/services/creator-profiles';
import { useStore } from '@/store';

export interface LongformAppearancePickerProps {
  style?: StoryboardStyle;
  paletteId?: string;
  /** A reviewed plan's frozen colors may outlive the custom-palette library. */
  palette?: Palette | undefined;
  onStyleChange?: (style: StoryboardStyle) => void;
  onPaletteChange?: (paletteId: string) => void;
  disabled?: boolean | undefined;
  showProfileDefault?: boolean;
}

export function LongformAppearancePicker({
  style,
  paletteId,
  palette,
  onStyleChange,
  onPaletteChange,
  disabled,
  showProfileDefault = true,
}: LongformAppearancePickerProps): React.JSX.Element {
  const settings = useStore((state) => state.settings);
  const projectProfile = useStore((state) => state.creatorProfile);
  const profiles = useCreatorProfiles();
  const profile = profiles.find((item) => item.id === projectProfile.profileId);
  const selectedStyle = style ?? settings.longformStoryboardStyle ?? DEFAULT_STORYBOARD_STYLE;
  const selectedPaletteId = paletteId ?? settings.longformPaletteId;
  const resolved =
    palette?.id === selectedPaletteId
      ? palette
      : findLongformPalette(selectedPaletteId, settings.customPalettes);
  const changeStyle = (next: StoryboardStyle): void => {
    if (onStyleChange) {
      onStyleChange(next);
      return;
    }
    const state = useStore.getState();
    state.setLongformStoryboardStyle(next);
    if (!profile) return;
    if (next === profile.longformStoryboardStyle)
      state.clearCreatorProfileOverride('longformStoryboardStyle');
    else state.setCreatorProfileOverride('longformStoryboardStyle', next);
  };
  return (
    <div className="grid min-w-0 gap-4">
      <StoryboardStylePicker
        value={selectedStyle}
        palette={resolved}
        onChange={changeStyle}
        disabled={disabled}
      />
      {showProfileDefault && profile && (
        <p className="text-xs text-muted-foreground">
          {selectedStyle === profile.longformStoryboardStyle
            ? 'Profile storyboard default'
            : 'Project storyboard override'}{' '}
          · {profile.name}
        </p>
      )}
      <PalettePicker
        variant="compact"
        requireResolvedPalette
        paletteId={selectedPaletteId}
        palette={palette}
        onPaletteChange={onPaletteChange}
        disabled={disabled}
        showProfileDefault={showProfileDefault}
        description="All eight built-in palettes and your custom palettes. Style does not change your palette."
      />
    </div>
  );
}
