import type { Palette } from '@shared/palettes';
import { resolveStoryboardPalette } from '@shared/storyboard-palette';
import { DEFAULT_STORYBOARD_STYLE, type StoryboardStyle } from '@shared/storyboards';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface StoryboardStylePickerProps {
  value?: StoryboardStyle;
  palette?: Palette | undefined;
  onChange: (style: StoryboardStyle) => void;
  disabled?: boolean | undefined;
}

/** Deliberately static: the same semantic colors as export, without a media or WebGL session. */
function StoryboardThumbnail({
  style,
  palette,
}: {
  style: StoryboardStyle;
  palette: Palette;
}): React.JSX.Element {
  const colors = resolveStoryboardPalette(style, palette);
  const ink = style === 'ink';
  return (
    <svg viewBox="0 0 240 112" className="w-full rounded-md" aria-hidden="true" focusable="false">
      <rect width="240" height="112" fill={colors.canvas} />
      <path
        d="M18 22H117 M18 29H87"
        stroke={colors.ink}
        strokeWidth={ink ? 2 : 3}
        strokeLinecap="round"
      />
      <rect
        x="18"
        y="45"
        width="64"
        height="45"
        rx={ink ? 2 : 9}
        fill={colors.cardRaised}
        stroke={colors.stroke}
        strokeWidth="2"
        transform={ink ? 'rotate(-2 50 67)' : undefined}
      />
      <rect
        x="151"
        y="45"
        width="70"
        height="45"
        rx={ink ? 2 : 9}
        fill={ink ? colors.note : colors.cardRaised}
        stroke={colors.stroke}
        strokeWidth="2"
        transform={ink ? 'rotate(2 186 67)' : undefined}
      />
      <path
        d={ink ? 'M92 65Q116 60 141 65 M133 59L141 65L133 72' : 'M92 67H141 M133 60L141 67L133 74'}
        fill="none"
        stroke={colors.accent}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="50" cy="67" r="11" fill={colors.marker} stroke={colors.accent} strokeWidth="2" />
      <path
        d="M172 67L181 76L199 58"
        fill="none"
        stroke={colors.accent2}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {ink && <path d="M148 39L175 41" stroke={colors.tape} strokeWidth="8" />}
    </svg>
  );
}

export function StoryboardStylePicker({
  value = DEFAULT_STORYBOARD_STYLE,
  palette,
  onChange,
  disabled,
}: StoryboardStylePickerProps): React.JSX.Element {
  return (
    <fieldset className="min-w-0 space-y-2">
      <legend className="text-sm font-semibold">Storyboard style</legend>
      <p className="text-xs text-muted-foreground">
        How the explanation is drawn. Colors are chosen separately below.
      </p>
      <div className="grid grid-cols-2 gap-2">
        {(['ink', 'polish'] as const).map((style) => (
          <button
            key={style}
            type="button"
            aria-label={style === 'ink' ? 'Ink' : 'Polish'}
            aria-pressed={value === style}
            disabled={disabled}
            onClick={() => onChange(style)}
            className={cn(
              'min-h-11 min-w-0 rounded-lg border p-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50',
              value === style
                ? 'border-transparent ring-2 ring-primary'
                : 'border-border hover:border-foreground/35',
            )}
          >
            {palette ? (
              <StoryboardThumbnail style={style} palette={palette} />
            ) : (
              <div className="flex aspect-[15/7] items-center justify-center rounded-md bg-muted p-2 text-xs text-muted-foreground">
                Choose a palette to preview
              </div>
            )}
            <span className="mt-2 flex items-center justify-between gap-1 text-sm font-medium">
              {style === 'ink' ? 'Ink' : 'Polish'}
              {value === style && <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden />}
            </span>
            <span className="mt-1 block text-xs text-muted-foreground">
              {style === 'ink'
                ? 'Paper, marker and hand-drawn lines.'
                : 'Clean cards, precise lines and depth.'}
            </span>
          </button>
        ))}
      </div>
    </fieldset>
  );
}
