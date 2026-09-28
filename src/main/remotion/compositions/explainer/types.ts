/**
 * Explainer scenes — transcript-driven animated diagrams.
 *
 * Shared by the main-process planner (`src/main/ai/explainer/*`), the render
 * glue (`src/main/render/explainer-scenes.ts`) and the Remotion compositions,
 * so it must stay JSX-free and JSON-serialisable.
 *
 * TIME CONVENTION (load-bearing): every numeric field named `at` or ending in
 * `At` (doneAt, stampAt, inputAt, …) is a beat time in seconds. The planner
 * writes them in absolute clip time; `mapSceneTimes` rebases them to the
 * scene/sequence start before rendering. New scene kinds MUST follow this
 * convention so the generic rebasing/clamping keeps working — never store a
 * time under any other key, and never name a non-time number `…At`.
 */

// ---------------------------------------------------------------------------
// Canvas
// ---------------------------------------------------------------------------

export const EXPLAINER_FPS = 30;

/** Stage canvas for the stacked layouts: one half of the 1080×1920 output. */
export const EXPLAINER_STAGE_WIDTH = 1080;
export const EXPLAINER_STAGE_HEIGHT = 960;

/**
 * Where the stage sits relative to the speaker.
 *  - `stack`         stage top half, speaker bottom half (reference look).
 *  - `stack-flipped` speaker top half, stage bottom half.
 *  - `takeover`      stage fills the frame; speaker audio only (1–3 s moments).
 *  - `pip`           stage fills the frame; speaker in a rounded window.
 *  - `over`          speaker fills the frame; stage is a transparent overlay
 *                    (floating glass card) composited on top.
 */
export const EXPLAINER_LAYOUTS = ['stack', 'stack-flipped', 'takeover', 'pip', 'over'] as const;
export type ExplainerLayout = (typeof EXPLAINER_LAYOUTS)[number];

export type ExplainerAspect = '9:16' | '16:9';

export interface StageCanvas {
  width: number;
  height: number;
  /** True when the render must carry alpha (ProRes 4444) — `over` only. */
  transparent: boolean;
}

/** Render canvas for a layout. Pure. */
export function stageCanvasFor(layout: ExplainerLayout, aspect: ExplainerAspect): StageCanvas {
  if (aspect === '16:9') {
    return { width: 1920, height: 1080, transparent: layout === 'over' };
  }
  switch (layout) {
    case 'stack':
    case 'stack-flipped':
      return { width: EXPLAINER_STAGE_WIDTH, height: EXPLAINER_STAGE_HEIGHT, transparent: false };
    case 'takeover':
    case 'pip':
      return { width: 1080, height: 1920, transparent: false };
    case 'over':
      return { width: 1080, height: 1920, transparent: true };
  }
}

/**
 * Safe box (canvas px) the scene content must stay inside for a layout, so it
 * never collides with the speaker window, captions or platform UI. Pure.
 */
export interface StageSafeBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function stageSafeBox(layout: ExplainerLayout, aspect: ExplainerAspect): StageSafeBox {
  const c = stageCanvasFor(layout, aspect);
  if (aspect === '16:9') {
    switch (layout) {
      case 'over':
        // Long-form speakers are framed centre; the card floats in the right
        // third, clear of a centred face.
        return { x: 1250, y: 170, width: 610, height: 600 };
      case 'pip':
        // Speaker window bottom-left.
        return { x: 520, y: 100, width: 1300, height: 760 };
      default:
        return { x: 160, y: 100, width: 1600, height: 760 };
    }
  }
  switch (layout) {
    case 'stack':
    case 'stack-flipped':
      return { x: 60, y: 60, width: c.width - 120, height: c.height - 120 };
    case 'takeover':
      // Leave the lower third for captions.
      return { x: 70, y: 260, width: 940, height: 1040 };
    case 'pip':
      // Speaker window sits bottom-right; captions above it.
      return { x: 70, y: 220, width: 940, height: 900 };
    case 'over':
      // Floating card in the upper third, above the speaker's face.
      return { x: 90, y: 180, width: 900, height: 620 };
  }
}

// ---------------------------------------------------------------------------
// Palette (derived from the user's selected Palette — see explainer-palette.ts)
// ---------------------------------------------------------------------------

export interface ExplainerPalette {
  /** Stage backdrop, outer and inner (radial gradient). */
  bgOuter: string;
  bgInner: string;
  /** Card surfaces. */
  card: string;
  cardRaised: string;
  cardBorder: string;
  /** Text on the stage / cards. */
  text: string;
  muted: string;
  /** Primary + secondary accent. */
  accent: string;
  accent2: string;
  /** Soft accent tint for pills/highlights (rgba). */
  accentSoft: string;
  /** Positive / done state. */
  positive: string;
  /** Negative / myth state. */
  negative: string;
  /** Light "paper" card (flow cards) + its text. */
  paper: string;
  paperText: string;
  /** Three clay tones for 3D props (main, secondary, tertiary). */
  clay: readonly [string, string, string];
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

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

/** Soft 3D props for the `hero` scene (catalog + triggers: hero-catalog.ts). */
export const HERO_PROPS = [
  // v2
  'lightbulb',
  'rocket',
  'coins',
  'phone',
  'laptop',
  'lock',
  // v3 — money & business
  'target',
  'piggybank',
  'trophy',
  'briefcase',
  'megaphone',
  'magnet',
  'gift',
  // v3 — time
  'hourglass',
  'stopwatch',
  'calendar',
  // v3 — mind & health
  'brain',
  'heart',
  'battery',
  'flame',
  // v3 — growth & strategy
  'sprout',
  'mountain',
  'dice',
  'puzzle',
  'gears',
  'key',
  'door',
  // v3 — tech & world
  'chip',
  'globe',
  'envelope',
  'book',
] as const;
export type HeroProp = (typeof HERO_PROPS)[number];

/**
 * Optional reversed action for props that have one: battery drains instead of
 * charging, lock springs open instead of clicking shut. Ignored by other props.
 */
export type HeroTone = 'up' | 'down';

// ---------------------------------------------------------------------------
// Scene kinds
// ---------------------------------------------------------------------------

export const EXPLAINER_SCENE_KINDS = [
  // v1
  'checklist',
  'versus',
  'stamp',
  'flow',
  'stack',
  // v2 — 2D
  'statement',
  'number',
  'timeline',
  'notes',
  'question',
  'before-after',
  'chart',
  'chat',
  'network',
  'loop',
  // v2 — 3D
  'myth-fact',
  'funnel',
  'hero',
  // v3 — 2D frameworks & ideas
  'equation',
  'quadrant',
  'venn',
  'definition',
  'study',
  // v3 — 2D money, time & data
  'pictogram',
  'ranking',
  'receipt',
  'streak',
  'spectrum',
  // v3 — 2D stories & people
  'quote',
  'headline',
  'journey',
  'search',
  'code',
  // v3 — 3D
  'iceberg',
  'balance',
  'podium',
  'compound',
  'dominoes',
  'stairs',
] as const;
export type ExplainerSceneKind = (typeof EXPLAINER_SCENE_KINDS)[number];

export interface ChecklistItem {
  label: string;
  icon: ExplainerIcon;
  /** When the item ticks + strikes through. */
  doneAt: number;
}

export interface ChecklistScene {
  kind: 'checklist';
  /** Optional card header (e.g. "Human calls"). */
  title?: string;
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

/** A huge 1–3 word statement ("NEVER", "Stop guessing") — full-screen type. */
export interface StatementScene {
  kind: 'statement';
  /** Words revealed one by one; the `accentIndex` word is set in the accent. */
  words: { text: string; at: number }[];
  accentIndex?: number;
}

/** A figure the speaker says ("3x", "$40k", "87%") counting up with a bounce. */
export interface NumberScene {
  kind: 'number';
  /** Numeric target, e.g. 40000. */
  value: number;
  /** Rendered around the number, e.g. "$" / "k" / "%" / "x". */
  prefix?: string;
  suffix?: string;
  /** Decimal places to show (0–2). */
  decimals?: number;
  /** Short caption under the number ("more leads"). */
  label: string;
  /** When the count starts / lands. */
  countAt: number;
  landAt: number;
}

/** "first… then… finally": dots on a line that light up in order. */
export interface TimelineScene {
  kind: 'timeline';
  steps: { label: string; at: number }[];
}

/** A card that fills in line by line as the speaker talks ("Human calls"). */
export interface NotesScene {
  kind: 'notes';
  title: string;
  /** Optional badge on the header ("Human"). */
  badge?: string;
  lines: { text: string; at: number }[];
}

/** A question with a bouncing "?", flipping to the answer when given. */
export interface QuestionScene {
  kind: 'question';
  question: string;
  askAt: number;
  /** Omitted when the speaker never answers inside the window. */
  answer?: string;
  answerAt?: number;
}

/** A slider wiping from the old way to the new way. */
export interface BeforeAfterScene {
  kind: 'before-after';
  before: { title: string; points: string[] };
  after: { title: string; points: string[] };
  beforeAt: number;
  /** When the wipe runs. */
  wipeAt: number;
}

/** Bars or a line rising/falling for growth or decline. */
export interface ChartScene {
  kind: 'chart';
  style: 'bars' | 'line';
  /** 'up' = growth, 'down' = decline; drives colour + sound. */
  trend: 'up' | 'down';
  /** 3–6 points; labels short ("Jan", "Y1"). Values are relative. */
  points: { label: string; value: number }[];
  /** Headline over the chart ("Revenue"). */
  title: string;
  /** Optional callout on the last point ("+212%"). */
  callout?: string;
  growAt: number;
}

/** Text bubbles / an email / a notification for a customer or message. */
export interface ChatScene {
  kind: 'chat';
  medium: 'sms' | 'email' | 'notification';
  /** Sender/app name shown in the header. */
  from: string;
  messages: { text: string; side: 'them' | 'me'; at: number }[];
}

/** People/tools/steps as circles with lines drawing between them. */
export interface NetworkScene {
  kind: 'network';
  /** Central node, optional ("You", "CRM"). */
  hub?: string;
  nodes: { label: string; icon: ExplainerIcon; at: number }[];
  /** When every node links to every other ("everything connects"). */
  connectAllAt?: number;
}

/** Arrows circling around a loop (habits, feedback loops). */
export interface LoopScene {
  kind: 'loop';
  /** 2–5 stages around the ring. */
  stages: { label: string; at: number }[];
  /** Optional centre label ("Habit"). */
  center?: string;
  /** When the ring starts spinning continuously. */
  spinAt: number;
}

/** A 3D card that flips from the myth to the fact. */
export interface MythFactScene {
  kind: 'myth-fact';
  myth: string;
  fact: string;
  mythAt: number;
  flipAt: number;
}

/** 3D funnel: many items drop in the top, fewer come out the bottom. */
export interface FunnelScene {
  kind: 'funnel';
  /** Top → bottom stage labels (2–4), e.g. "Leads", "Calls", "Deals". */
  stages: { label: string; at: number }[];
  /** Optional result label under the funnel ("12 clients"). */
  result?: string;
  resultAt?: number;
}

/** A soft 3D prop for when the speaker names a thing. */
export interface HeroScene {
  kind: 'hero';
  prop: HeroProp;
  label: string;
  at: number;
  /** 'down' plays the prop's reversed action (battery drains, lock opens). */
  tone?: HeroTone;
}

// ---------------------------------------------------------------------------
// v3 — 2D frameworks & ideas
// ---------------------------------------------------------------------------

export const EQUATION_OPS = ['+', '−', '×', '÷'] as const;
export type EquationOp = (typeof EQUATION_OPS)[number];

/** "Consistency × Time = Results": term tiles joined by operators, then a result. */
export interface EquationScene {
  kind: 'equation';
  /** 2–3 terms, left → right. */
  terms: { text: string; at: number }[];
  /** ops[i] joins terms[i] and terms[i+1] (length = terms.length − 1). */
  ops: EquationOp[];
  result: string;
  /** When "=" draws and the result lands. */
  resultAt: number;
}

export type QuadrantCell = 'tl' | 'tr' | 'bl' | 'br';

/** A 2×2 matrix (effort vs impact): axes, then items dropping into cells. */
export interface QuadrantScene {
  kind: 'quadrant';
  /** Axis names ("Effort", "Impact"); low → high reads left→right / bottom→top. */
  xLabel: string;
  yLabel: string;
  /** 1–4 items, each in its own cell. */
  items: { label: string; cell: QuadrantCell; at: number }[];
  /** The cell that lights up as the answer ("do these first"). */
  winner?: QuadrantCell;
  winnerAt?: number;
}

/** Two circles sliding together; the overlap is the "sweet spot". */
export interface VennScene {
  kind: 'venn';
  left: { label: string; at: number };
  right: { label: string; at: number };
  /** The overlap label, revealed when the circles meet. */
  center: { label: string; at: number };
}

/** Dictionary card: "ROI — the money you get back for every dollar in". */
export interface DefinitionScene {
  kind: 'definition';
  term: string;
  /** Optional small tag under the term ("noun", "slang", "finance"). */
  tag?: string;
  meaning: string;
  termAt: number;
  meaningAt: number;
}

/** Research citation: source + finding, optional headline stat. */
export interface StudyScene {
  kind: 'study';
  /** "Harvard, 2019". */
  source: string;
  finding: string;
  /** Optional big stat ("73%"). */
  stat?: string;
  sourceAt: number;
  findingAt: number;
}

// ---------------------------------------------------------------------------
// v3 — 2D money, time & data
// ---------------------------------------------------------------------------

/** "1 in 4 people": a grid of person icons, `filled` of them lit. */
export interface PictogramScene {
  kind: 'pictogram';
  /** Grid size 2–100. */
  total: number;
  /** Lit figures 0–total. */
  filled: number;
  /** Short caption ("will quit this year"). */
  label: string;
  /** Headline figure shown over the grid ("1 in 4", "25%"). */
  stat: string;
  /** When the lit figures start filling. */
  fillAt: number;
}

/** Top-N / tier list: rows slot into rank order as each is named. */
export interface RankingScene {
  kind: 'ranking';
  title?: string;
  /** 2–5 items; rank 1 = best. Revealed in speaking order. */
  items: { label: string; rank: number; at: number }[];
}

/** A receipt printing line items, then a bold total. */
export interface ReceiptScene {
  kind: 'receipt';
  /** Header ("Monthly costs"). */
  title: string;
  /** 1–5 lines; amounts are display strings ("$40", "3 hrs"). */
  lines: { label: string; amount: string; at: number }[];
  total: { label: string; amount: string };
  totalAt: number;
}

/** A calendar grid filling day by day ("30 days", streaks, habits). */
export interface StreakScene {
  kind: 'streak';
  /** Days in the grid, 5–35. */
  days: number;
  /** Caption ("Post every day"). */
  label: string;
  /** Fill runs from fillAt to doneAt; the counter lands on doneAt. */
  fillAt: number;
  doneAt: number;
  /** Optional missed day (1-based) that breaks the chain in the negative colour. */
  missDay?: number;
}

/** A slider between two extremes; the marker glides to where the speaker lands. */
export interface SpectrumScene {
  kind: 'spectrum';
  left: string;
  right: string;
  /** Marker position 0 (left) … 1 (right). */
  from: number;
  to: number;
  /** Optional pill on the marker ("You", "Most people"). */
  markerLabel?: string;
  /** When the marker appears / glides to `to`. */
  showAt: number;
  moveAt: number;
}

// ---------------------------------------------------------------------------
// v3 — 2D stories & people
// ---------------------------------------------------------------------------

/** A quote card with attribution ("As Naval says…"). */
export interface QuoteScene {
  kind: 'quote';
  text: string;
  author: string;
  /** Optional role/context ("Investor"). */
  role?: string;
  at: number;
  authorAt: number;
}

/** A news headline card slamming in. */
export interface HeadlineScene {
  kind: 'headline';
  /** Outlet or section ("Breaking", "WSJ"). */
  outlet: string;
  headline: string;
  at: number;
}

/** A story arc: a curve drawing through highs and lows. */
export interface JourneyScene {
  kind: 'journey';
  /** 3–5 points; level −2 (rock bottom) … 2 (peak). */
  points: { label: string; level: number; at: number }[];
}

/** A search bar typing a query, then optional results. */
export interface SearchScene {
  kind: 'search';
  query: string;
  typeAt: number;
  /** 0–3 short result lines. */
  results: string[];
  resultsAt?: number;
}

export type CodeLineTone = 'plain' | 'add' | 'remove';

/** A code editor / terminal window; lines type in, diff lines tinted. */
export interface CodeScene {
  kind: 'code';
  /** Window title ("terminal", "app.py"). */
  title: string;
  lines: { text: string; tone: CodeLineTone; at: number }[];
}

// ---------------------------------------------------------------------------
// v3 — 3D
// ---------------------------------------------------------------------------

/** Iceberg: the tip is what people see; the camera dives to what's below. */
export interface IcebergScene {
  kind: 'iceberg';
  top: { label: string; at: number };
  /** 1–3 hidden layers, revealed after the dive. */
  below: { label: string; at: number }[];
  /** When the camera dips below the waterline. */
  diveAt: number;
}

/** A balance scale: items land on each pan, then it tips. */
export interface BalanceScene {
  kind: 'balance';
  left: { label: string; at: number };
  right: { label: string; at: number };
  /** Which side ends heavier ("wins"); 'even' = balanced. */
  heavier: 'left' | 'right' | 'even';
  tipAt: number;
}

/** A podium: places rise as named (usually 3rd → 1st). */
export interface PodiumScene {
  kind: 'podium';
  /** 2–3 places, rank 1–3 each (unique). */
  places: { label: string; rank: number; at: number }[];
}

/** Compounding: clay coin towers growing column by column into a curve. */
export interface CompoundScene {
  kind: 'compound';
  /** Caption ("$500 a month"). */
  title: string;
  /** 3–6 columns, relative values, labels short ("Y1"). */
  points: { label: string; value: number }[];
  /** Optional callout on the last tower ("$1.2M"). */
  callout?: string;
  growAt: number;
}

/** A chain reaction: labelled dominoes fall one into the next. */
export interface DominoesScene {
  kind: 'dominoes';
  /** 3–6 tiles, appear as named. */
  tiles: { label: string; at: number }[];
  /** When the first tile is pushed. */
  fallAt: number;
}

/** Stairs: a ball climbs one step per beat to the top label. */
export interface StairsScene {
  kind: 'stairs';
  /** 2–5 steps, bottom → top. */
  steps: { label: string; at: number }[];
}

export type ExplainerSceneBody =
  | ChecklistScene
  | VersusScene
  | StampScene
  | FlowScene
  | StackScene
  | StatementScene
  | NumberScene
  | TimelineScene
  | NotesScene
  | QuestionScene
  | BeforeAfterScene
  | ChartScene
  | ChatScene
  | NetworkScene
  | LoopScene
  | MythFactScene
  | FunnelScene
  | HeroScene
  | EquationScene
  | QuadrantScene
  | VennScene
  | DefinitionScene
  | StudyScene
  | PictogramScene
  | RankingScene
  | ReceiptScene
  | StreakScene
  | SpectrumScene
  | QuoteScene
  | HeadlineScene
  | JourneyScene
  | SearchScene
  | CodeScene
  | IcebergScene
  | BalanceScene
  | PodiumScene
  | CompoundScene
  | DominoesScene
  | StairsScene;

// ---------------------------------------------------------------------------
// Cross-kind extras: continuation beats + emphasis reactions
// ---------------------------------------------------------------------------

/**
 * Beats any scene can carry on top of its own content, so one scene can
 * "keep going" across several sentences instead of ending after one moment.
 */
export interface SceneExtras {
  /** A stamp that lands on top of the scene later ("YES, BUT"). */
  overlayStamp?: { word: string; at: number };
  /** Whole stage dims (e.g. "broken"). Generic version of stack.dimAt. */
  dimAt?: number;
  /**
   * Emphasis reactions: when the speaker stresses/repeats a word, the
   * matching element (item index, or the whole scene when omitted) pulses.
   */
  pulses?: { at: number; target?: number; strength: 'pulse' | 'shake' }[];
  /** Big moments get a light particle burst. */
  bursts?: { at: number }[];
}

export type ExplainerScene = ExplainerSceneBody & SceneExtras;

// ---------------------------------------------------------------------------
// Sound cues (emitted by scene kinds, mixed by src/main/render/scene-sfx.ts)
// ---------------------------------------------------------------------------

/**
 * Tasteful cue vocabulary. No dings, chimes, coins or meme sounds — every cue
 * maps to a soft, low, physical sound (paper, card, air, soft impact).
 */
export const SCENE_CUE_KINDS = [
  'tick', // checklist item / timeline dot — soft card-place
  'slide', // card flies in — card slide
  'thump', // stamp / statement — soft heavy impact
  'pop', // number lands / bubble appears — soft low pop
  'flip', // card flip / answer reveal — paper flip
  'whoosh', // stage enter/exit, transitions — soft air
  'rise', // build-up before a reveal — gentle riser
] as const;
export type SceneCueKind = (typeof SCENE_CUE_KINDS)[number];

export interface SceneCue {
  kind: SceneCueKind;
  /** Seconds — same basis as the scene's beat times. */
  at: number;
  /** 0–1 relative loudness inside the cue's own range (default 1). */
  gain?: number;
}

// ---------------------------------------------------------------------------
// Composition props
// ---------------------------------------------------------------------------

/** One scene inside a rendered sequence. Beat times are sequence-local. */
export interface SequenceScene {
  scene: ExplainerScene;
  /** Frames this scene's <TransitionSeries.Sequence> lasts. */
  durationInFrames: number;
}

export type SceneTransitionKind = 'slide' | 'fade' | 'grow';

/**
 * Props for the `ExplainerSequence` composition: one or more chained scenes
 * rendered as ONE continuous piece, joined by transitions (a checklist item
 * can grow into the next scene).
 */
export interface ExplainerSequenceProps {
  scenes: SequenceScene[];
  /** transitions[i] joins scenes[i] → scenes[i+1]. */
  transitions: { kind: SceneTransitionKind; durationInFrames: number }[];
  layout: ExplainerLayout;
  aspect: ExplainerAspect;
  palette: ExplainerPalette;
  /** Play the stage slide-up entrance / exit (false when the edge is a chain). */
  enter: boolean;
  exit: boolean;
  /**
   * Seconds the stage is actually on screen (the render may be padded past
   * it); the exit animation finishes here. Defaults to the full duration.
   */
  visibleSec?: number;
  /**
   * Content box override (canvas px) — `over` cards placed clear of the
   * speaker's face. Defaults to `stageSafeBox(layout, aspect)`.
   */
  safeBox?: StageSafeBox;
}

/** Legacy single-scene props (kept for the `ExplainerScene` composition). */
export interface ExplainerSceneProps {
  scene: ExplainerScene;
  accentColor: string;
  palette?: ExplainerPalette;
  layout?: ExplainerLayout;
  aspect?: ExplainerAspect;
}

// ---------------------------------------------------------------------------
// Generic time mapping
// ---------------------------------------------------------------------------

function isTimeKey(key: string): boolean {
  return key === 'at' || key.endsWith('At');
}

function mapValue(value: unknown, fn: (t: number) => number): unknown {
  if (Array.isArray(value)) return value.map((v) => mapValue(v, fn));
  if (typeof value === 'object' && value !== null) {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value)) {
      out[key] = typeof v === 'number' && isTimeKey(key) ? fn(v) : mapValue(v, fn);
    }
    return out;
  }
  return value;
}

/**
 * Apply `fn` to every beat time in a scene (see TIME CONVENTION above).
 * Pure; returns a new object.
 */
export function mapSceneTimes<T extends ExplainerScene>(scene: T, fn: (t: number) => number): T {
  return mapValue(scene, fn) as T;
}

/** Collect every beat time in a scene, sorted ascending. Pure. */
export function collectSceneTimes(scene: ExplainerScene): number[] {
  const times: number[] = [];
  mapSceneTimes(scene, (t) => {
    times.push(t);
    return t;
  });
  return times.sort((a, b) => a - b);
}
