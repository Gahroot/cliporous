import type { RecentProjectEntry } from '@shared/recent-projects';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RecentProjectLibrary } from '@/components/RecentProjectLibrary';
import { revealItemLabel } from '@/lib/platform';

afterEach(cleanup);

function project(name: string, overrides: Partial<RecentProjectEntry> = {}): RecentProjectEntry {
  return {
    path: `/projects/${name}.batchclip`,
    name,
    sourceName: `${name}-interview.mp4`,
    lastOpened: 1000,
    clipCount: 3,
    selectedCount: 1,
    sourceCount: 1,
    kind: 'short',
    stage: 'ready',
    missingMedia: false,
    pinned: false,
    poster: null,
    selectedFrames: [],
    ...overrides,
  };
}

const alpha = project('Alpha');
const beta = project('Beta', { kind: 'longform', stage: 'done', lastOpened: 2000 });
const missing = project('Missing', {
  missingMedia: true,
  stage: 'done',
  pinned: true,
  lastOpened: 500,
});
const failed = project('Failed', { kind: 'longform', stage: 'error', lastOpened: 1500 });
const projects = [alpha, beta, missing, failed];

function props(entries = projects) {
  return {
    projects: entries,
    loading: false,
    error: null,
    busyPath: null,
    onRetry: vi.fn(),
    onOpen: vi.fn(),
    onNewProject: vi.fn(),
    onOpenProjectFile: vi.fn(),
    onReveal: vi.fn(),
    onPin: vi.fn(),
    onRename: vi.fn(),
    onDuplicate: vi.fn(),
    onRemove: vi.fn(),
    onDelete: vi.fn(),
  };
}

async function select(name: string, option: string) {
  fireEvent.keyDown(screen.getByRole('combobox', { name }), { key: 'ArrowDown' });
  fireEvent.click(await screen.findByRole('option', { name: option }));
}

async function menu(name: string, action: string) {
  fireEvent.keyDown(screen.getByRole('button', { name: `Project actions for ${name}` }), {
    key: 'ArrowDown',
  });
  fireEvent.click(await screen.findByRole('menuitem', { name: action }));
}

function visibleNames() {
  return within(screen.getByRole('list', { name: 'Saved projects' }))
    .getAllByRole('listitem')
    .map((row) =>
      within(row)
        .getByRole('button', { name: /^Project actions for/ })
        .getAttribute('aria-label')
        ?.replace('Project actions for ', ''),
    );
}

describe('RecentProjectLibrary', () => {
  it('uses one library and preserves search, kind, status and sort when switching grid/list', async () => {
    const callbacks = props();
    render(<RecentProjectLibrary {...callbacks} />);
    expect(screen.getByRole('button', { name: 'Grid' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('list', { name: 'Saved projects' })).toHaveClass('grid');
    fireEvent.click(screen.getByRole('button', { name: 'List' }));
    expect(visibleNames()).toEqual(['Beta', 'Failed', 'Alpha', 'Missing']);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '  INTERVIEW  ' } });
    await select('Filter project kind', 'Short clips');
    await select('Filter saved status', 'Review');
    await select('Sort projects', 'Pinned first');
    expect(visibleNames()).toEqual(['Alpha']);
    fireEvent.click(screen.getByRole('button', { name: 'Grid' }));
    expect(screen.getByRole('list', { name: 'Saved projects' })).toHaveClass('grid');
    expect(screen.getByRole('button', { name: 'Grid' })).toHaveAttribute('aria-pressed', 'true');
    expect(visibleNames()).toEqual(['Alpha']);
    expect(screen.getAllByText('Alpha')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'List' }));
    expect(screen.getByRole('list', { name: 'Saved projects' })).not.toHaveClass('grid');
    expect(screen.getByRole('searchbox')).toHaveValue('  INTERVIEW  ');
    expect(screen.getByRole('combobox', { name: 'Filter project kind' })).toHaveTextContent(
      'Short clips',
    );
    expect(screen.getByRole('combobox', { name: 'Filter saved status' })).toHaveTextContent(
      'Review',
    );
    expect(screen.getByRole('combobox', { name: 'Sort projects' })).toHaveTextContent(
      'Pinned first',
    );
    expect(callbacks.onOpen).not.toHaveBeenCalled();
  });

  it.each<[string, string[]]>([
    ['Review', ['Alpha']],
    ['Exported', ['Beta', 'Missing']],
    ['Needs attention', ['Failed']],
    ['Media missing', ['Missing']],
  ])('filters by the real saved %s status', async (status, names) => {
    render(<RecentProjectLibrary {...props()} />);
    await select('Filter saved status', status);
    expect(visibleNames()).toEqual(names);
  });

  it('keeps selected filters after project refresh and sorts equal timestamps deterministically without mutating input', async () => {
    const entries = [
      project('Zeta', { kind: 'longform' }),
      beta,
      project('Aardvark', { kind: 'longform' }),
      alpha,
    ];
    const callbacks = props(entries);
    const { rerender } = render(<RecentProjectLibrary {...callbacks} />);
    await select('Filter project kind', 'Long-form');
    await select('Filter saved status', 'Review');
    expect(visibleNames()).toEqual(['Aardvark', 'Zeta']);
    rerender(<RecentProjectLibrary {...callbacks} projects={[...entries].reverse()} />);
    expect(visibleNames()).toEqual(['Aardvark', 'Zeta']);
    expect(entries.map((item) => item.name)).toEqual(['Zeta', 'Beta', 'Aardvark', 'Alpha']);
    await select('Sort projects', 'Pinned first');
    rerender(
      <RecentProjectLibrary
        {...callbacks}
        projects={entries.map((item) => (item.name === 'Zeta' ? { ...item, pinned: true } : item))}
      />,
    );
    expect(visibleNames()).toEqual(['Zeta', 'Aardvark']);
  });

  it('recovers from a combined zero-result filter without resetting layout or sort', async () => {
    render(<RecentProjectLibrary {...props()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Grid' }));
    await select('Sort projects', 'Pinned first');
    await select('Filter project kind', 'Long-form');
    await select('Filter saved status', 'Media missing');
    expect(screen.getByRole('status')).toHaveTextContent('No projects match these filters');
    expect(screen.queryByRole('list', { name: 'Saved projects' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show all projects' }));
    expect(screen.getByRole('combobox', { name: 'Filter project kind' })).toHaveTextContent(
      'All kinds',
    );
    expect(screen.getByRole('combobox', { name: 'Filter saved status' })).toHaveTextContent(
      'All statuses',
    );
    expect(screen.getByRole('list', { name: 'Saved projects' })).toHaveClass('grid');
    expect(visibleNames()).toEqual(['Missing', 'Beta', 'Failed', 'Alpha']);
  });

  it.each(['Grid', 'List'])('retains open and recovery actions in %s view', async (view) => {
    const callbacks = props();
    render(<RecentProjectLibrary {...callbacks} />);
    fireEvent.click(screen.getByRole('button', { name: view }));
    fireEvent.click(screen.getByRole('button', { name: /Alpha.*Resume review/ }));
    expect(callbacks.onOpen).toHaveBeenLastCalledWith(alpha);
    await menu('Missing', 'Open to relink media');
    expect(callbacks.onOpen).toHaveBeenLastCalledWith(missing);
    await menu('Failed', 'Open to recover');
    expect(callbacks.onOpen).toHaveBeenLastCalledWith(failed);
    await menu('Beta', 'Review exports');
    expect(callbacks.onOpen).toHaveBeenLastCalledWith(beta);
  });

  it.each([
    'Grid',
    'List',
  ])('retains reveal, pin, duplicate and remove actions in %s view', async (view) => {
    const callbacks = props();
    render(<RecentProjectLibrary {...callbacks} />);
    fireEvent.click(screen.getByRole('button', { name: view }));
    await menu('Alpha', revealItemLabel());
    expect(callbacks.onReveal).toHaveBeenCalledWith(alpha);
    await menu('Alpha', 'Pin project');
    expect(callbacks.onPin).toHaveBeenLastCalledWith(alpha);
    await menu('Missing', 'Unpin project');
    expect(callbacks.onPin).toHaveBeenLastCalledWith(missing);
    await menu('Alpha', 'Duplicate');
    expect(callbacks.onDuplicate).toHaveBeenCalledWith(alpha);
    await menu('Alpha', 'Remove from Recents');
    expect(callbacks.onRemove).toHaveBeenCalledWith(alpha);
    expect(callbacks.onDelete).not.toHaveBeenCalled();
  });

  it.each(['Grid', 'List'])('retains rename and confirmed deletion in %s view', async (view) => {
    const callbacks = props();
    render(<RecentProjectLibrary {...callbacks} />);
    fireEvent.click(screen.getByRole('button', { name: view }));
    await menu('Alpha', 'Rename');
    fireEvent.change(screen.getByLabelText('Project name'), {
      target: { value: '  Renamed cut  ' },
    });
    fireEvent.keyDown(screen.getByLabelText('Project name'), { key: 'Enter' });
    expect(callbacks.onRename).toHaveBeenCalledWith(alpha, 'Renamed cut');
    await menu('Alpha', 'Delete project file');
    expect(screen.getByRole('alertdialog')).toHaveTextContent(
      'Source videos and rendered exports stay on disk',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(callbacks.onDelete).not.toHaveBeenCalled();
    await menu('Alpha', 'Delete project file');
    fireEvent.click(screen.getByRole('button', { name: 'Delete project file' }));
    expect(callbacks.onDelete).toHaveBeenCalledTimes(1);
    expect(callbacks.onDelete).toHaveBeenCalledWith(alpha);
  });

  it.each(['Grid', 'List'])('blocks actions for all projects while busy in %s view', (view) => {
    const callbacks = props();
    render(<RecentProjectLibrary {...callbacks} busyPath={alpha.path} />);
    fireEvent.click(screen.getByRole('button', { name: view }));
    for (const button of within(screen.getByRole('list', { name: 'Saved projects' })).getAllByRole(
      'button',
    )) {
      expect(button).toBeDisabled();
      fireEvent.click(button);
    }
    expect(callbacks.onOpen).not.toHaveBeenCalled();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('disables an already-open action menu when another operation starts', async () => {
    const callbacks = props();
    const { rerender } = render(<RecentProjectLibrary {...callbacks} />);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Project actions for Alpha' }), {
      key: 'ArrowDown',
    });
    await screen.findByRole('menu');
    rerender(<RecentProjectLibrary {...callbacks} busyPath={beta.path} />);
    for (const item of screen.getAllByRole('menuitem')) {
      expect(item).toHaveAttribute('aria-disabled', 'true');
      fireEvent.click(item);
    }
    expect(callbacks.onOpen).not.toHaveBeenCalled();
    expect(callbacks.onRemove).not.toHaveBeenCalled();
    expect(callbacks.onPin).not.toHaveBeenCalled();
  });

  it('guards an already-open rename dialog against work starting on another project', async () => {
    const callbacks = props();
    const { rerender } = render(<RecentProjectLibrary {...callbacks} />);
    await menu('Alpha', 'Rename');
    rerender(<RecentProjectLibrary {...callbacks} busyPath={beta.path} />);
    fireEvent.change(screen.getByLabelText('Project name'), { target: { value: 'Blocked' } });
    fireEvent.keyDown(screen.getByLabelText('Project name'), { key: 'Enter' });
    expect(screen.getByRole('button', { name: 'Rename' })).toBeDisabled();
    expect(callbacks.onRename).not.toHaveBeenCalled();
  });

  it('guards an already-open delete confirmation against work starting on another project', async () => {
    const callbacks = props();
    const { rerender } = render(<RecentProjectLibrary {...callbacks} />);
    await menu('Alpha', 'Delete project file');
    rerender(<RecentProjectLibrary {...callbacks} busyPath={beta.path} />);
    const confirm = screen.getByRole('button', { name: 'Delete project file' });
    expect(confirm).toBeDisabled();
    fireEvent.click(confirm);
    expect(callbacks.onDelete).not.toHaveBeenCalled();
  });
});
