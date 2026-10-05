import { isSceneFirstPlanEnvelope } from '@shared/longform-scenes';
import { BUILTIN_PALETTES, getPaletteById } from '@shared/palettes';
import type { LongformEditPlan } from '@shared/types';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CutPlanReviewScreen } from '@/components/screens/CutPlanReviewScreen';
import { resolveGeminiKey } from '@/lib/gemini-key';
import { useStore } from '@/store';
import type { SourceVideo } from '@/store/types';
import { deferred, makeScenePlan, makeStoryboardPlan } from './longform-scene-fixture';
import { installApiStub, resetStore } from './test-utils';

vi.mock('@/lib/gemini-key', () => ({
  resolveGeminiKey: vi.fn(async () => 'test-key'),
  MISSING_GEMINI_KEY_MESSAGE: 'Missing key',
}));

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    error: vi.fn(),
    success: vi.fn(),
    message: vi.fn(),
  }),
}));

const SOURCE: SourceVideo = {
  id: 'longform-source',
  path: '/videos/creator-story.mp4',
  name: 'creator-story.mp4',
  duration: 150,
  width: 1920,
  height: 1080,
  origin: 'file',
  mediaStatus: 'online',
};

const PLAN: LongformEditPlan = {
  phrases: [{ text: 'BUILD TRUST', startTime: 4, endTime: 5.2 }],
  blocks: [
    {
      kind: 'callout',
      startTime: 100,
      endTime: 105,
      kicker: 'THE PROOF',
      heading: 'Show the evidence',
      body: 'Results make the claim credible',
    },
  ],
  cards: [
    {
      kind: 'delos-scan-result',
      startTime: 12,
      endTime: 16,
      sourceText: 'Customer evidence from the transcript',
    },
  ],
  reasoning: 'Open with the claim, then support it with sourced evidence.',
  generatedAt: 100,
};

function seedCutPlan(): void {
  useStore.setState((state) => {
    state.sources = [SOURCE];
    state.activeSourceId = SOURCE.id;
    state.transcriptions[SOURCE.id] = {
      text: 'Build trust with evidence. Customer evidence from the transcript. Show the evidence.',
      formattedForAI: '[4|4.4|Build]',
      segments: [],
      words: [
        { text: 'Build', start: 4, end: 4.4 },
        { text: 'trust', start: 4.5, end: 5 },
        { text: 'with', start: 5.1, end: 5.4 },
        { text: 'evidence', start: 5.5, end: 6.2 },
        { text: 'Show', start: 100, end: 100.5 },
        { text: 'the', start: 100.6, end: 100.8 },
        { text: 'evidence', start: 100.9, end: 101.5 },
      ],
    };
    state.settings.outputDirectory = '/exports';
    state.settings.longformPaletteId = 'brand';
    state.pipeline = { stage: 'ready', message: 'Cut Plan ready for review', percent: 100 };
  });
  useStore.getState().setLongformPlan(SOURCE.id, {
    plan: PLAN,
    skin: 'editorial',
    paletteId: 'brand',
  });
}

describe('CutPlanReviewScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    resetStore();
    installApiStub({
      cancelLongformEditPlan: vi.fn(async () => {}),
      renderLongformScenePreview: vi.fn(async () => '/owned/scene-preview.mp4'),
      cancelLongformScenePreview: vi.fn(async () => {}),
      cleanupLongformScenePreview: vi.fn(async () => {}),
    });
    seedCutPlan();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  function openPlanDetails(): void {
    fireEvent.click(screen.getByText('Plan settings, history and feedback'));
  }

  function selectedScene(): HTMLElement {
    return screen.getByRole('region', { name: 'Selected scene' });
  }

  function seedScenes(): void {
    useStore
      .getState()
      .setLongformPlan(SOURCE.id, { plan: makeScenePlan(), skin: 'editorial', paletteId: 'brand' });
  }

  it.each([
    'scene-first',
    'legacy',
  ] as const)('returns focus to the initiating %s Edit button after Escape', async (mode) => {
    if (mode === 'scene-first') seedScenes();
    render(<CutPlanReviewScreen />);
    const triggers = screen.getAllByRole('button', { name: 'Edit' });
    for (const trigger of triggers.slice(0, 2)) {
      trigger.focus();
      fireEvent.click(trigger);
      const dialog = screen.getByRole('dialog');
      expect(dialog).toBeInTheDocument();
      fireEvent.keyDown(dialog, { key: 'Escape', code: 'Escape' });
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(trigger).toHaveFocus();
      });
    }
  });

  it('keeps legacy actions below content rather than consuming its grid column', () => {
    render(<CutPlanReviewScreen />);
    for (const edit of screen.getAllByRole('button', { name: 'Edit' })) {
      const card = edit.closest('li');
      if (!card) throw new Error('missing beat card');
      expect(card).toHaveClass('grid-cols-1', 'sm:grid-cols-[88px_minmax(0,1fr)]');
      expect(card).not.toHaveClass('sm:grid-cols-[88px_minmax(0,1fr)_auto]');
      const actions = edit.parentElement;
      expect(actions).toBe(card.children[2]);
      expect(actions).toHaveClass('flex-wrap', 'min-w-0', 'sm:col-start-2', 'sm:row-start-2');
      const quote = card.querySelector('blockquote');
      expect(quote?.parentElement).toBe(card.children[1]);
      expect(quote?.className).not.toMatch(/line-clamp|truncate/);
    }
  });

  it.each([
    'scene-first',
    'legacy',
  ] as const)('keeps %s content and all footer actions in one scroll flow at short heights', (mode) => {
    if (mode === 'scene-first') seedScenes();
    render(<CutPlanReviewScreen />);
    const footer = screen.getByRole('contentinfo');
    const shell = footer.parentElement;
    const content = screen.getByRole('main').parentElement?.parentElement;
    expect(shell).toHaveClass('h-full', 'flex-col', '[@media(max-height:500px)]:overflow-y-auto');
    expect(content?.parentElement).toBe(shell);
    expect(content).toHaveClass(
      'flex-1',
      'overflow-y-auto',
      '[@media(max-height:500px)]:flex-none',
      '[@media(max-height:500px)]:overflow-visible',
    );
    expect(footer).toHaveClass('shrink-0');
    expect(
      within(footer).getByRole('button', { name: 'Approve plan and prepare export' }),
    ).toBeVisible();
    expect(within(footer).getAllByRole('button')).toHaveLength(1);
    expect(
      screen.getByText('Plan settings, history and feedback').closest('details'),
    ).not.toHaveAttribute('open');
    expect(screen.getAllByRole('button', { name: 'Edit' }).length).toBeGreaterThan(0);
  });

  it.each([
    ['Build trust with evidence', false],
    ['Explain the source passage: “Build trust with evidence”', false],
    ['Connect trust to source evidence.', true],
    ['Explain the source passage: contrast trust with unsupported claims.', true],
  ] as const)('only shows distinct scene purpose: %s', (purpose, distinct) => {
    const plan = makeScenePlan();
    const first = plan.scenes[0];
    if (!first) throw new Error('missing scene');
    first.purpose = purpose;
    useStore.getState().setLongformPlan(SOURCE.id, { plan, skin: 'editorial', paletteId: 'brand' });
    render(<CutPlanReviewScreen />);
    const card = selectedScene();
    const intent = within(card).queryByText('Scene intent');
    if (distinct) {
      if (!intent) throw new Error('missing scene intent');
      const disclosure = intent.closest('details');
      expect(disclosure).not.toHaveAttribute('open');
      expect(within(card).getByText(purpose)).not.toBeVisible();
      fireEvent.click(intent);
      expect(disclosure).toHaveAttribute('open');
      expect(within(card).getByText(purpose)).toBeVisible();
    } else expect(intent).not.toBeInTheDocument();
    expect(card.querySelector('blockquote')).toHaveTextContent(
      'Transcript source: Build trust with evidence',
    );
    expect(useStore.getState().longformPlans[SOURCE.id]?.plan).toEqual(plan);
  });

  it('shows real scene metadata and only permits presentation edits, keeping source specs and selected IDs through restore', () => {
    seedScenes();
    useStore.getState().acceptLongformPlan(SOURCE.id, 'editorial', 'brand');
    render(<CutPlanReviewScreen />);
    expect(
      within(selectedScene()).getByRole('heading', { name: 'Trust explanation' }),
    ).toBeInTheDocument();
    fireEvent.click(within(selectedScene()).getByText('Scene intent'));
    expect(within(selectedScene()).getByText('Connect trust to source evidence.')).toBeVisible();
    expect(within(selectedScene()).getByText(/Speaker beside explanation/)).toBeInTheDocument();
    expect(screen.getByText(/Build trust with evidence/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next scene' }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).queryByLabelText('Start')).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText('Evidence text')).not.toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText('Presentation'), {
      target: { value: 'full-frame' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save version' }));
    const record = useStore.getState().longformPlans[SOURCE.id];
    if (!record || !isSceneFirstPlanEnvelope(record.plan)) throw new Error('missing scene plan');
    expect(record.plan.scenes[1]).toEqual({
      ...makeScenePlan().scenes[1],
      presentation: 'full-frame',
    });
    expect(record.approvedVersionId).toBeNull();
    expect(record.preservedItems?.[0]?.key).toBe('scene-statement-4-6');
    expect(useStore.getState().longformReviewFocus).toEqual({
      sourceId: SOURCE.id,
      sceneId: 'scene-statement-4-6',
    });
    expect(
      within(selectedScene()).getByRole('heading', { name: 'Evidence explanation' }),
    ).toBeInTheDocument();
    openPlanDetails();
    fireEvent.click(screen.getByRole('button', { name: 'Compare and restore' }));
    fireEvent.change(screen.getByLabelText('Later version'), {
      target: { value: record.versions?.[0]?.id },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Restore selected version' }));
    expect(useStore.getState().longformPlans[SOURCE.id]?.plan).toEqual(makeScenePlan());
    expect(useStore.getState().longformReviewFocus).toEqual({
      sourceId: SOURCE.id,
      sceneId: 'scene-statement-4-6',
    });
    expect(
      within(selectedScene()).getByRole('heading', { name: 'Evidence explanation' }),
    ).toBeInTheDocument();
  });

  it('uses a compact source-ordered queue and a single selected context with native narrow navigation', () => {
    const plan = makeScenePlan();
    plan.scenes.reverse();
    useStore.getState().setLongformPlan(SOURCE.id, { plan, skin: 'editorial', paletteId: 'brand' });
    const view = render(<CutPlanReviewScreen />);
    const queue = screen.getByRole('navigation', { name: 'Scene queue' });
    const rows = within(queue).getAllByRole('button');
    expect(rows[0]).toHaveTextContent('Trust explanation');
    expect(rows[1]).toHaveTextContent('Evidence explanation');
    expect(rows[0]).toHaveAttribute('aria-current', 'true');
    expect(queue.parentElement).toHaveClass(
      'grid-cols-1',
      'min-w-0',
      'md:grid-cols-[minmax(0,200px)_minmax(0,1fr)]',
      'lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)]',
    );
    expect(queue.querySelector('ol')).toHaveClass('hidden', 'md:block');
    const select = screen.getByRole('combobox', { name: 'Scene in source order' });
    expect(select).toHaveClass('w-full', 'min-w-0', 'max-w-full');
    expect(selectedScene()).toHaveClass('min-w-0', '[overflow-wrap:anywhere]');
    expect(screen.getByRole('button', { name: 'Previous scene' })).toBeDisabled();
    const next = screen.getByRole('button', { name: 'Next scene' });
    next.focus();
    fireEvent.click(next);
    expect(
      within(selectedScene()).getByRole('heading', { name: 'Evidence explanation' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next scene' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Previous scene' }));
    expect(select).toHaveValue('scene-statement-0-3');
    fireEvent.change(select, { target: { value: 'scene-statement-4-6' } });
    expect(screen.getAllByRole('region', { name: 'Source passage' })).toHaveLength(1);
    expect(view.container.querySelectorAll('video')).toHaveLength(1);
    expect(window.api.renderLongformScenePreview).not.toHaveBeenCalled();
    expect(window.api.generateLongformEditPlan).not.toHaveBeenCalled();
    expect(useStore.getState().longformPlans[SOURCE.id]?.plan).toEqual(plan);
  });

  it('consumes an incoming failed-scene focus without changing approval or output evidence', () => {
    seedScenes();
    useStore.getState().acceptLongformPlan(SOURCE.id, 'editorial', 'brand');
    const before = useStore.getState();
    render(<CutPlanReviewScreen />);
    act(() => {
      expect(useStore.getState().focusLongformScene(SOURCE.id, 'scene-statement-4-6')).toBe(true);
    });
    expect(
      within(selectedScene()).getByRole('heading', { name: 'Evidence explanation' }),
    ).toBeInTheDocument();
    const after = useStore.getState();
    expect(after.longformPlans[SOURCE.id]).toEqual(before.longformPlans[SOURCE.id]);
    expect(after.renderProgress).toEqual(before.renderProgress);
    expect(after.longformReviewFocus).toEqual({
      sourceId: SOURCE.id,
      sceneId: 'scene-statement-4-6',
    });
    expect(window.api.renderLongformScenePreview).not.toHaveBeenCalled();
  });

  it.each([
    true,
    false,
  ])('reviews regeneration as a draft and reconciles selection when the selected ID survives: %s', async (survives) => {
    seedScenes();
    useStore
      .getState()
      .setLongformReviewFocus({ sourceId: SOURCE.id, sceneId: 'scene-statement-4-6' });
    useStore.getState().acceptLongformPlan(SOURCE.id, 'editorial', 'brand');
    const generated = makeScenePlan();
    if (!survives && generated.scenes[1]) generated.scenes[1].id = 'replacement-scene';
    installApiStub({ generateLongformEditPlan: vi.fn(async () => generated) });
    render(<CutPlanReviewScreen />);
    openPlanDetails();
    expect(screen.getByRole('region', { name: 'Revision scope' })).toHaveTextContent(
      'Scope: whole plan',
    );
    expect(screen.getByRole('region', { name: 'Revision scope' })).toHaveTextContent(
      'not single-scene regeneration',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Regenerate plan' }));
    await screen.findByRole('heading', { name: 'New draft revision · review before approval' });
    const record = useStore.getState().longformPlans[SOURCE.id];
    expect(record?.status).toBe('draft');
    expect(record?.approvedVersionId).toBeNull();
    expect(useStore.getState().longformReviewFocus?.sceneId).toBe(
      survives ? 'scene-statement-4-6' : 'scene-statement-0-3',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Compare with prior version' }));
    const versions = record?.versions ?? [];
    expect(screen.getByLabelText('Earlier version')).toHaveValue(versions.at(-2)?.id);
    expect(screen.getByLabelText('Later version')).toHaveValue(record?.activeVersionId);
    fireEvent.click(screen.getByRole('button', { name: 'Restore earlier version' }));
    expect(useStore.getState().longformPlans[SOURCE.id]?.plan).toEqual(makeScenePlan());
    expect(useStore.getState().longformPlans[SOURCE.id]?.status).toBe('draft');
  });

  it('keeps scene feedback scoped to the selected source passage and runs no AI on save', () => {
    seedScenes();
    render(<CutPlanReviewScreen />);
    fireEvent.click(screen.getByRole('button', { name: 'Next scene' }));
    fireEvent.click(screen.getByRole('button', { name: 'Scene feedback' }));
    const field = screen.getByLabelText('Feedback for Statement at 1:40');
    expect(field).toHaveFocus();
    fireEvent.change(field, { target: { value: 'Clarify this evidence.' } });
    fireEvent.keyDown(field, { key: 'Enter', ctrlKey: true });
    expect(useStore.getState().longformPlans[SOURCE.id]?.feedback).toEqual([
      expect.objectContaining({
        targetKey: 'scene-statement-4-6',
        message: 'Clarify this evidence.',
        status: 'pending',
      }),
    ]);
    expect(window.api.generateLongformEditPlan).not.toHaveBeenCalled();
  });

  it('previews saved palette colors rather than unrelated or edited global settings', async () => {
    const saved = {
      ...getPaletteById('brand'),
      id: 'creator-palette',
      name: 'Creator',
      builtin: false,
      accent: '#123456',
    };
    useStore.getState().setLongformPlan(SOURCE.id, {
      plan: makeScenePlan(),
      skin: 'editorial',
      paletteId: saved.id,
      palette: saved,
    });
    useStore.setState((state) => {
      state.settings.customPalettes = [{ ...saved, accent: '#654321' }];
    });
    const pending = deferred<string>();
    const renderScene = vi.fn(() => pending.promise);
    const cancel = vi.fn(async () => {});
    installApiStub({ renderLongformScenePreview: renderScene, cancelLongformScenePreview: cancel });
    const view = render(<CutPlanReviewScreen />);
    fireEvent.click(screen.getByRole('button', { name: 'Render draft preview' }));
    expect(renderScene).toHaveBeenCalledWith(
      expect.objectContaining({ paletteId: saved.id, customPalettes: [saved] }),
    );
    view.unmount();
    await act(async () => pending.reject(new Error('Cancelled')));
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('omits/includes without deleting source specs, and preserves explicit scene IDs', () => {
    seedScenes();
    useStore.getState().acceptLongformPlan(SOURCE.id, 'editorial', 'brand');
    render(<CutPlanReviewScreen />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Omit scene' })[0] as HTMLElement);
    let record = useStore.getState().longformPlans[SOURCE.id];
    if (!record || !isSceneFirstPlanEnvelope(record.plan)) throw new Error('missing plan');
    expect(record.plan.scenes).toHaveLength(2);
    expect(record.plan.scenes[0]).toEqual({ ...makeScenePlan().scenes[0], omitted: true });
    expect(record.preservedItems?.map((item) => item.key)).toEqual(['scene-statement-0-3']);
    expect(record.status).toBe('draft');
    expect(record.approvedVersionId).toBeNull();
    expect(useStore.getState().longformReviewFocus?.sceneId).toBe('scene-statement-0-3');
    expect(
      within(selectedScene()).getByText(
        'This explanation is omitted. The source narration remains.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Render draft preview' })).toBeDisabled();
    expect(screen.getByLabelText('Source playback: Trust explanation')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Include scene' }));
    record = useStore.getState().longformPlans[SOURCE.id];
    expect(record?.plan).toMatchObject({ scenes: [{ omitted: false }, {}] });
  });

  it('summarizes board panels and beats, locks full-screen/timing, and retains ordinary layout choices', async () => {
    useStore.getState().setLongformPlan(SOURCE.id, {
      plan: makeStoryboardPlan(),
      skin: 'editorial',
      paletteId: 'brand',
    });
    render(<CutPlanReviewScreen />);
    const summary = screen.getByRole('region', { name: 'Storyboard panels and beats' });
    expect(summary).toHaveTextContent('Continuous storyboard · 1 panel');
    expect(summary).toHaveTextContent('Build trust · Statement');
    expect(summary).toHaveTextContent('Reveal 0:04 · Camera move 0:05');
    expect(summary).toHaveTextContent('Final overview');
    fireEvent.click(within(selectedScene()).getByRole('button', { name: 'Edit' }));
    const editor = screen.getByRole('dialog');
    expect(within(editor).getByRole('combobox', { name: 'Presentation' })).toBeDisabled();
    expect(within(editor).getAllByRole('option')).toHaveLength(1);
    expect(editor).toHaveTextContent('Source timing (read-only)');
    expect(editor).toHaveTextContent('Use scene feedback');
    expect(within(editor).queryByRole('spinbutton')).not.toBeInTheDocument();
    fireEvent.click(within(editor).getByRole('button', { name: 'Done' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next scene' }));
    fireEvent.click(within(selectedScene()).getByRole('button', { name: 'Edit' }));
    expect(screen.getByRole('combobox', { name: 'Presentation' })).toBeEnabled();
    expect(within(screen.getByRole('dialog')).getAllByRole('option')).toHaveLength(3);
    expect(window.api.generateLongformEditPlan).not.toHaveBeenCalled();
  });

  it.each([
    2, 3,
  ] as const)('parser-%s changes board style and palette into new unapproved drafts without AI and restores original appearance', (parserVersion) => {
    const plan = { ...makeStoryboardPlan(), parserVersion };
    useStore.getState().setLongformPlan(SOURCE.id, {
      plan,
      skin: 'editorial',
      paletteId: 'brand',
    });
    useStore.getState().acceptLongformPlan(SOURCE.id, 'editorial', 'brand');
    const initial = useStore.getState().longformPlans[SOURCE.id];
    const originalVersion = initial?.activeVersionId;
    const approvedHistory = structuredClone(initial?.versions);
    render(<CutPlanReviewScreen />);
    openPlanDetails();
    fireEvent.click(screen.getByText('Change style and palette'));
    fireEvent.click(screen.getByRole('button', { name: 'Ink' }));
    let revised = useStore.getState().longformPlans[SOURCE.id];
    expect(revised?.plan).toEqual({ ...plan, storyboardStyle: 'ink' });
    expect(revised?.versions?.slice(0, -1)).toEqual(approvedHistory);
    expect(revised?.status).toBe('draft');
    expect(revised?.approvedVersionId).toBeNull();
    expect(revised?.versions).toHaveLength((initial?.versions?.length ?? 0) + 1);
    const alternative = BUILTIN_PALETTES.find((palette) => palette.id !== 'brand');
    if (!alternative) throw new Error('Missing alternate built-in palette');
    fireEvent.click(screen.getByRole('button', { name: `Use ${alternative.name} palette` }));
    revised = useStore.getState().longformPlans[SOURCE.id];
    expect(revised?.paletteId).toBe(alternative.id);
    expect(revised?.versions).toHaveLength((initial?.versions?.length ?? 0) + 2);
    expect(revised?.versions?.slice(0, approvedHistory?.length)).toEqual(approvedHistory);
    expect(window.api.generateLongformEditPlan).not.toHaveBeenCalled();
    if (!originalVersion) throw new Error('Missing original version');
    act(() => useStore.getState().restoreLongformPlanVersion(SOURCE.id, originalVersion));
    expect(useStore.getState().longformPlans[SOURCE.id]).toMatchObject({
      paletteId: 'brand',
      plan: { storyboardStyle: 'polish' },
      status: 'draft',
      approvedVersionId: null,
    });
  });

  it.each([
    2, 3,
  ] as const)('parser-%s regeneration keeps request-start style and full palette despite settings/library changes before and during AI', async (parserVersion) => {
    const palette = {
      ...getPaletteById('brand'),
      id: 'custom-snapshot',
      name: 'Snapshot',
      builtin: false,
    };
    useStore.setState((state) => {
      state.settings.customPalettes = [palette];
      state.settings.longformStoryboardStyle = 'ink';
    });
    useStore.getState().setLongformPlan(SOURCE.id, {
      plan: makeStoryboardPlan(),
      skin: 'editorial',
      paletteId: palette.id,
      palette,
    });
    const key = deferred<string>();
    const generated = deferred<LongformEditPlan>();
    vi.mocked(resolveGeminiKey).mockImplementationOnce(() => key.promise);
    window.api.generateLongformEditPlan = vi.fn(() => generated.promise);
    render(<CutPlanReviewScreen />);
    openPlanDetails();
    fireEvent.click(screen.getByRole('button', { name: 'Regenerate plan' }));
    act(() =>
      useStore.setState((state) => {
        state.settings.longformStoryboardStyle = 'ink';
        state.settings.longformPaletteId = 'founder-gold';
        state.settings.customPalettes = [{ ...palette, accent: '#123456' }];
      }),
    );
    await act(async () => key.resolve('test-key'));
    await waitFor(() => expect(window.api.generateLongformEditPlan).toHaveBeenCalledOnce());
    expect(vi.mocked(window.api.generateLongformEditPlan).mock.calls[0]?.[4]).toMatchObject({
      mode: 'scene-first',
      storyboardStyle: 'polish',
    });
    act(() =>
      useStore.setState((state) => {
        state.settings.customPalettes = [];
      }),
    );
    const response = { ...makeStoryboardPlan(), parserVersion };
    await act(async () => generated.resolve(response));
    const record = useStore.getState().longformPlans[SOURCE.id];
    expect(record?.versions).toHaveLength(2);
    expect(record?.palette).toEqual(palette);
    expect(record?.versions?.at(-1)?.palette).toEqual(palette);
    expect(record?.plan).toEqual(response);
    expect(record?.versions?.at(-1)?.plan).toEqual(response);
    expect(record?.status).toBe('draft');
    expect(window.api.cancelLongformEditPlan).not.toHaveBeenCalled();
  });

  it.each([
    2, 3,
  ] as const)('rejects parser-%s regeneration with mismatched style without replacing history or rendering', async (parserVersion) => {
    const plan = { ...makeStoryboardPlan(), parserVersion };
    useStore.getState().setLongformPlan(SOURCE.id, { plan, skin: 'editorial', paletteId: 'brand' });
    const before = structuredClone(useStore.getState().longformPlans[SOURCE.id]);
    window.api.generateLongformEditPlan = vi.fn(async () => ({
      ...plan,
      storyboardStyle: 'ink' as const,
    }));
    render(<CutPlanReviewScreen />);
    openPlanDetails();
    fireEvent.click(screen.getByRole('button', { name: 'Regenerate plan' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(useStore.getState().longformPlans[SOURCE.id]).toEqual(before);
    expect(useStore.getState().renderProgress).toEqual([]);
    expect(window.api.renderLongformScenePreview).not.toHaveBeenCalled();
    expect(window.api.startBatchRender).not.toHaveBeenCalled();
  });

  it('retains unknown future saved versions and payload while blocking approval, preview and style editing', () => {
    const plan = {
      ...makeStoryboardPlan(),
      parserVersion: 99,
      futurePayload: { panels: ['keep'] },
    };
    useStore.getState().setLongformPlan(SOURCE.id, {
      plan: plan as unknown as LongformEditPlan,
      skin: 'editorial',
      paletteId: 'brand',
      preservedPlanData: plan,
    });
    const before = structuredClone(useStore.getState().longformPlans[SOURCE.id]);
    render(<CutPlanReviewScreen />);
    expect(screen.getByRole('button', { name: 'Approve plan and prepare export' })).toBeDisabled();
    const preview = screen.queryByRole('button', { name: 'Render draft preview' });
    if (preview) expect(preview).toBeDisabled();
    openPlanDetails();
    expect(screen.queryByRole('button', { name: 'Ink' })).not.toBeInTheDocument();
    expect(useStore.getState().longformPlans[SOURCE.id]).toEqual(before);
    expect(before?.plan).toEqual(plan);
    expect(before?.versions?.[0]?.plan).toEqual(plan);
    expect(before?.preservedPlanData).toEqual(plan);
    expect(window.api.renderLongformScenePreview).not.toHaveBeenCalled();
    expect(window.api.startBatchRender).not.toHaveBeenCalled();
  });

  it('retries only failed sections with request-scoped progress, previous plan and preserved scene IDs', async () => {
    const plan = makeScenePlan();
    plan.scenes.splice(1);
    const section = plan.sections[1];
    if (!section) throw new Error('missing section');
    section.status = 'failed';
    section.diagnostics = ['Planner timed out'];
    useStore.getState().setLongformPlan(SOURCE.id, { plan, skin: 'editorial', paletteId: 'brand' });
    const pending = deferred<LongformEditPlan>();
    const generate = vi.fn(() => pending.promise);
    let progress: Parameters<typeof window.api.onLongformEditProgress>[0] = () => {};
    const off = vi.fn();
    installApiStub({
      generateLongformEditPlan: generate,
      onLongformEditProgress: vi.fn((listener) => {
        progress = listener;
        return off;
      }),
      cancelLongformEditPlan: vi.fn(async () => {}),
    });
    render(<CutPlanReviewScreen />);
    expect(screen.getByRole('button', { name: 'Approve plan and prepare export' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Preserve' }));
    fireEvent.click(screen.getByRole('button', { name: 'Retry failed sections' }));
    await waitFor(() => {
      expect(vi.mocked(toast.error).mock.calls).toEqual([]);
      expect(resolveGeminiKey).toHaveBeenCalled();
      expect(generate).toHaveBeenCalledTimes(1);
    });
    const args = vi.mocked(window.api.generateLongformEditPlan).mock.calls[0];
    expect(args?.[4]).toMatchObject({
      requestId: expect.any(String),
      mode: 'scene-first',
      previousPlan: plan,
      preservedSceneIds: ['scene-statement-0-3'],
      sectionIds: ['section-evidence'],
    });
    act(() => progress({ stage: 'ai-editing', requestId: 'other-request', window: 99, total: 99 }));
    expect(screen.queryByText(/window 99/)).not.toBeInTheDocument();
    act(() =>
      progress({ stage: 'ai-editing', requestId: args?.[4]?.requestId ?? '', window: 2, total: 3 }),
    );
    expect(screen.getByText(/window 2 of 3/)).toBeInTheDocument();
    await act(async () => pending.resolve(makeScenePlan()));
    expect(useStore.getState().longformPlans[SOURCE.id]?.versions).toHaveLength(2);
    expect(off).toHaveBeenCalledOnce();
  });

  it.each([
    'source',
    'project',
    'navigation',
    'version',
    'cancel',
    'unmount',
  ] as const)('discards late generation after %s changes/cancellation', async (reason) => {
    seedScenes();
    const pending = deferred<LongformEditPlan>();
    const generate = vi.fn(() => pending.promise);
    const cancel = vi.fn(async () => {});
    installApiStub({ generateLongformEditPlan: generate, cancelLongformEditPlan: cancel });
    const view = render(<CutPlanReviewScreen />);
    openPlanDetails();
    fireEvent.click(screen.getByRole('button', { name: 'Regenerate plan' }));
    await waitFor(() => expect(generate).toHaveBeenCalledOnce());
    act(() => {
      if (reason === 'source') useStore.getState().setActiveSource(null);
      else if (reason === 'project')
        useStore.setState((state) => {
          state.currentProject.id = 'different-project';
        });
      else if (reason === 'navigation')
        useStore.setState((state) => {
          state.pipeline.stage = 'idle';
        });
      else if (reason === 'version')
        useStore.getState().setLongformPlanStyle(SOURCE.id, 'editorial', 'slate');
      else if (reason === 'unmount') view.unmount();
      else fireEvent.click(screen.getByRole('button', { name: 'Cancel generation' }));
    });
    expect(cancel).toHaveBeenCalledWith(expect.any(String));
    const kept = useStore.getState().longformPlans[SOURCE.id];
    await act(async () => pending.resolve(makeScenePlan()));
    expect(useStore.getState().longformPlans[SOURCE.id]).toEqual(kept);
  });

  it.each([
    'empty',
    'all-omitted',
  ] as const)('explicitly approves a successful %s plan as speaker-only', async (kind) => {
    const plan = makeScenePlan();
    if (kind === 'empty') {
      plan.scenes = [];
      plan.sections.forEach((section) => {
        section.status = 'empty';
      });
    } else
      plan.scenes.forEach((scene) => {
        scene.omitted = true;
      });
    useStore.getState().setLongformPlan(SOURCE.id, { plan, skin: 'editorial', paletteId: 'brand' });
    render(<CutPlanReviewScreen />);
    expect(
      screen.getByText(/This plan will export speaker footage without explanation scenes/),
    ).toBeInTheDocument();
    const approve = screen.getByRole('button', { name: 'Approve plan and prepare export' });
    expect(approve).toBeEnabled();
    fireEvent.click(approve);
    await waitFor(() =>
      expect(useStore.getState().renderProgress).toEqual([
        expect.objectContaining({ clipId: SOURCE.id, kind: 'longform', status: 'queued' }),
      ]),
    );
    expect(useStore.getState().longformPlans[SOURCE.id]?.status).toBe('accepted');
    expect(useStore.getState().longformPlans[SOURCE.id]?.plan).toEqual(plan);
  });

  it.each([
    'all-failed',
    'conflict',
  ] as const)('blocks a %s plan rather than silently exporting speaker-only', (kind) => {
    const plan = makeScenePlan();
    if (kind === 'all-failed') {
      plan.scenes = [];
      plan.sections.forEach((section) => {
        section.status = 'failed';
      });
    } else {
      const second = plan.scenes[1];
      if (!second) throw new Error('missing scene');
      second.startTime = 4;
    }
    useStore.getState().setLongformPlan(SOURCE.id, { plan, skin: 'editorial', paletteId: 'brand' });
    render(<CutPlanReviewScreen />);
    expect(
      screen.getByRole('button', {
        name: 'Approve plan and prepare export',
      }),
    ).toBeDisabled();
    if (kind === 'all-failed') {
      expect(screen.getByText(/Planning incomplete:/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Retry failed sections' })).toBeEnabled();
    }
  });

  it('blocks invalid approval and offers recovery while retaining unsupported saved data', () => {
    useStore.getState().setLongformPlan(SOURCE.id, {
      plan: makeScenePlan(),
      skin: 'editorial',
      paletteId: 'brand',
      validationProblem: 'Saved plan is stale',
      preservedPlanData: { future: true },
    });
    render(<CutPlanReviewScreen />);
    expect(screen.getByRole('alert')).toHaveTextContent('Saved plan is stale');
    expect(screen.getByRole('button', { name: 'Generate new scene draft' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Approve plan and prepare export' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Render draft preview' })).toBeDisabled();
  });

  it('can explicitly upgrade a legacy plan into a new scene-first draft without losing history', async () => {
    const generate = vi.fn(async () => makeScenePlan());
    installApiStub({ generateLongformEditPlan: generate });
    render(<CutPlanReviewScreen />);
    openPlanDetails();
    fireEvent.click(screen.getByRole('button', { name: 'New scene-first draft' }));
    await waitFor(() =>
      expect(useStore.getState().longformPlans[SOURCE.id]?.versions).toHaveLength(2),
    );
    expect(vi.mocked(window.api.generateLongformEditPlan).mock.calls[0]?.[4]).toMatchObject({
      mode: 'scene-first',
      requestId: expect.any(String),
    });
    expect(useStore.getState().longformPlans[SOURCE.id]?.versions?.[0]?.plan).toEqual(PLAN);
  });

  it('shows sections, sourced evidence beats, timing, style, versions, and preflight', () => {
    render(<CutPlanReviewScreen />);

    expect(screen.getByRole('heading', { name: 'creator-story.mp4' })).toBeInTheDocument();
    expect(screen.getByText('BUILD TRUST')).toBeInTheDocument();
    expect(screen.getAllByText('Show the evidence')).toHaveLength(3);
    expect(screen.getByText(/Build trust with evidence/)).toBeInTheDocument();
    openPlanDetails();
    expect(screen.getByText('Style and palette')).toBeInTheDocument();
    expect(screen.getByText('Version history')).toBeInTheDocument();
    expect(screen.getByText('Render preflight')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Approve plan and prepare export' })).toBeEnabled();
  });

  it('saves whole-plan feedback without losing the active version', () => {
    render(<CutPlanReviewScreen />);

    openPlanDetails();
    fireEvent.click(screen.getByRole('button', { name: 'Add plan feedback' }));
    const field = screen.getByLabelText('Feedback for the whole plan');
    fireEvent.change(field, {
      target: { value: 'Keep the opening, but replace the evidence card.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send feedback' }));

    const record = useStore.getState().longformPlans[SOURCE.id];
    expect(record?.feedback).toEqual([
      expect.objectContaining({
        targetLabel: 'Whole plan',
        message: 'Keep the opening, but replace the evidence card.',
        status: 'pending',
      }),
    ]);
    expect(record?.plan.phrases[0]?.text).toBe('BUILD TRUST');
  });

  it('accepts the active version before preparing the long-form export', async () => {
    const api = installApiStub();
    render(<CutPlanReviewScreen />);

    fireEvent.click(screen.getByRole('button', { name: 'Approve plan and prepare export' }));

    await waitFor(() =>
      expect(useStore.getState().renderProgress).toEqual([
        expect.objectContaining({
          clipId: SOURCE.id,
          kind: 'longform',
          status: 'queued',
        }),
      ]),
    );
    expect(useStore.getState().longformPlans[SOURCE.id]?.status).toBe('accepted');
    expect(useStore.getState().pipeline).toMatchObject({
      stage: 'rendering',
      message: 'Review export preflight',
    });
    expect(api.startBatchRender).not.toHaveBeenCalled();
  });
});
