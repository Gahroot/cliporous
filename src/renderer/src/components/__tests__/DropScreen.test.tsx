/**
 * DropScreen.test.tsx
 *
 * - File drop on the drop-zone Card dispatches the file pipeline:
 *     • a SourceVideo with `origin: 'file'` is added
 *     • that source becomes active
 *     • `usePipeline().processVideo` is invoked with the new source
 * - Pasting a URL + pressing Enter dispatches the YouTube branch:
 *     • SourceVideo has `origin: 'youtube'` and the URL stored
 *     • processVideo is invoked
 * - Recent projects fetched from `window.api.getRecentProjects()` render
 *   as clickable rows.
 */

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createNewProject, loadProjectFromPath } from '@/services';
import { useStore } from '@/store';
import { installApiStub, resetStore } from './test-utils';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const processVideoMock = vi.fn(async () => undefined);

const processLongformMock = vi.fn(async () => undefined);

vi.mock('@/hooks', () => ({
  usePipeline: () => ({
    processVideo: processVideoMock,
    cancelProcessing: () => {},
    isProcessing: () => false,
  }),
  useLongformPipeline: () => ({
    processLongform: processLongformMock,
    cancelLongform: () => {},
  }),
  usePythonSetup: () => ({
    refresh: vi.fn(async () => undefined),
    start: vi.fn(async () => undefined),
    retry: vi.fn(async () => undefined),
    cancel: vi.fn(async () => undefined),
  }),
}));

vi.mock('@/services', () => ({
  createNewProject: vi.fn(),
  loadProject: vi.fn(async () => false),
  loadProjectFromPath: vi.fn(async () => false),
}));

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    error: vi.fn(),
    success: vi.fn(),
    message: vi.fn(),
  }),
}));

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  resetStore();
  installApiStub();
  vi.clearAllMocks();
  useStore.setState((state) => ({
    settings: { ...state.settings, outputMode: 'short', geminiApiKey: '' },
    processingConfig: { ...state.processingConfig, promoMode: false },
  }));
  vi.mocked(createNewProject).mockImplementation(() => useStore.getState().reset());
  vi.mocked(loadProjectFromPath).mockResolvedValue(false);
});

afterEach(async () => {
  await act(async () => {});
  cleanup();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a synthetic File object suitable for jsdom drag-and-drop. */
function makeVideoFile(name = 'clip.mp4'): File {
  return new File([new Uint8Array([0])], name, { type: 'video/mp4' });
}

/** Build a DataTransfer-like object jsdom accepts on drop events. */
function makeDataTransfer(files: File[]): DataTransfer {
  return {
    files: files as unknown as FileList,
    items: files.map((f) => ({
      kind: 'file',
      type: f.type,
      getAsFile: () => f,
    })) as unknown as DataTransferItemList,
    types: ['Files'],
    dropEffect: 'copy',
    effectAllowed: 'all',
    clearData: () => {},
    getData: () => '',
    setData: () => {},
    setDragImage: () => {},
  } as unknown as DataTransfer;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DropScreen', () => {
  it('accepts a file drop and dispatches the source action', async () => {
    // Short-form scoring is gated on a Gemini key — seed one so the happy path runs.
    useStore.setState((s) => ({ settings: { ...s.settings, geminiApiKey: 'test-key' } }));
    const { DropScreen } = await import('@/components/screens/DropScreen');
    render(<DropScreen />);

    const dropZone = screen.getByRole('button', {
      name: /choose a video file or drop it here/i,
    });

    const file = makeVideoFile('intro.mp4');
    const dataTransfer = makeDataTransfer([file]);

    fireEvent.drop(dropZone, { dataTransfer });
    expect(processVideoMock).not.toHaveBeenCalled();
    expect(window.api.getMetadata).not.toHaveBeenCalled();
    expect(useStore.getState().sources).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: /add source and process/i }));

    await waitFor(() => {
      expect(processVideoMock).toHaveBeenCalledTimes(1);
    });

    // Source was added with origin 'file' and is now active.
    const state = useStore.getState();
    expect(state.sources).toHaveLength(1);
    expect(state.sources[0]).toMatchObject({
      origin: 'file',
      path: '/virtual/intro.mp4',
      name: 'intro.mp4',
    });
    expect(state.activeSourceId).toBe(state.sources.at(0)?.id);

    expect(processVideoMock).toHaveBeenCalledWith(
      expect.objectContaining({ origin: 'file', path: '/virtual/intro.mp4' }),
    );
  });

  it('accepts a URL paste + Enter and dispatches the YouTube action', async () => {
    useStore.setState((s) => ({ settings: { ...s.settings, geminiApiKey: 'test-key' } }));
    const { DropScreen } = await import('@/components/screens/DropScreen');
    render(<DropScreen />);

    const input = screen.getByLabelText(/^youtube url$/i);
    const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

    fireEvent.change(input, { target: { value: url } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    expect(processVideoMock).not.toHaveBeenCalled();
    expect(window.api.downloadYouTube).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /add source and process/i }));

    await waitFor(() => {
      expect(processVideoMock).toHaveBeenCalledTimes(1);
    });

    const state = useStore.getState();
    expect(state.sources).toHaveLength(1);
    expect(state.sources[0]).toMatchObject({
      origin: 'youtube',
      youtubeUrl: url,
      name: url,
    });
    expect(state.activeSourceId).toBe(state.sources.at(0)?.id);
  });

  it('keeps a source through setup and cancellation without automatically processing', async () => {
    useStore.setState((state) => ({
      settings: { ...state.settings, geminiApiKey: 'test-key' },
      pythonStatus: 'checking',
    }));
    const { DropScreen } = await import('@/components/screens/DropScreen');
    render(<DropScreen />);

    const dropZone = screen.getByRole('button', {
      name: /choose a video file or drop it here/i,
    });
    fireEvent.drop(dropZone, {
      dataTransfer: makeDataTransfer([makeVideoFile('queued-interview.mp4')]),
    });

    expect(useStore.getState().sources).toHaveLength(0);
    expect(processVideoMock).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /add source and process/i })).toBeDisabled();

    act(() => {
      useStore.setState({
        pythonStatus: 'not-setup',
        pythonSetupDetails: {
          ready: false,
          stage: 'not-setup',
          storagePath: '/virtual/BatchClip/python-env',
          freeDiskBytes: 20 * 1024 ** 3,
          networkOnline: true,
          venvPath: null,
          embeddedPythonAvailable: false,
        },
      });
    });
    expect(screen.getByText(/Processing will not start automatically/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
    act(() => useStore.setState({ pythonStatus: 'ready' }));
    expect(processVideoMock).not.toHaveBeenCalled();
    expect(window.api.getMetadata).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /review import/i }));
    expect(screen.getByText('/virtual/queued-interview.mp4')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /add source and process/i }));
    await waitFor(() => expect(processVideoMock).toHaveBeenCalledTimes(1));
  });

  it('blocks a keyless short-form drop and surfaces the missing-key gate', async () => {
    // No Gemini key in store and secrets.get returns null — the gate must fire.
    useStore.setState((s) => ({ settings: { ...s.settings, geminiApiKey: '' } }));
    const { DropScreen } = await import('@/components/screens/DropScreen');
    render(<DropScreen />);

    const dropZone = screen.getByRole('button', {
      name: /choose a video file or drop it here/i,
    });
    fireEvent.drop(dropZone, { dataTransfer: makeDataTransfer([makeVideoFile('intro.mp4')]) });
    fireEvent.click(screen.getByRole('button', { name: /add source and process/i }));

    expect(await screen.findByText(/gemini api key required/i)).toBeInTheDocument();
    expect(processVideoMock).not.toHaveBeenCalled();
    expect(useStore.getState().sources).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: /open settings/i }));
    expect(window.api.openSettingsWindow).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
    act(() =>
      useStore.setState((state) => ({ settings: { ...state.settings, geminiApiKey: 'new-key' } })),
    );
    expect(processVideoMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /review import/i }));
    expect(screen.getByText('/virtual/intro.mp4')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /add source and process/i }));
    await waitFor(() => expect(processVideoMock).toHaveBeenCalledTimes(1));
  });

  it('allows a keyless local Promo Mode recording to start', async () => {
    useStore.setState((state) => ({
      settings: { ...state.settings, geminiApiKey: '' },
      processingConfig: { ...state.processingConfig, promoMode: true },
    }));
    const { DropScreen } = await import('@/components/screens/DropScreen');
    render(<DropScreen />);

    const dropZone = screen.getByRole('button', {
      name: /choose a video file or drop it here/i,
    });
    fireEvent.drop(dropZone, {
      dataTransfer: makeDataTransfer([makeVideoFile('scripted-promo.mp4')]),
    });
    expect(processVideoMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /add source and process/i }));

    await waitFor(() => expect(processVideoMock).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/gemini api key required/i)).not.toBeInTheDocument();
  });

  it('creates a named project with a chosen source and output mode', async () => {
    useStore.setState((state) => ({ settings: { ...state.settings, geminiApiKey: 'test-key' } }));
    installApiStub({ openFiles: vi.fn(async () => ['/virtual/creator-interview.mp4']) });

    const { DropScreen } = await import('@/components/screens/DropScreen');
    render(<DropScreen />);

    fireEvent.click(screen.getByRole('button', { name: /new project/i }));
    fireEvent.change(screen.getByLabelText(/project name/i), {
      target: { value: 'Launch selects' },
    });
    fireEvent.click(screen.getByRole('button', { name: /choose video/i }));
    expect(await screen.findByText('/virtual/creator-interview.mp4')).toBeInTheDocument();
    fireEvent.click(screen.getByText(/add creative brief/i));
    fireEvent.change(within(screen.getByRole('dialog')).getByLabelText(/audience/i), {
      target: { value: 'Independent creators' },
    });
    fireEvent.click(screen.getByRole('button', { name: /create project/i }));

    await waitFor(() => expect(processVideoMock).toHaveBeenCalledTimes(1));
    expect(createNewProject).toHaveBeenCalledTimes(1);
    expect(useStore.getState().currentProject.displayName).toBe('Launch selects');
    expect(useStore.getState().sources[0]?.name).toBe('creator-interview.mp4');
    expect(useStore.getState().creativeBrief.audience).toBe('Independent creators');
  });

  it('browses locally without resetting the current project', async () => {
    useStore.setState((state) => ({ settings: { ...state.settings, geminiApiKey: 'test-key' } }));
    const existing = {
      id: 'existing',
      path: '/old.mp4',
      name: 'old.mp4',
      duration: 60,
      width: 1920,
      height: 1080,
      origin: 'file' as const,
    };
    useStore.getState().addSource(existing);
    useStore.getState().setProjectDisplayName('Keep this project');
    const projectId = useStore.getState().currentProject.id;
    installApiStub({ openFiles: vi.fn(async () => ['/virtual/new.mp4']) });
    const { DropScreen } = await import('@/components/screens/DropScreen');
    render(<DropScreen />);
    fireEvent.click(screen.getByRole('button', { name: /^import video$/i }));
    expect(await screen.findByText('/virtual/new.mp4')).toBeInTheDocument();
    expect(screen.getByText(/Existing sources and work are kept/)).toBeInTheDocument();
    expect(window.api.getMetadata).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /add source and process/i }));
    await waitFor(() => expect(processVideoMock).toHaveBeenCalledTimes(1));
    expect(createNewProject).not.toHaveBeenCalled();
    expect(useStore.getState().currentProject.id).toBe(projectId);
    expect(useStore.getState().sources).toHaveLength(2);
    expect(useStore.getState().sources[0]).toEqual(existing);
  });

  it('returns keyboard focus after cancelling and retains the selected file', async () => {
    installApiStub({ openFiles: vi.fn(async () => ['/virtual/kept.mp4']) });
    const { DropScreen } = await import('@/components/screens/DropScreen');
    render(<DropScreen />);
    const importButton = screen.getByRole('button', { name: /^import video$/i });
    importButton.focus();
    fireEvent.click(importButton);
    await screen.findByText('/virtual/kept.mp4');
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    await waitFor(() => expect(importButton).toHaveFocus());
    expect(processVideoMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /review import/i }));
    expect(screen.getByText('/virtual/kept.mp4')).toBeInTheDocument();
  });

  it('keeps a new-project draft after a declined replacement and resets only on approval', async () => {
    useStore.setState((state) => ({
      settings: { ...state.settings, geminiApiKey: 'test-key' },
      isDirty: true,
    }));
    const originalId = useStore.getState().currentProject.id;
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    installApiStub({ openFiles: vi.fn(async () => ['/virtual/new.mp4']) });
    const { DropScreen } = await import('@/components/screens/DropScreen');
    render(<DropScreen />);
    fireEvent.click(screen.getAllByRole('button', { name: /^new project$/i })[0]);
    fireEvent.click(screen.getByRole('button', { name: /choose video/i }));
    await screen.findByText('/virtual/new.mp4');
    fireEvent.click(screen.getByRole('button', { name: /create project and process/i }));
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
    expect(createNewProject).not.toHaveBeenCalled();
    expect(useStore.getState().currentProject.id).toBe(originalId);
    expect(processVideoMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
    fireEvent.click(screen.getAllByRole('button', { name: /^new project$/i })[0]);
    expect(screen.getByText('/virtual/new.mp4')).toBeInTheDocument();
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: /create project and process/i }));
    await waitFor(() => expect(processVideoMock).toHaveBeenCalledTimes(1));
    expect(createNewProject).toHaveBeenCalledTimes(1);
    expect(useStore.getState().currentProject.id).not.toBe(originalId);
  });

  it('keeps the current project when metadata fails and allows retrying the selected source', async () => {
    useStore.setState((state) => ({ settings: { ...state.settings, geminiApiKey: 'test-key' } }));
    const getMetadata = vi
      .fn()
      .mockRejectedValueOnce(new Error('Unreadable source'))
      .mockResolvedValue({ duration: 60, width: 1920, height: 1080 });
    installApiStub({ getMetadata, openFiles: vi.fn(async () => ['/virtual/new.mp4']) });
    const { DropScreen } = await import('@/components/screens/DropScreen');
    render(<DropScreen />);
    fireEvent.click(screen.getAllByRole('button', { name: /^new project$/i })[0]);
    fireEvent.click(screen.getByRole('button', { name: /choose video/i }));
    await screen.findByText('/virtual/new.mp4');
    fireEvent.click(screen.getByRole('button', { name: /create project and process/i }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/Unreadable source/));
    expect(createNewProject).not.toHaveBeenCalled();
    expect(processVideoMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /create project and process/i }));
    await waitFor(() => expect(processVideoMock).toHaveBeenCalledTimes(1));
  });

  it('uses the remembered long-form outcome without discarding the existing brief', async () => {
    useStore.setState((state) => ({
      settings: { ...state.settings, geminiApiKey: 'test-key', outputMode: 'longform' },
    }));
    useStore.getState().setCreativeBrief({ notes: 'Keep these instructions' });
    const brief = useStore.getState().creativeBrief;
    const { DropScreen } = await import('@/components/screens/DropScreen');
    render(<DropScreen />);
    fireEvent.drop(screen.getByRole('button', { name: /choose a video file or drop/i }), {
      dataTransfer: makeDataTransfer([makeVideoFile()]),
    });
    expect(screen.getByText(/not used for initial scene planning/)).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /output mode/i })).toHaveTextContent('Long-form');
    expect(processLongformMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /add source and process/i }));
    await waitFor(() => expect(processLongformMock).toHaveBeenCalledTimes(1));
    expect(processVideoMock).not.toHaveBeenCalled();
    expect(useStore.getState().creativeBrief).toEqual(brief);
  });

  it.each([
    'https://evil.example/youtu.be/dQw4w9WgXcQ',
    'file:///video.mp4',
    'not a url',
  ])('rejects invalid URL %s without generating', async (value) => {
    const { DropScreen } = await import('@/components/screens/DropScreen');
    render(<DropScreen />);
    await screen.findByText('No saved projects yet');
    fireEvent.change(screen.getByLabelText(/^youtube url$/i), { target: { value } });
    fireEvent.click(screen.getByRole('button', { name: /import youtube url/i }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Paste a valid YouTube URL');
    expect(processVideoMock).not.toHaveBeenCalled();
  });

  it('ignores a cancelled file chooser and rejects unsupported drops', async () => {
    const { DropScreen } = await import('@/components/screens/DropScreen');
    render(<DropScreen />);
    fireEvent.click(screen.getByRole('button', { name: /^import video$/i }));
    await waitFor(() => expect(window.api.openFiles).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.drop(screen.getByRole('button', { name: /choose a video file or drop/i }), {
      dataTransfer: makeDataTransfer([makeVideoFile('notes.txt')]),
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Unsupported file type');
    expect(processVideoMock).not.toHaveBeenCalled();
  });

  it('does not replace a project while work is active', async () => {
    useStore.setState((state) => ({ pipeline: { ...state.pipeline, stage: 'transcribing' } }));
    const { DropScreen } = await import('@/components/screens/DropScreen');
    render(<DropScreen />);
    await screen.findByText('No saved projects yet');
    fireEvent.drop(screen.getByRole('button', { name: /choose a video file or drop/i }), {
      dataTransfer: makeDataTransfer([makeVideoFile('saved.batchclip')]),
    });
    expect(screen.getByRole('alert')).toHaveTextContent(/Finish or cancel active work/);
    expect(loadProjectFromPath).not.toHaveBeenCalled();
    expect(createNewProject).not.toHaveBeenCalled();
  });

  it('preserves a new URL project through a missing key without resetting until reconfirmed', async () => {
    const { DropScreen } = await import('@/components/screens/DropScreen');
    render(<DropScreen />);
    fireEvent.click(screen.getAllByRole('button', { name: /^new project$/i })[0]);
    fireEvent.change(screen.getByLabelText('Project name'), { target: { value: 'URL project' } });
    fireEvent.change(within(screen.getByRole('dialog')).getByLabelText('YouTube URL'), {
      target: { value: 'https://youtube.com/v/dQw4w9WgXcQ' },
    });
    fireEvent.click(screen.getByRole('button', { name: /create project and process/i }));
    await screen.findByText('Gemini API key required');
    expect(createNewProject).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
    act(() =>
      useStore.setState((state) => ({ settings: { ...state.settings, geminiApiKey: 'new-key' } })),
    );
    expect(processVideoMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getAllByRole('button', { name: /^new project$/i })[0]);
    expect(screen.getByLabelText('Project name')).toHaveValue('URL project');
    expect(within(screen.getByRole('dialog')).getByLabelText('YouTube URL')).toHaveValue(
      'https://youtube.com/v/dQw4w9WgXcQ',
    );
    fireEvent.click(screen.getByRole('button', { name: /create project and process/i }));
    await waitFor(() => expect(processVideoMock).toHaveBeenCalledTimes(1));
    expect(createNewProject).toHaveBeenCalledTimes(1);
    expect(useStore.getState().sources[0]?.youtubeUrl).toBe('https://youtube.com/v/dQw4w9WgXcQ');
  });

  it.each([
    ['ready', true, 'Open to relink media'],
    ['error', false, 'Open to recover'],
    ['done', false, 'Review exports'],
  ])('opens saved %s projects through the existing restoration service', async (stage, missingMedia, action) => {
    installApiStub({
      getRecentProjects: vi.fn(async () => [
        {
          path: '/saved.batchclip',
          name: 'Saved cut',
          stage,
          missingMedia,
          lastOpened: Date.now(),
          clipCount: 2,
          selectedCount: 1,
          sourceCount: 1,
        },
      ]),
    });
    vi.mocked(loadProjectFromPath).mockResolvedValue(true);
    const { DropScreen } = await import('@/components/screens/DropScreen');
    render(<DropScreen />);
    await screen.findByText('Saved cut');
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`Saved cut.*${action}`) }));
    await waitFor(() => expect(loadProjectFromPath).toHaveBeenCalledWith('/saved.batchclip'));
    expect(processVideoMock).not.toHaveBeenCalled();
    expect(processLongformMock).not.toHaveBeenCalled();
  });

  it('renders recent projects when present', async () => {
    installApiStub({
      getRecentProjects: vi.fn(async () => [
        {
          path: '/projects/alpha.batchclip',
          name: 'Alpha',
          lastOpened: Date.now() - 60_000,
          clipCount: 4,
          sourceCount: 1,
        },
        {
          path: '/projects/beta.batchclip',
          name: 'Beta',
          lastOpened: Date.now() - 3_600_000,
          clipCount: 12,
          sourceCount: 2,
        },
      ]),
    });

    const { DropScreen } = await import('@/components/screens/DropScreen');
    render(<DropScreen />);

    expect(await screen.findByText('Alpha')).toBeInTheDocument();
    expect(await screen.findByText('Beta')).toBeInTheDocument();
    expect(screen.getByText(/4 clips/)).toBeInTheDocument();
    expect(screen.getByText(/12 clips/)).toBeInTheDocument();
    expect(screen.getAllByText('Alpha')).toHaveLength(1);
    expect(screen.getByText(/does not restart automatically/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Alpha.*Open saved progress/i }));
    await waitFor(() =>
      expect(loadProjectFromPath).toHaveBeenCalledWith('/projects/alpha.batchclip'),
    );

    fireEvent.change(screen.getByRole('searchbox', { name: /search recent projects/i }), {
      target: { value: 'Alpha' },
    });
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.queryByText('Beta')).not.toBeInTheDocument();
  });

  it('shows a useful empty state when no recent projects exist', async () => {
    const { DropScreen } = await import('@/components/screens/DropScreen');
    render(<DropScreen />);

    expect(await screen.findByText('No saved projects yet')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /new project/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: /open project/i }).length).toBeGreaterThan(0);
  });

  it('shows a recent-project error and recovers through retry', async () => {
    const getRecentProjects = vi
      .fn()
      .mockRejectedValueOnce(new Error('Recent index unavailable'))
      .mockResolvedValueOnce([
        {
          path: '/projects/recovered.batchclip',
          name: 'Recovered project',
          sourceName: 'interview.mp4',
          lastOpened: Date.now(),
          clipCount: 2,
          selectedCount: 1,
          sourceCount: 1,
          kind: 'short',
          stage: 'ready',
          missingMedia: false,
          pinned: false,
          poster: null,
          selectedFrames: [],
        },
      ]);
    installApiStub({ getRecentProjects });

    const { DropScreen } = await import('@/components/screens/DropScreen');
    render(<DropScreen />);

    expect(await screen.findByText('Recent projects could not load')).toBeInTheDocument();
    expect(screen.getByText('Recent index unavailable')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));

    expect(await screen.findByText('Recovered project')).toBeInTheDocument();
    expect(getRecentProjects).toHaveBeenCalledTimes(2);
  });
});
