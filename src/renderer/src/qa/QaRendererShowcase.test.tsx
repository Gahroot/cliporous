import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useStore } from '@/store';
import { installQaApi } from './api';
import { parseQaState, QA_STATE_IDS, seedQaState } from './fixtures';
import { QaRendererShowcase } from './QaRendererShowcase';

afterEach(cleanup);

describe('deterministic renderer state showcase', () => {
  it('exposes every release-gate state from a stable hash route', () => {
    expect(parseQaState('#qa')).toBe('showcase');
    for (const stateId of QA_STATE_IDS) {
      expect(parseQaState(`#qa/${stateId}`)).toBe(stateId);
    }
    expect(parseQaState('#settings')).toBeNull();
  });

  it.each([
    'scene-review',
    'scene-export',
  ] as const)('seeds a source-grounded, approvable %s fixture', (stateId) => {
    seedQaState(stateId);
    const state = useStore.getState();
    const source = state.sources[0];
    if (!source) throw new Error('Scene fixture must contain its source.');
    const record = state.longformPlans[source.id];
    expect(record?.plan).toMatchObject({ mode: 'scene-first', sourceDuration: 20 });
    expect(state.transcriptions[source.id]?.words).toHaveLength(20);
    expect(state.clips[source.id]).toBeUndefined();
    if (stateId === 'scene-export') {
      expect(record?.status).toBe('accepted');
      expect(record?.approvedVersionId).toBeTruthy();
      expect(record?.reconciliation?.sceneResults).toHaveLength(3);
      expect(state.renderProgress[0]).toMatchObject({ status: 'done', kind: 'longform' });
    } else {
      state.acceptLongformPlan(source.id, 'editorial', 'brand');
      expect(useStore.getState().longformPlans[source.id]?.status).toBe('accepted');
    }
  });

  it('seeds identical creator-facing state on repeated runs', () => {
    seedQaState('partial-success');
    const first = {
      project: useStore.getState().currentProject,
      source: useStore.getState().sources[0],
      clips: useStore.getState().clips,
      progress: useStore.getState().renderProgress,
      completedAt: useStore.getState().renderCompletedAt,
    };

    seedQaState('partial-success');
    const second = {
      project: useStore.getState().currentProject,
      source: useStore.getState().sources[0],
      clips: useStore.getState().clips,
      progress: useStore.getState().renderProgress,
      completedAt: useStore.getState().renderCompletedAt,
    };

    expect(second).toEqual(first);
  });

  it('renders a discoverable index with an honest fixture label for every state', () => {
    installQaApi('showcase');
    seedQaState('showcase');
    render(<QaRendererShowcase stateId="showcase" />);

    expect(screen.getByRole('heading', { name: 'Deterministic UX state showcase' })).toBeVisible();
    expect(screen.getAllByRole('button', { name: 'Open deterministic state' })).toHaveLength(
      QA_STATE_IDS.length - 1,
    );
    expect(screen.getByText(/fixed local creator project/i)).toBeVisible();
  });

  it('redacts credentials and personal home folders from visible and copied diagnostics', () => {
    installQaApi('errors');
    seedQaState('errors');
    render(<QaRendererShowcase stateId="errors" />);

    for (const button of screen.getAllByRole('button', { name: 'Details' })) {
      fireEvent.click(button);
    }

    const content = document.body.textContent ?? '';
    expect(content).toContain('[REDACTED]');
    expect(content).not.toContain('AIzaQA_FIXTURE_SECRET');
    expect(content).not.toContain('/Users/fixture');
    expect(content).not.toContain('C:\\Users\\fixture');
    expect(content).toContain('~/Videos');
  });
});
