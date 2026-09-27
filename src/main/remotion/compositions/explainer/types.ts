/**
 * Explainer scenes — transcript-driven animated diagrams rendered into the top
 * "stage" half of a split 9:16 short (speaker on the bottom half).
 *
 * Shared by the main-process planner (`src/main/ai/explainer-scenes.ts`) and the
 * Remotion compositions, so it must stay JSX-free and JSON-serialisable.
 *
 * Every `*At` field is seconds relative to the start of the scene. The planner
 * derives them from word timestamps so each beat lands on the spoken word.
 */

/** Stage canvas: the top half of the locked 1080×1920 output. */
export const EXPLAINER_STAGE_WIDTH = 1080;
export const EXPLAINER_STAGE_HEIGHT = 960;
export const EXPLAINER_FPS = 30;

export const EXPLAINER_SCENE_KINDS = ['checklist', 'versus', 'stamp', 'flow', 'stack'] as const;
export type ExplainerSceneKind = (typeof EXPLAINER_SCENE_KINDS)[number];

/**
 * Lucide icon names the planner may use. Kept small so the model cannot pick a
 * name that does not exist; the validator maps anything else to `Circle`.
 */
export const EXPLAINER_ICONS = [
  'Bot',
  'Brain',
  'Cpu',
  'Sparkles',
  'Users',
  'User',
  'Handshake',
  'Briefcase',
  'DollarSign',
  'TrendingUp',
  'TrendingDown',
  'ChartBar',
  'Clock',
  'Calendar',
  'Mail',
  'MessageSquare',
  'Phone',
  'FileText',
  'ClipboardList',
  'Search',
  'TriangleAlert',
  'ShieldCheck',
  'Lock',
  'Zap',
  'Target',
  'Rocket',
  'Repeat',
  'Settings',
  'Wrench',
  'Database',
  'Globe',
  'Heart',
  'Lightbulb',
  'Layers',
  'Workflow',
  'Scale',
  'Ban',
  'Check',
  'X',
  'Circle',
] as const;
export type ExplainerIcon = (typeof EXPLAINER_ICONS)[number];

export interface ChecklistItem {
  label: string;
  icon: ExplainerIcon;
  /** When the item ticks + strikes through. */
  doneAt: number;
}

export interface ChecklistScene {
  kind: 'checklist';
  items: ChecklistItem[];
}

export interface VersusSide {
  label: string;
  icon: ExplainerIcon;
  /** When this side lights up. */
  at: number;
}

export interface VersusScene {
  kind: 'versus';
  left: VersusSide;
  right: VersusSide;
}

export interface StampScene {
  kind: 'stamp';
  icon: ExplainerIcon;
  /** Short stamped word(s), e.g. "NEVER" or "YES, BUT". */
  word: string;
  /** When the stamp slams in. */
  stampAt: number;
  /** When the icon gets crossed out; omitted = never. */
  strikeAt?: number;
}

export interface FlowScene {
  kind: 'flow';
  inputLabel: string;
  inputText: string;
  engineLabel: string;
  outputLabel: string;
  outputText: string;
  /** When the input card fills in. */
  inputAt: number;
  /** When the output card fills in. */
  outputAt: number;
}

export interface StackLayer {
  label: string;
  /** When the layer drops into the stack. */
  at: number;
}

export interface StackScene {
  kind: 'stack';
  /** Bottom → top. */
  layers: StackLayer[];
  /** When the whole stack dims (e.g. "broken"); omitted = never. */
  dimAt?: number;
}

export type ExplainerScene = ChecklistScene | VersusScene | StampScene | FlowScene | StackScene;

export interface ExplainerSceneProps {
  scene: ExplainerScene;
  accentColor: string;
}
