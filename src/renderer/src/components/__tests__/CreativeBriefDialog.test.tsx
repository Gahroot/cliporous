import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CreativeBriefDialog } from '@/components/CreativeBriefDialog';
import { useStore } from '@/store';
import { installApiStub, resetStore } from './test-utils';

beforeEach(() => {
  resetStore();
  installApiStub();
  useStore.setState((state) => ({ settings: { ...state.settings, outputMode: 'short' } }));
});
afterEach(cleanup);

describe('CreativeBriefDialog', () => {
  it('keeps short-form draft edits separate from the committed brief', () => {
    render(<CreativeBriefDialog open onOpenChange={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Audience'), { target: { value: 'Founders' } });
    expect(useStore.getState().creativeBrief.audience).toBe('Founders');
    expect(useStore.getState().creativeBrief.committed?.audience).not.toBe('Founders');
    fireEvent.click(screen.getByRole('button', { name: /^save brief$/i }));
    expect(useStore.getState().creativeBrief.committed?.audience).toBe('Founders');
  });

  it('discloses long-form scope, hides prompts, and preserves draft and committed text on back', () => {
    useStore.getState().setCreativeBrief({ audience: 'Saved audience', notes: 'Saved notes' });
    useStore.getState().commitCreativeBrief();
    useStore.getState().setCreativeBrief({ notes: 'Unsaved draft notes' });
    const before = useStore.getState().creativeBrief;
    useStore.setState((state) => ({ settings: { ...state.settings, outputMode: 'longform' } }));
    const onOpenChange = vi.fn();
    render(<CreativeBriefDialog open onOpenChange={onOpenChange} />);
    expect(screen.getByText(/not used for initial scene planning/)).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /save brief/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByText(/view preserved brief/i));
    expect(screen.getByText('Unsaved draft notes')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /back to project/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(useStore.getState().creativeBrief).toEqual(before);
  });
});
