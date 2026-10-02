import { BUILTIN_PALETTES, DEFAULT_PALETTE_ID, type Palette } from '@shared/palettes';
import type { LongformSkinId } from '@shared/types';
import {
  AlertTriangle,
  Check,
  CircleUserRound,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import * as React from 'react';
import { LongformStylePreview } from '@/components/LongformStylePreview';
import { PaletteDeleteDialog } from '@/components/PaletteDeleteDialog';
import { PaletteEditor } from '@/components/PaletteEditor';
import { LONGFORM_SKINS, SkinThumbnail } from '@/components/SkinThumbnail';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { evaluatePaletteContrast } from '@/lib/palette-contrast';
import { cn } from '@/lib/utils';
import { useCreatorProfiles } from '@/services/creator-profiles';
import { deleteCustomPaletteEverywhere } from '@/services/palette-service';
import { useStore } from '@/store';

export interface PalettePickerProps {
  disabled?: boolean | undefined;
  className?: string;
  skin?: LongformSkinId;
  paletteId?: string;
  /** Frozen plan palette, retained even if its library entry is removed. */
  palette?: Palette | undefined;
  onSkinChange?: (skin: LongformSkinId) => void;
  onPaletteChange?: ((paletteId: string) => void) | undefined;
  showProfileDefault?: boolean;
  showProjectPreview?: boolean;
  /**
   * `'full'` (default) is the long-form picker: skins, preview, palette cards
   * and custom-palette management. `'compact'` renders only palette swatches
   * and names, for surfaces where the skin axis doesn't apply (short-form).
   */
  variant?: 'full' | 'compact';
  /** Scene-first plans require an explicit palette; short-form retains its existing fallback. */
  requireResolvedPalette?: boolean;
  /** Group label for the compact variant. */
  title?: string;
  /** Helper text shown under the compact variant's label. */
  description?: string;
}

interface PaletteSwatchButtonProps {
  palette: Palette;
  selected: boolean;
  disabled?: boolean | undefined;
  onSelect: () => void;
}

function PaletteSwatchButton({
  palette,
  selected,
  disabled,
  onSelect,
}: PaletteSwatchButtonProps): React.JSX.Element {
  const colors = [
    { role: 'background', value: palette.background },
    { role: 'foreground', value: palette.foreground },
    { role: 'accent', value: palette.accent },
    { role: 'accent2', value: palette.accent2 },
  ].filter((color): color is { role: string; value: string } => typeof color.value === 'string');
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={selected}
      aria-label={`Use ${palette.name} palette`}
      className={cn(
        'flex min-h-11 min-w-0 items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left transition-[border-color,box-shadow,opacity] duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'disabled:pointer-events-none disabled:opacity-50',
        selected
          ? 'border-transparent ring-2 ring-primary'
          : 'border-border hover:border-foreground/35',
      )}
    >
      <span className="flex shrink-0 -space-x-1" aria-hidden>
        {colors.map((color) => (
          <span
            key={color.role}
            className="h-4 w-4 rounded-full border border-border"
            style={{ backgroundColor: color.value }}
          />
        ))}
      </span>
      <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
        {palette.name}
      </span>
      {selected && <Check className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />}
    </button>
  );
}

interface PaletteCardProps {
  palette: Palette;
  skin: LongformSkinId;
  selected: boolean;
  profileDefault: boolean;
  disabled?: boolean | undefined;
  onSelect: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

function PaletteCard({
  palette,
  skin,
  selected,
  profileDefault,
  disabled,
  onSelect,
  onEdit,
  onDelete,
}: PaletteCardProps): React.JSX.Element {
  const custom = !palette.builtin;

  return (
    <div className="group relative min-w-0">
      <button
        type="button"
        onClick={onSelect}
        disabled={disabled}
        aria-pressed={selected}
        aria-label={`Use ${palette.name} palette`}
        className={cn(
          'block w-full rounded-lg border p-1 text-left transition-[border-color,box-shadow,opacity] duration-150',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          'disabled:pointer-events-none disabled:opacity-50',
          selected
            ? 'border-transparent ring-2 ring-primary'
            : 'border-border hover:border-foreground/35',
        )}
      >
        <SkinThumbnail skin={skin} palette={palette} className="rounded-md" />
        <span className="mt-1.5 flex min-w-0 items-center gap-1 px-0.5">
          <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
            {palette.name}
          </span>
          {selected && <Check className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />}
        </span>
        <span className="mt-0.5 flex min-h-4 items-center gap-1 px-0.5 text-[10px] leading-tight text-muted-foreground">
          {profileDefault ? 'Profile default' : palette.builtin ? 'Built in' : 'Custom'}
        </span>
      </button>

      {custom && (onEdit || onDelete) && (
        <div className="mt-1 grid grid-cols-2 gap-1">
          {onEdit && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onEdit}
              disabled={disabled}
              aria-label={`Edit ${palette.name} palette`}
              className="min-h-11 px-2 text-xs"
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden />
              Edit
            </Button>
          )}
          {onDelete && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onDelete}
              disabled={disabled}
              aria-label={`Delete ${palette.name} palette`}
              className="min-h-11 px-2 text-xs text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
              Delete
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export function PalettePicker({
  disabled,
  className,
  skin,
  paletteId,
  palette,
  onSkinChange,
  onPaletteChange,
  showProfileDefault = true,
  showProjectPreview = true,
  variant = 'full',
  requireResolvedPalette = false,
  title = 'Palette',
  description,
}: PalettePickerProps): React.JSX.Element {
  const storedPaletteId = useStore((state) => state.settings.longformPaletteId);
  const customPalettes = useStore((state) => state.settings.customPalettes);
  const setLongformPaletteId = useStore((state) => state.setLongformPaletteId);
  const storedSkin = useStore((state) => state.settings.longformSkin);
  const setLongformSkin = useStore((state) => state.setLongformSkin);
  const projectProfile = useStore((state) => state.creatorProfile);
  const setProjectOverride = useStore((state) => state.setCreatorProfileOverride);
  const clearProjectOverride = useStore((state) => state.clearCreatorProfileOverride);
  const profiles = useCreatorProfiles();
  const selectedSkin = skin ?? storedSkin;
  const selectedPaletteId = paletteId ?? storedPaletteId;
  const allPalettes = React.useMemo(() => {
    const library = [...BUILTIN_PALETTES, ...customPalettes];
    return palette ? [...library.filter((item) => item.id !== palette.id), palette] : library;
  }, [customPalettes, palette]);
  const selectedPalette = allPalettes.find((item) => item.id === selectedPaletteId);
  const fallbackPalette = BUILTIN_PALETTES[0] as Palette;
  const previewPalette = selectedPalette ?? fallbackPalette;
  const paletteMissing = selectedPalette === undefined;
  const appliedProfile = profiles.find((item) => item.id === projectProfile.profileId) ?? null;
  const profilePaletteId = showProfileDefault ? appliedProfile?.longformPaletteId : undefined;
  const profilePalette = allPalettes.find((item) => item.id === profilePaletteId);
  const usingProfileDefault =
    appliedProfile !== null &&
    selectedSkin === appliedProfile.longformSkin &&
    selectedPaletteId === appliedProfile.longformPaletteId;
  const contrast = evaluatePaletteContrast(previewPalette);

  const previewHeadingId = React.useId();
  const customHeadingId = React.useId();
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [editingPalette, setEditingPalette] = React.useState<Palette | undefined>(undefined);
  const [deletingPalette, setDeletingPalette] = React.useState<Palette | null>(null);

  const commitSkin = (nextSkin: LongformSkinId): void => {
    if (onSkinChange) {
      onSkinChange(nextSkin);
      return;
    }
    setLongformSkin(nextSkin);
    if (!appliedProfile) return;
    if (nextSkin === appliedProfile.longformSkin) clearProjectOverride('longformSkin');
    else setProjectOverride('longformSkin', nextSkin);
  };

  const commitPalette = (nextPaletteId: string): void => {
    if (onPaletteChange) {
      onPaletteChange(nextPaletteId);
      return;
    }
    setLongformPaletteId(nextPaletteId);
    if (!appliedProfile) return;
    if (nextPaletteId === appliedProfile.longformPaletteId) {
      clearProjectOverride('longformPaletteId');
    } else {
      setProjectOverride('longformPaletteId', nextPaletteId);
    }
  };

  const openCreate = (): void => {
    setEditingPalette(undefined);
    setEditorOpen(true);
  };

  const openEdit = (target: Palette): void => {
    setEditingPalette(target);
    setEditorOpen(true);
  };

  const useProfileDefaults = (): void => {
    if (!appliedProfile) return;
    commitSkin(appliedProfile.longformSkin);
    commitPalette(appliedProfile.longformPaletteId);
  };

  const confirmDelete = (target: Palette): void => {
    // Keep the selected ID in controlled drafts too. Deletion makes it visibly
    // unresolved; only an explicit selection may replace it.
    deleteCustomPaletteEverywhere(target.id);
    setDeletingPalette(null);
  };

  if (variant === 'compact') {
    return (
      <fieldset className={cn('grid gap-2', className)}>
        <legend className="text-sm font-semibold text-foreground">{title}</legend>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
        {paletteMissing &&
          (requireResolvedPalette ? (
            <p role="alert" className="flex items-start gap-1.5 text-xs text-destructive">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              Selected palette is unavailable. Choose a palette before generating. No fallback is
              selected.
            </p>
          ) : (
            <p role="status" className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" aria-hidden />
              The selected palette is unavailable, so {fallbackPalette.name} will be used.
            </p>
          ))}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {allPalettes.map((option) => (
            <PaletteSwatchButton
              key={option.id}
              palette={option}
              selected={
                option.id === (requireResolvedPalette ? selectedPaletteId : previewPalette.id)
              }
              disabled={disabled}
              onSelect={() => commitPalette(option.id)}
            />
          ))}
        </div>
        <details className="min-w-0 rounded-md border border-border p-2">
          <summary className="min-h-11 cursor-pointer rounded-sm py-3 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            Manage custom palettes
          </summary>
          <div className="grid gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled}
              onClick={openCreate}
              className="min-h-11"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
              New palette
            </Button>
            {customPalettes.map((custom) => (
              <div key={custom.id} className="flex flex-wrap items-center gap-1">
                <span className="min-w-0 flex-1 break-words text-xs">{custom.name}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="min-h-11"
                  disabled={disabled}
                  aria-label={`Edit ${custom.name} palette`}
                  onClick={() => openEdit(custom)}
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden />
                  Edit
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="min-h-11"
                  disabled={disabled}
                  aria-label={`Delete ${custom.name} palette`}
                  onClick={() => setDeletingPalette(custom)}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  Delete
                </Button>
              </div>
            ))}
          </div>
        </details>
        <PaletteEditor
          open={editorOpen}
          onOpenChange={setEditorOpen}
          palette={editingPalette}
          onSaved={(saved) => {
            if (!editingPalette) commitPalette(saved.id);
          }}
          onRequestDelete={setDeletingPalette}
          previewSkin={selectedSkin}
        />
        <PaletteDeleteDialog
          palette={deletingPalette}
          open={deletingPalette !== null}
          onOpenChange={(open) => {
            if (!open) setDeletingPalette(null);
          }}
          onConfirm={confirmDelete}
        />
      </fieldset>
    );
  }

  return (
    <div className={cn('flex flex-col gap-5', className)}>
      {appliedProfile && showProfileDefault && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 p-3">
          <div className="flex min-w-0 items-start gap-2.5">
            <CircleUserRound className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-foreground">
                {appliedProfile.name} defaults
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {LONGFORM_SKINS.find((item) => item.id === appliedProfile.longformSkin)?.label ??
                  appliedProfile.longformSkin}{' '}
                · {profilePalette?.name ?? 'Missing palette'}
              </p>
            </div>
          </div>
          {usingProfileDefault ? (
            <Badge variant="secondary">Profile default</Badge>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={useProfileDefaults}
              disabled={disabled}
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden />
              Use profile defaults
            </Button>
          )}
        </div>
      )}

      {paletteMissing && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/35 bg-destructive/10 p-3"
        >
          <div className="flex min-w-0 items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
            <div>
              <p className="text-xs font-medium text-foreground">Selected palette is unavailable</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                It may have been deleted on another window. Brand Default is shown as a safe
                preview.
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => commitPalette(DEFAULT_PALETTE_ID)}
            disabled={disabled}
          >
            Restore Brand Default
          </Button>
        </div>
      )}

      {showProjectPreview && (
        <section aria-labelledby={previewHeadingId} className="grid gap-2">
          <div>
            <h3 id={previewHeadingId} className="text-sm font-semibold text-foreground">
              Project preview
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Real project copy with a representative frame when available, shown before export.
            </p>
          </div>
          <LongformStylePreview palette={previewPalette} skin={selectedSkin} />
          {contrast.warnings.length > 0 && (
            <div
              role="status"
              className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-2.5"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
              <div>
                <p className="text-xs font-medium text-foreground">Contrast warning</p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                  {contrast.warnings[0]}
                  {contrast.warnings.length > 1 &&
                    ` ${contrast.warnings.length - 1} more issue${contrast.warnings.length === 2 ? '' : 's'} in this palette.`}
                </p>
              </div>
            </div>
          )}
        </section>
      )}

      <fieldset className="grid gap-2">
        <legend className="text-sm font-semibold text-foreground">Block style</legend>
        <p className="text-xs text-muted-foreground">
          Structure and typography for full-frame content blocks.
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {LONGFORM_SKINS.map((option) => {
            const active = option.id === selectedSkin;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => commitSkin(option.id)}
                disabled={disabled}
                aria-pressed={active}
                aria-label={option.label}
                className={cn(
                  'flex min-w-0 flex-col gap-1.5 rounded-lg border p-1 text-left transition-[border-color,box-shadow,opacity] duration-150',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                  'disabled:pointer-events-none disabled:opacity-50',
                  active
                    ? 'border-transparent ring-2 ring-primary'
                    : 'border-border hover:border-foreground/35',
                )}
              >
                <SkinThumbnail skin={option.id} palette={previewPalette} className="rounded-md" />
                <span className="flex min-w-0 items-center gap-1 px-0.5">
                  <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
                    {option.label}
                  </span>
                  {active && <Check className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />}
                </span>
                <span className="line-clamp-2 min-h-7 px-0.5 text-[10px] leading-snug text-muted-foreground">
                  {option.description}
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="grid gap-2">
        <legend className="text-sm font-semibold text-foreground">Built-in palettes</legend>
        <p className="text-xs text-muted-foreground">
          Exact colors used across every selected block style.
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {BUILTIN_PALETTES.map((option) => (
            <PaletteCard
              key={option.id}
              palette={option}
              skin={selectedSkin}
              selected={option.id === selectedPaletteId}
              profileDefault={option.id === profilePaletteId}
              disabled={disabled}
              onSelect={() => commitPalette(option.id)}
            />
          ))}
        </div>
      </fieldset>

      <section className="grid gap-2" aria-labelledby={customHeadingId}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 id={customHeadingId} className="text-sm font-semibold text-foreground">
              Custom palettes
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Reusable in projects and Creator Profiles.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={openCreate}
            disabled={disabled}
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            New palette
          </Button>
        </div>
        {customPalettes.length === 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-border bg-muted/20 p-3">
            <div>
              <p className="text-xs font-medium text-foreground">No custom palettes yet</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Create one to keep brand colors consistent across long-form projects.
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={openCreate}
              disabled={disabled}
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
              Create first palette
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {customPalettes.map((option) => (
              <PaletteCard
                key={option.id}
                palette={option}
                skin={selectedSkin}
                selected={option.id === selectedPaletteId}
                profileDefault={option.id === profilePaletteId}
                disabled={disabled}
                onSelect={() => commitPalette(option.id)}
                onEdit={() => openEdit(option)}
                onDelete={() => setDeletingPalette(option)}
              />
            ))}
          </div>
        )}
      </section>

      <PaletteEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        palette={editingPalette}
        onSaved={(saved) => {
          if (!editingPalette) commitPalette(saved.id);
        }}
        onRequestDelete={setDeletingPalette}
        previewSkin={selectedSkin}
      />
      <PaletteDeleteDialog
        palette={deletingPalette}
        open={deletingPalette !== null}
        onOpenChange={(open) => {
          if (!open) setDeletingPalette(null);
        }}
        onConfirm={confirmDelete}
      />
    </div>
  );
}

export default PalettePicker;
