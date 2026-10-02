import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createCreatorProfile,
  deleteCreatorProfile,
  getCreatorProfiles,
  updateCreatorProfile,
} from '@/services/creator-profiles';
import { useStore } from '@/store';
import { installApiStub, resetStore } from './__tests__/test-utils';
import { CreatorProfileDialog } from './CreatorProfileDialog';

function clearProfiles(): void {
  getCreatorProfiles().forEach((profile) => {
    deleteCreatorProfile(profile.id);
  });
}

describe('CreatorProfileDialog', () => {
  beforeEach(() => {
    installApiStub();
    resetStore();
    useStore.getState().settings.customPalettes.forEach((palette) => {
      useStore.getState().removeCustomPalette(palette.id);
    });
    clearProfiles();
  });

  afterEach(() => {
    cleanup();
    useStore.getState().settings.customPalettes.forEach((palette) => {
      useStore.getState().removeCustomPalette(palette.id);
    });
    clearProfiles();
    vi.restoreAllMocks();
  });

  it('uses shared custom palettes as visual Creator Profile defaults', async () => {
    const profile = createCreatorProfile('Founder Studio');
    useStore.getState().addCustomPalette({
      id: 'founder-gold',
      name: 'Founder Gold',
      background: '#15120A',
      foreground: '#FFF8E7',
      accent: '#F2B84B',
      builtin: false,
    });

    render(<CreatorProfileDialog open onOpenChange={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Use Founder Gold palette' }));

    await waitFor(() => {
      expect(getCreatorProfiles().find((item) => item.id === profile.id)?.longformPaletteId).toBe(
        'founder-gold',
      );
    });
    expect(screen.getByRole('group', { name: 'Storyboard style' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ink' }));
    await waitFor(() =>
      expect(
        getCreatorProfiles().find((item) => item.id === profile.id)?.longformStoryboardStyle,
      ).toBe('ink'),
    );
    expect(getCreatorProfiles().find((item) => item.id === profile.id)?.longformPaletteId).toBe(
      'founder-gold',
    );
    expect(screen.queryByText('Project preview needs footage')).toBeNull();
  });

  it('shows explicit reusable memory metadata and deletes the underlying preference', async () => {
    const profile = createCreatorProfile('Founder Studio');
    updateCreatorProfile(profile.id, { audience: 'Independent founders' }, ['audience']);
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<CreatorProfileDialog open onOpenChange={vi.fn()} />);
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Remembered' }), {
      button: 0,
      ctrlKey: false,
    });

    expect(await screen.findByText('Independent founders')).toBeInTheDocument();
    expect(screen.getByText('Saved in Founder Studio')).toBeInTheDocument();
    expect(screen.getByText('Reusable across projects')).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'Delete Target audience from Founder Studio' }),
    );
    await waitFor(() =>
      expect(screen.getByText('No remembered preferences yet.')).toBeInTheDocument(),
    );
    expect(getCreatorProfiles()[0]?.audience).toBe('');
  });
});
