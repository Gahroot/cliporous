import type { Palette } from '@shared/palettes';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createCreatorProfile,
  deleteCreatorProfile,
  getCreatorProfiles,
  updateCreatorProfile,
} from '@/services/creator-profiles';
import { useStore } from '@/store';
import { installApiStub, resetStore } from './__tests__/test-utils';
import { PalettePicker } from './PalettePicker';

const CUSTOM_PALETTE: Palette = {
  id: 'studio-sunrise',
  name: 'Studio Sunrise',
  background: '#111111',
  foreground: '#FFFFFF',
  accent: '#FFAA00',
  builtin: false,
};

function clearProfiles(): void {
  getCreatorProfiles().forEach((profile) => {
    deleteCreatorProfile(profile.id);
  });
}

describe('PalettePicker', () => {
  beforeEach(() => {
    installApiStub();
    resetStore();
    useStore.getState().settings.customPalettes.forEach((palette) => {
      useStore.getState().removeCustomPalette(palette.id);
    });
    useStore.getState().setLongformPaletteId('brand');
    clearProfiles();
  });

  afterEach(() => {
    cleanup();
    useStore.getState().settings.customPalettes.forEach((palette) => {
      useStore.getState().removeCustomPalette(palette.id);
    });
    useStore.getState().setLongformPaletteId('brand');
    clearProfiles();
  });

  it('previews every skin against real project copy', () => {
    useStore.setState({
      activeSourceId: 'source-1',
      sources: [
        {
          id: 'source-1',
          path: '/video/founder-story.mp4',
          name: 'Founder Story',
          duration: 120,
          width: 1920,
          height: 1080,
          thumbnail: 'data:image/png;base64,preview',
          origin: 'file',
          mediaStatus: 'online',
        },
      ],
      transcriptions: {
        'source-1': {
          text: 'Retention starts with a clear first promise',
          formattedForAI: '',
          words: [
            { text: 'Retention', start: 0, end: 0.4 },
            { text: 'starts', start: 0.4, end: 0.7 },
            { text: 'with', start: 0.7, end: 0.9 },
            { text: 'a', start: 0.9, end: 1 },
            { text: 'clear', start: 1, end: 1.3 },
            { text: 'first', start: 1.3, end: 1.6 },
            { text: 'promise', start: 1.6, end: 2 },
          ],
          segments: [],
        },
      },
    });

    render(<PalettePicker />);

    expect(screen.getByText('Real project content')).toBeInTheDocument();
    expect(screen.getByText('Founder Story')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Editorial' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Print Magazine' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Neo Brutalist' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Blueprint' })).toBeInTheDocument();
  });

  it('labels a preview as copy-only when the project has no source frame', () => {
    useStore.setState({
      activeSourceId: 'source-1',
      sources: [
        {
          id: 'source-1',
          path: '/video/founder-story.mp4',
          name: 'Founder Story',
          duration: 120,
          width: 1920,
          height: 1080,
          thumbnail: '',
          origin: 'file',
          mediaStatus: 'online',
        },
      ],
      transcriptions: {
        'source-1': { text: '', formattedForAI: '', words: [], segments: [] },
      },
    });

    render(<PalettePicker />);

    expect(screen.getByText('Real project copy')).toBeInTheDocument();
    expect(screen.getByText(/no source frame is available yet/i)).toBeInTheDocument();
    expect(screen.getByText('Founder Story')).toBeInTheDocument();
  });

  it('validates creation, selects the new palette, and warns about low contrast', async () => {
    render(<PalettePicker />);

    fireEvent.click(screen.getByRole('button', { name: 'New palette' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create palette' }));
    expect(screen.getByText('Name this palette.')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Palette name'), { target: { value: 'Fog' } });
    fireEvent.change(screen.getByLabelText('Foreground'), { target: { value: '#242424' } });

    expect(await screen.findByText('Contrast needs review')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Create palette' }));

    await waitFor(() => expect(useStore.getState().settings.customPalettes).toHaveLength(1));
    const created = useStore.getState().settings.customPalettes[0];
    expect(created?.name).toBe('Fog');
    expect(useStore.getState().settings.longformPaletteId).toBe(created?.id);
  });

  it('deletes custom palettes with confirmation and preserves unresolved selected IDs', async () => {
    useStore.getState().addCustomPalette(CUSTOM_PALETTE);
    useStore.getState().setLongformPaletteId(CUSTOM_PALETTE.id);
    const profile = createCreatorProfile('Founder Studio');
    updateCreatorProfile(profile.id, { longformPaletteId: CUSTOM_PALETTE.id }, ['longformPalette']);
    useStore.getState().setCreatorProfile(profile.id);

    render(<PalettePicker />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete Studio Sunrise palette' }));

    expect(screen.getByText('Delete Studio Sunrise?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Delete palette' }));

    await waitFor(() => expect(useStore.getState().settings.customPalettes).toHaveLength(0));
    expect(useStore.getState().settings.longformPaletteId).toBe(CUSTOM_PALETTE.id);
    expect(useStore.getState().creatorProfile.overrides.longformPaletteId).toBeUndefined();
    expect(getCreatorProfiles()[0]?.longformPaletteId).toBe(CUSTOM_PALETTE.id);
    expect(screen.getByRole('alert')).toHaveTextContent('unavailable');
  });

  it('controlled deletion does not silently select Brand', async () => {
    useStore.getState().addCustomPalette(CUSTOM_PALETTE);
    const onPaletteChange = vi.fn();
    render(
      <PalettePicker
        variant="compact"
        requireResolvedPalette
        paletteId={CUSTOM_PALETTE.id}
        onPaletteChange={onPaletteChange}
      />,
    );
    fireEvent.click(screen.getByText('Manage custom palettes'));
    fireEvent.click(screen.getByRole('button', { name: 'Delete Studio Sunrise palette' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete palette' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('unavailable'));
    expect(onPaletteChange).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Use Brand Default palette' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('compact variant renders palette swatches and changes selection', () => {
    useStore.getState().addCustomPalette(CUSTOM_PALETTE);
    render(
      <PalettePicker
        variant="compact"
        title="Animation colours"
        description="Used for animated scenes and caption highlights."
      />,
    );

    const group = screen.getByRole('group', { name: 'Animation colours' });
    expect(
      screen.getByText('Used for animated scenes and caption highlights.'),
    ).toBeInTheDocument();
    // Compact mode keeps custom management, without the old skin axis or media preview.
    expect(screen.queryByText('Block style')).toBeNull();
    expect(screen.queryByText('Project preview')).toBeNull();
    expect(screen.getByText('Manage custom palettes')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editorial' })).toBeNull();

    const brand = screen.getByRole('button', { name: 'Use Brand Default palette' });
    const custom = screen.getByRole('button', { name: 'Use Studio Sunrise palette' });
    expect(group).toContainElement(custom);
    expect(brand).toHaveAttribute('aria-pressed', 'true');
    expect(custom).toHaveAttribute('aria-pressed', 'false');

    custom.focus();
    expect(custom).toHaveFocus();
    fireEvent.click(custom);

    expect(useStore.getState().settings.longformPaletteId).toBe(CUSTOM_PALETTE.id);
    expect(custom).toHaveAttribute('aria-pressed', 'true');
    expect(brand).toHaveAttribute('aria-pressed', 'false');
  });

  it('compact variant leaves a missing palette unresolved instead of selecting a fallback', () => {
    useStore.getState().setLongformPaletteId('deleted-palette');
    render(<PalettePicker variant="compact" requireResolvedPalette title="Animation colours" />);

    expect(screen.getByRole('alert')).toHaveTextContent('Selected palette is unavailable');
    expect(screen.getByRole('button', { name: 'Use Brand Default palette' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('shows a repair action for a missing saved palette', () => {
    useStore.getState().setLongformPaletteId('deleted-palette');
    render(<PalettePicker />);

    expect(screen.getByRole('alert')).toHaveTextContent('Selected palette is unavailable');
    fireEvent.click(screen.getByRole('button', { name: 'Restore Brand Default' }));
    expect(useStore.getState().settings.longformPaletteId).toBe('brand');
  });
});
