import type { LongformRenderReconciliation } from '@shared/types';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CutPlanReconciliation } from '@/components/CutPlanReconciliation';
import { makeScenePlan } from './longform-scene-fixture';
import { installApiStub } from './test-utils';

const zero = { planned: 0, eligible: 0, rendered: 0, dropped: 0 };
const legacy: LongformRenderReconciliation = {
  renderedAt: 1,
  outputPath: '/exports/legacy.mp4',
  blocks: { planned: 1, eligible: 1, rendered: 1, dropped: 0 },
  phrases: zero,
  cards: zero,
  fallbacks: [],
};
beforeEach(() => installApiStub({ openPath: vi.fn(async () => '') }));
afterEach(cleanup);

describe('CutPlanReconciliation', () => {
  it('keeps legacy counts/history working without scene fields', () => {
    render(<CutPlanReconciliation reconciliation={legacy} />);
    expect(screen.getByText('Every approved visual beat rendered as planned.')).toBeInTheDocument();
    expect(screen.getByText('Content blocks')).not.toBeVisible();
    fireEvent.click(screen.getByText('Export details'));
    expect(screen.getByText('Content blocks')).toBeVisible();
    expect(screen.queryByText('Scene render results')).not.toBeInTheDocument();
  });
  it('does not claim a match for failed/omitted scenes and gives stable-ID outcomes and repair guidance', () => {
    render(
      <CutPlanReconciliation
        reconciliation={{
          ...legacy,
          blocks: zero,
          scenes: { planned: 3, eligible: 2, rendered: 1, dropped: 2 },
          sceneResults: [
            { id: 'scene-good', kind: 'statement', startTime: 1, endTime: 3, status: 'rendered' },
            {
              id: 'scene-failed',
              kind: 'checklist',
              startTime: 5,
              endTime: 9,
              status: 'failed',
              reason: 'Rendering timed out',
            },
            {
              id: 'scene-omitted',
              kind: 'statement',
              startTime: 11,
              endTime: 13,
              status: 'omitted',
              reason: 'Omitted by creator',
            },
          ],
        }}
      />,
    );
    expect(
      screen.queryByText('Every approved visual beat rendered as planned.'),
    ).not.toBeInTheDocument();
    const issues = screen.getByRole('region', { name: 'Needs review' });
    expect(within(issues).getAllByRole('listitem')).toHaveLength(2);
    expect(within(issues).getByText('Failed')).toBeVisible();
    expect(within(issues).getByText('Omitted')).toBeVisible();
    expect(screen.getAllByText(/Reviewing does not change the existing file/)).toHaveLength(1);
    expect(
      screen.getByText(/The source video remains where explanations did not render/),
    ).toBeVisible();
    expect(screen.getByText(/scene-failed/)).not.toBeVisible();
    expect(screen.getByText('Rendering timed out')).not.toBeVisible();
    fireEvent.click(screen.getByText('Export details'));
    expect(screen.getByText('Explanation scenes')).toBeVisible();
    expect(screen.getByText(/scene-failed/)).toBeVisible();
    expect(screen.getByText('Rendering timed out')).toBeVisible();
    expect(screen.getByText('Omitted by creator')).toBeVisible();
  });

  it('offers review for incomplete results without claiming clean success from an incomplete saved count', () => {
    const onReviewScene = vi.fn();
    const scenes = makeScenePlan().scenes;
    render(
      <CutPlanReconciliation
        reconciliation={{
          ...legacy,
          blocks: zero,
          scenes: { planned: 2, eligible: 2, rendered: 1, dropped: 0 },
          sceneResults: [],
        }}
        scenes={scenes}
        onReviewScene={onReviewScene}
        compact
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Completed with changes');
    const issues = screen.getByRole('region', { name: 'Needs review' });
    expect(within(issues).getAllByText('Not confirmed')).toHaveLength(2);
    expect(within(issues).getAllByRole('button', { name: /Review Statement/ })).toHaveLength(2);
    expect(screen.getAllByText('Statement · Not confirmed')).toHaveLength(2);
    for (const result of screen.getAllByText('Statement · Not confirmed')) {
      expect(result).not.toBeVisible();
    }
    const scene = scenes[1];
    if (!scene) throw new Error('Missing fixture scene');
    fireEvent.click(screen.getByRole('button', { name: 'Review Statement at 1:40' }));
    expect(onReviewScene).toHaveBeenCalledWith(scene.id);
    expect(screen.getByText(/Video file:.*legacy.mp4/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open video' })).toBeInTheDocument();
  });

  it('keeps a fully rendered scene export distinct from changed outcomes', () => {
    const scenes = makeScenePlan().scenes;
    render(
      <CutPlanReconciliation
        reconciliation={{
          ...legacy,
          blocks: zero,
          scenes: { planned: 2, eligible: 2, rendered: 2, dropped: 0 },
          sceneResults: scenes.map((scene) => ({ ...scene, status: 'rendered' })),
        }}
        scenes={scenes}
        onReviewScene={vi.fn()}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Completed as planned');
    expect(screen.queryByRole('button', { name: /Review Statement/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Needs review' })).not.toBeInTheDocument();
    for (const result of screen.getAllByText('Statement · Rendered')) {
      expect(result).not.toBeVisible();
    }
    fireEvent.click(screen.getByText('Export details'));
    for (const result of screen.getAllByText('Statement · Rendered')) {
      expect(result).toBeVisible();
    }
  });

  it('puts usable file actions first and uses the current scene label while preserving proof in a closed disclosure', async () => {
    const scenes = makeScenePlan().scenes;
    const [rendered, failed] = scenes;
    if (!rendered || !failed) throw new Error('Expected two fixture scenes');
    failed.label = 'A clearer explanation';
    const onReviewScene = vi.fn();
    render(
      <CutPlanReconciliation
        reconciliation={{
          ...legacy,
          blocks: zero,
          scenes: { planned: 2, eligible: 2, rendered: 1, dropped: 1 },
          sceneResults: [
            { ...rendered, status: 'rendered' },
            { ...failed, status: 'failed', reason: 'Rendering timed out' },
          ],
          fallbacks: [
            {
              type: 'segment',
              count: 1,
              label: 'Scene fallback',
              reason: 'Source footage retained',
            },
          ],
        }}
        scenes={scenes}
        onReviewScene={onReviewScene}
        reviewableSceneIds={scenes.map((scene) => scene.id)}
        compact
      />,
    );
    const actions = screen.getByRole('group', { name: 'Exported video actions' });
    const open = within(actions).getByRole('button', { name: 'Open video' });
    const reveal = within(actions).getByRole('button', { name: 'Show file' });
    const issues = screen.getByRole('region', { name: 'Needs review' });
    const summary = screen.getByText('Export details');
    const details = summary.closest('details');
    if (!details) throw new Error('Missing native export disclosure');
    expect(details).not.toHaveAttribute('open');
    expect(open).toBeVisible();
    expect(open).toHaveClass('bg-primary');
    expect(reveal).toBeVisible();
    expect(actions.previousElementSibling).toContainElement(screen.getByRole('status'));
    expect(actions.compareDocumentPosition(issues) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(open.closest('details')).toBeNull();
    expect(within(issues).getAllByRole('listitem')).toHaveLength(1);
    expect(within(issues).getByText(failed.label)).toBeVisible();
    expect(issues).toHaveTextContent('1:40–1:42 · Failed');
    expect(issues).not.toHaveTextContent(failed.id);
    expect(within(issues).queryByText(rendered.label)).not.toBeInTheDocument();
    expect(screen.getByText('Statement · Rendered')).not.toBeVisible();
    expect(screen.getByText(/Scene fallback: Source footage retained/)).not.toBeVisible();
    await act(async () => {
      fireEvent.click(open);
      fireEvent.click(reveal);
    });
    expect(window.api.openPath).toHaveBeenCalledWith(legacy.outputPath);
    expect(window.api.showItemInFolder).toHaveBeenCalledWith(legacy.outputPath);
    expect(details).not.toHaveAttribute('open');
    fireEvent.click(within(issues).getByRole('button', { name: /Review Statement/ }));
    expect(onReviewScene).toHaveBeenCalledWith(failed.id);
    summary.focus();
    expect(summary).toHaveFocus();
    fireEvent.click(summary);
    expect(details).toHaveAttribute('open');
    expect(screen.getByText('Statement · Rendered')).toBeVisible();
    expect(screen.getByText(/Scene fallback: Source footage retained/)).toBeVisible();
    expect(screen.getByText('Rendering timed out')).toBeVisible();
    const counts = within(details).getByRole('table');
    expect(within(counts).getByRole('columnheader', { name: 'Planned' })).toBeVisible();
    expect(within(counts).getByRole('columnheader', { name: 'Eligible' })).toBeVisible();
    expect(within(counts).getByRole('row', { name: 'Explanation scenes 2 2 1 1' })).toBeVisible();
    expect(screen.getByText(new RegExp(rendered.id))).toBeVisible();
    expect(screen.getByText(new RegExp(failed.id))).toBeVisible();
    fireEvent.click(summary);
    expect(details).not.toHaveAttribute('open');
    expect(open).toBeVisible();
    expect(screen.getByText('Statement · Rendered')).not.toBeVisible();
  });
});
