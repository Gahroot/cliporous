import { BUILTIN_PALETTES } from '@shared/palettes';
import { resolveStoryboardPalette } from '@shared/storyboard-palette';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStore } from '@/store';
import { installApiStub, resetStore } from './__tests__/test-utils';
import { LongformAppearancePicker } from './LongformAppearancePicker';
import { StoryboardStylePicker } from './StoryboardStylePicker';

beforeEach(() => {
  installApiStub();
  resetStore();
  useStore.getState().setLongformPaletteId('brand');
  useStore.getState().setLongformStoryboardStyle('polish');
});
afterEach(cleanup);

describe('Storyboard appearance', () => {
  it('has named selected/unselected keyboard-focusable controls and shared static colors', () => {
    const onChange = vi.fn();
    const palette = BUILTIN_PALETTES[0];
    const { container, rerender } = render(
      <StoryboardStylePicker palette={palette} onChange={onChange} />,
    );
    expect(screen.getByRole('group', { name: 'Storyboard style' })).toBeInTheDocument();
    const ink = screen.getByRole('button', { name: 'Ink', pressed: false });
    expect(screen.getByRole('button', { name: 'Polish', pressed: true })).toBeInTheDocument();
    ink.focus();
    expect(ink).toHaveFocus();
    fireEvent.click(ink); // native button activation (Enter/Space are supplied by the browser)
    expect(onChange).toHaveBeenCalledWith('ink');
    expect(ink.querySelector('rect')).toHaveAttribute(
      'fill',
      resolveStoryboardPalette('ink', palette).canvas,
    );
    expect(container.querySelector('video, canvas, iframe')).toBeNull();
    rerender(<StoryboardStylePicker value="ink" palette={palette} onChange={onChange} disabled />);
    expect(screen.getByRole('button', { name: 'Ink', pressed: true })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Polish', pressed: false })).toBeDisabled();
  });

  it('keeps all eight palettes independent of style and exposes compact management', () => {
    render(<LongformAppearancePicker />);
    for (const palette of BUILTIN_PALETTES)
      expect(
        screen.getByRole('button', { name: `Use ${palette.name} palette` }),
      ).toBeInTheDocument();
    expect(BUILTIN_PALETTES).toHaveLength(8);
    fireEvent.click(screen.getByRole('button', { name: 'Ink' }));
    expect(useStore.getState().settings.longformPaletteId).toBe('brand');
    fireEvent.click(
      screen.getByRole('button', { name: `Use ${BUILTIN_PALETTES[1].name} palette` }),
    );
    expect(useStore.getState().settings.longformStoryboardStyle).toBe('ink');
    expect(screen.queryByText('Block style')).toBeNull();
    fireEvent.click(screen.getByText('Manage custom palettes'));
    expect(screen.getByRole('button', { name: 'New palette' })).toBeEnabled();
  });
});
