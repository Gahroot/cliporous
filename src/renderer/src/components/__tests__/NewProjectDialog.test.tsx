import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isYouTubeUrl } from '@/components/entry-source';
import { NewProjectDialog } from '@/components/NewProjectDialog';
import {
  createCreatorProfile,
  deleteCreatorProfile,
  getCreatorProfiles,
  updateCreatorProfile,
} from '@/services/creator-profiles';
import { useStore } from '@/store';
import { installApiStub, resetStore } from './test-utils';

beforeEach(() => {
  resetStore();
  installApiStub();
  getCreatorProfiles().forEach((profile) => {
    deleteCreatorProfile(profile.id);
  });
  useStore.setState((state) => ({
    settings: {
      ...state.settings,
      outputMode: 'short',
      longformStoryboardStyle: 'polish',
      longformPaletteId: 'brand',
    },
  }));
});
afterEach(cleanup);

function props() {
  return {
    open: true,
    busy: false,
    onOpenChange: vi.fn(),
    onChooseFile: vi.fn<() => Promise<string | null>>(async () => '/source.mp4'),
    onCreate: vi.fn(),
  };
}

async function chooseMode(label: string) {
  fireEvent.keyDown(screen.getByRole('combobox', { name: /output mode/i }), { key: 'ArrowDown' });
  fireEvent.click(await screen.findByRole('option', { name: label }));
}

describe('NewProjectDialog', () => {
  it('preserves source, name and outcome across cancel/back and does not submit implicitly', async () => {
    const callbacks = props();
    const { rerender } = render(<NewProjectDialog {...callbacks} />);
    fireEvent.click(screen.getByRole('button', { name: /choose video/i }));
    await screen.findByText('/source.mp4');
    fireEvent.change(screen.getByLabelText('Project name'), { target: { value: 'My draft' } });
    await chooseMode('Long-form edit (16:9)');
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
    expect(callbacks.onOpenChange).toHaveBeenCalledWith(false);
    expect(callbacks.onCreate).not.toHaveBeenCalled();
    rerender(<NewProjectDialog {...callbacks} open={false} />);
    rerender(<NewProjectDialog {...callbacks} />);
    expect(screen.getByLabelText('Project name')).toHaveValue('My draft');
    expect(screen.getByText('/source.mp4')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /output mode/i })).toHaveTextContent('Long-form');
    expect(useStore.getState().settings.outputMode).toBe('short');
    fireEvent.click(screen.getByRole('button', { name: /create project and process/i }));
    expect(callbacks.onCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'My draft',
        source: { kind: 'file', value: '/source.mp4' },
        outputMode: 'longform',
      }),
    );
  });

  it('profile seeds appearance, explicit choices win, and cancel leaves the project unchanged', async () => {
    const profile = createCreatorProfile('Ink studio');
    updateCreatorProfile(profile.id, {
      longformStoryboardStyle: 'ink',
      longformPaletteId: 'navy-mint',
    });
    useStore.getState().setOutputMode('longform');
    const settings = useStore.getState().settings;
    const project = useStore.getState().currentProject;
    const callbacks = props();
    const { rerender } = render(<NewProjectDialog {...callbacks} />);
    fireEvent.change(screen.getByLabelText('Project name'), {
      target: { value: 'Appearance test' },
    });
    fireEvent.change(screen.getByLabelText('YouTube URL'), {
      target: { value: 'https://youtu.be/dQw4w9WgXcQ' },
    });
    fireEvent.click(screen.getByText('Creator Profile (optional)'));
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Creator Profile' }), {
      key: 'ArrowDown',
    });
    fireEvent.click(await screen.findByRole('option', { name: 'Ink studio' }));
    expect(screen.getByRole('button', { name: 'Ink', pressed: true })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Polish' }));
    fireEvent.click(screen.getByRole('button', { name: 'Use Brand Default palette' }));
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Creator Profile' }), {
      key: 'ArrowDown',
    });
    fireEvent.click(await screen.findByRole('option', { name: 'No reusable profile' }));
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Creator Profile' }), {
      key: 'ArrowDown',
    });
    fireEvent.click(await screen.findByRole('option', { name: 'Ink studio' }));
    expect(screen.getByRole('button', { name: 'Polish', pressed: true })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(useStore.getState().settings).toEqual(settings);
    expect(useStore.getState().currentProject).toEqual(project);
    expect(callbacks.onCreate).not.toHaveBeenCalled();
    rerender(<NewProjectDialog {...callbacks} open={false} />);
    rerender(<NewProjectDialog {...callbacks} />);
    fireEvent.click(screen.getByRole('button', { name: 'Create project and process' }));
    expect(callbacks.onCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        profileId: profile.id,
        appearance: { storyboardStyle: 'polish', paletteId: 'brand' },
      }),
    );
  });

  it('blocks a missing custom palette until explicitly repaired', () => {
    useStore.getState().setOutputMode('longform');
    useStore.getState().setLongformPaletteId('missing-custom');
    render(
      <NewProjectDialog {...props()} initialSource={{ kind: 'file', value: '/source.mp4' }} />,
    );
    fireEvent.change(screen.getByLabelText('Project name'), {
      target: { value: 'Palette repair' },
    });
    expect(screen.getByRole('alert')).toHaveTextContent('unavailable');
    expect(screen.getByRole('button', { name: 'Create project and process' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Use Brand Default palette' }));
    expect(screen.getByRole('button', { name: 'Create project and process' })).toBeEnabled();
  });

  it('retains entered brief text while hiding irrelevant long-form prompts', async () => {
    const callbacks = props();
    render(<NewProjectDialog {...callbacks} />);
    fireEvent.click(screen.getByRole('button', { name: /choose video/i }));
    await screen.findByText('/source.mp4');
    fireEvent.click(screen.getByText(/add creative brief/i));
    fireEvent.change(screen.getByLabelText('Audience'), { target: { value: 'Creators' } });
    await chooseMode('Long-form edit (16:9)');
    expect(screen.queryByLabelText('Audience')).not.toBeInTheDocument();
    expect(screen.getByText(/not used for initial scene planning/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /create project and process/i }));
    expect(callbacks.onCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        outputMode: 'longform',
        brief: { audience: 'Creators', goal: '', callToAction: '' },
      }),
    );
    await chooseMode('Short clips (9:16)');
    expect(screen.getByLabelText('Audience')).toHaveValue('Creators');
  });

  it('validates URLs and permits backend-supported legacy /v/ URLs', () => {
    const callbacks = props();
    render(<NewProjectDialog {...callbacks} />);
    fireEvent.change(screen.getByLabelText('Project name'), { target: { value: 'URL draft' } });
    fireEvent.change(screen.getByLabelText('YouTube URL'), {
      target: { value: 'https://example.com/video' },
    });
    fireEvent.click(screen.getByRole('button', { name: /create project and process/i }));
    expect(screen.getByRole('alert')).toHaveTextContent('Paste a valid YouTube video URL');
    expect(callbacks.onCreate).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('YouTube URL'), {
      target: { value: 'https://www.youtube.com/v/dQw4w9WgXcQ?start=10' },
    });
    fireEvent.click(screen.getByRole('button', { name: /create project and process/i }));
    expect(callbacks.onCreate).toHaveBeenCalledTimes(1);
  });

  it('retains URL selection through setup and requires explicit confirmation afterward', async () => {
    useStore.setState({ pythonStatus: 'checking' });
    const callbacks = props();
    render(
      <NewProjectDialog
        {...callbacks}
        intent="add"
        initialSource={{ kind: 'url', value: 'https://youtu.be/dQw4w9WgXcQ' }}
      />,
    );
    expect(screen.getByRole('button', { name: /add source and process/i })).toBeDisabled();
    act(() => useStore.setState({ pythonStatus: 'ready' }));
    expect(callbacks.onCreate).not.toHaveBeenCalled();
    expect(screen.getByLabelText('YouTube URL')).toHaveValue('https://youtu.be/dQw4w9WgXcQ');
    fireEvent.click(screen.getByRole('button', { name: /add source and process/i }));
    await waitFor(() => expect(callbacks.onCreate).toHaveBeenCalledTimes(1));
  });

  it('does not clear a selected file when the replacement chooser is cancelled', async () => {
    const callbacks = props();
    callbacks.onChooseFile.mockResolvedValue(null);
    render(
      <NewProjectDialog
        {...callbacks}
        intent="add"
        initialSource={{ kind: 'file', value: '/kept.mp4' }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /change video/i }));
    await waitFor(() => expect(callbacks.onChooseFile).toHaveBeenCalledTimes(1));
    expect(screen.getByText('/kept.mp4')).toBeInTheDocument();
    expect(callbacks.onCreate).not.toHaveBeenCalled();
  });
});

describe('entry URL hint', () => {
  it.each([
    'https://youtu.be/dQw4w9WgXcQ?t=30',
    'https://m.youtube.com/watch?feature=share&v=dQw4w9WgXcQ',
    'https://youtube.com/embed/dQw4w9WgXcQ',
    'https://youtube.com/v/dQw4w9WgXcQ',
    'https://youtube.com/shorts/dQw4w9WgXcQ',
  ])('allows %s', (url) => {
    expect(isYouTubeUrl(url)).toBe(true);
  });
  it.each([
    'https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ',
    'https://evil.example/youtu.be/dQw4w9WgXcQ',
    'javascript:alert(1)',
  ])('rejects %s', (url) => {
    expect(isYouTubeUrl(url)).toBe(false);
  });
});
