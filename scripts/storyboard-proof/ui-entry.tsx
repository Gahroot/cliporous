import React from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster } from 'sonner';
import { longformSceneId, longformSourceFingerprint, type SceneFirstLongformPlan } from '../../src/shared/longform-scenes';
import { BUILTIN_PALETTES } from '../../src/shared/palettes';
import { storyboardDefinitionFixture } from '../../src/shared/storyboard-fixtures';
import { LongformAppearancePicker } from '../../src/renderer/src/components/LongformAppearancePicker';
import { NewProjectDialog } from '../../src/renderer/src/components/NewProjectDialog';
import { CutPlanReviewScreen } from '../../src/renderer/src/components/screens/CutPlanReviewScreen';
import { DropScreen } from '../../src/renderer/src/components/screens/DropScreen';
import { TooltipProvider } from '../../src/renderer/src/components/ui/tooltip';
import { useStore } from '../../src/renderer/src/store';
import '../../src/renderer/src/assets/index.css';

// Local authored fixture. These desktop-bridge stand-ins NEVER make AI/media/network calls.
const calls: string[] = [];
let previewMode: 'pending' | 'failure' = 'pending';
let rejectPreview: ((error: Error) => void) | undefined;
const handlers: Record<string, (...args: unknown[]) => unknown> = {
  renderLongformScenePreview: async () => {
    if (previewMode === 'failure') throw new Error('Authored preview failure. Retry is available.');
    return await new Promise<string>((_, reject) => { rejectPreview = reject; });
  },
  cancelLongformScenePreview: async () => { rejectPreview?.(new Error('Cancelled fixture preview')); },
  cleanupLongformScenePreview: async () => {},
  cancelLongformEditPlan: async () => {},
  getHistory: async () => [],
  getRecentProjects: async () => [],
  getCredentialStatus: async () => ({ gemini: false }),
  getGeminiApiKey: async () => null,
  openSettingsWindow: async () => {},
  openFileDialog: async () => null,
  openProjectDialog: async () => null,
  logRenderer: async () => {},
};
Object.defineProperty(window, 'api', { configurable: true, value: new Proxy(handlers, {
  get(target, key) {
    if (typeof key !== 'string') return undefined;
    if (key.startsWith('on')) return () => () => {};
    return (...args: unknown[]) => {
      calls.push(key);
      const handler = target[key];
      if (!handler) throw new Error(`Unimplemented fixture bridge: ${key}`);
      return handler(...args);
    };
  },
}) });

const query = new URLSearchParams(location.search);
const route = query.get('route') ?? 'appearance';
const fixture = storyboardDefinitionFixture();
const custom = { id: 'custom-long-name', name: 'A very long custom palette name for narrow layout verification', background: '#fafafa', foreground: '#171717', accent: '#087954', builtin: false };
useStore.setState((state) => {
  state.currentProject.id = 'storyboard-ui-fixture';
  state.currentProject.displayName = 'Authored storyboard UI fixture';
  state.settings.outputMode = 'longform';
  state.settings.longformStoryboardStyle = 'polish';
  state.settings.longformPaletteId = query.get('missing') ? 'custom-unavailable' : 'brand';
  state.settings.customPalettes = [custom];
  state.settings.geminiApiKey = '';
  state.pythonStatus = 'ready';
});

if (route === 'review') {
  const first = fixture.words[0];
  const last = fixture.words.at(-1);
  if (!first || !last) throw new Error('Fixture words are absent');
  const plan: SceneFirstLongformPlan = {
    mode: 'scene-first', schemaVersion: 2, parserVersion: 2, storyboardStyle: 'polish',
    sourceFingerprint: longformSourceFingerprint(fixture.words, fixture.duration), sourceDuration: fixture.duration,
    generatedAt: 1, reasoning: 'Authored local source definition used only for UI verification.', blocks: [], phrases: [],
    sections: [{ id: 'definition', startWord: 0, endWord: fixture.words.length - 1, startTime: 0, endTime: fixture.duration, status: 'planned', diagnostics: [] }],
    scenes: [{ id: longformSceneId('storyboard', fixture.spec.startWord, fixture.spec.endWord), kind: 'storyboard', sectionId: 'definition',
      startWord: fixture.spec.startWord, endWord: fixture.spec.endWord, startTime: first.start - 0.25, endTime: last.end + 0.35,
      label: 'A storyboard', purpose: 'Keep related source ideas together on one canvas.', presentation: 'full-frame', sourceSpec: JSON.parse(JSON.stringify(fixture.spec)),
    }],
  };
  useStore.setState((state) => {
    state.sources = [{ id: 'ui-source', path: 'C:/authored-fixtures/storyboard.mp4', name: 'authored-storyboard.mp4', origin: 'file', mediaStatus: 'online', width: 1920, height: 1080, duration: fixture.duration }];
    state.activeSourceId = 'ui-source';
    state.transcriptions['ui-source'] = { text: fixture.words.map((word) => word.text).join(' '), formattedForAI: '', segments: [], words: fixture.words };
    state.pipeline = { stage: 'ready', message: 'Cut Plan ready for review', percent: 100 };
  });
  useStore.getState().setLongformPlan('ui-source', { plan, skin: 'editorial', paletteId: 'brand', palette: BUILTIN_PALETTES[0] });
  useStore.getState().acceptLongformPlan('ui-source', 'editorial', 'brand');
}

Object.defineProperty(window, 'storyboardUI', { value: {
  calls,
  state: () => {
    const state = useStore.getState();
    const record = state.longformPlans['ui-source'];
    return { style: state.settings.longformStoryboardStyle, paletteId: state.settings.longformPaletteId,
      planStyle: record?.plan.mode === 'scene-first' ? record.plan.storyboardStyle : null,
      status: record?.status, versions: record?.versions?.length, approved: record?.approvedVersionId };
  },
  setMissing: () => useStore.getState().setLongformPaletteId('custom-unavailable'),
  setLongName: () => useStore.getState().setLongformPaletteId(custom.id),
  setPreviewMode: (mode: 'pending' | 'failure') => { previewMode = mode; },
  makeStale: () => useStore.setState((state) => { state.sources[0].duration += 1; }),
} });

function Appearance(): React.JSX.Element {
  const settings = useStore((state) => state.settings);
  return <main style={{ padding: 16, maxWidth: 900, margin: '0 auto', width: '100%' }}>
    <LongformAppearancePicker style={settings.longformStoryboardStyle} paletteId={settings.longformPaletteId}
      onStyleChange={useStore.getState().setLongformStoryboardStyle} onPaletteChange={useStore.getState().setLongformPaletteId} />
  </main>;
}
function Fixture(): React.JSX.Element {
  const [open, setOpen] = React.useState(true);
  if (route === 'dialog') return <NewProjectDialog open={open} busy={query.has('busy')} initialSource={{ kind: 'file', value: 'C:/authored-fixtures/storyboard.mp4' }}
    onOpenChange={setOpen} onChooseFile={async () => null} onCreate={() => { throw new Error('UI proof must not start processing.'); }} />;
  if (route === 'drop') return <DropScreen />;
  if (route === 'review') return <CutPlanReviewScreen />;
  return <Appearance />;
}
const root = document.getElementById('root');
if (!root) throw new Error('Missing UI proof root');
root.style.cssText = 'height:100dvh;display:flex;flex-direction:column;min-width:0';
createRoot(root).render(<TooltipProvider><Fixture /><Toaster /></TooltipProvider>);
