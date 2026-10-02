import type {
  StoryboardLabel,
  StoryboardModel,
  StoryboardPanel,
} from '../../../shared/storyboards';

/** Authored geometry and conservative mesh ceilings, not model-supplied coordinates. */
export const BOARD_LAYOUT = Object.freeze({
  panelWidth: 1_400,
  panelHeight: 820,
  panelGap: 100,
  inset: 80,
  panSec: 0.75,
  revealSec: 0.35,
  fadeSec: 0.25,
  wordsPerSecond: 3.5,
  // Physical pixels at 1920×1080; recap text must not become a miniature diagram.
  minOverviewTitlePx: 28,
  minOverviewTextPx: 18,
});

export const BOARD_MODELS: Record<
  StoryboardModel,
  { meshes: number; actionSec: number; subject: RegExp; activate: RegExp; deactivate?: RegExp }
> = {
  lightbulb: {
    meshes: 12,
    actionSec: 0.8,
    subject: /\b(light\s?bulb|bulb|light)\b/i,
    activate: /\b(lights? up|turns? on|illuminates?|glows?)\b/i,
    deactivate: /\b(turns? off|dims?|goes? dark)\b/i,
  },
  clapperboard: {
    meshes: 20,
    actionSec: 1.2,
    subject: /\b(clapperboard|slate)\b/i,
    activate: /\b(claps?|closes?|snaps? shut)\b/i,
  },
  laptop: {
    meshes: 16,
    actionSec: 1.6,
    subject: /\b(laptop|computer)\b/i,
    activate: /\b(opens?|turns? on|boots?)\b/i,
  },
  hourglass: {
    meshes: 48,
    actionSec: 2,
    subject: /\b(hourglass)\b/i,
    activate: /\b(flows?|falls?|drains?|runs? out|passes?)\b/i,
  },
  battery: {
    meshes: 16,
    actionSec: 1.8,
    subject: /\b(battery)\b/i,
    activate: /\b(charges?|charging|fills?|recharges?)\b/i,
    deactivate: /\b(drains?|depletes?|discharges?|runs? out)\b/i,
  },
  gears: {
    meshes: 12,
    actionSec: 1.5,
    subject: /\b(gears?)\b/i,
    activate: /\b(turns?|rotates?|spins?|mesh(?:es)?)\b/i,
  },
  book: {
    meshes: 48,
    actionSec: 1.6,
    subject: /\b(book)\b/i,
    activate: /\b(opens?|pages? turn|flips?)\b/i,
  },
};

export function panelLabels(panel: StoryboardPanel): StoryboardLabel[] {
  switch (panel.kind) {
    case 'statement':
      return [panel.title, panel.body];
    case 'comparison':
      return [panel.title, panel.left, panel.right];
    case 'process':
    case 'notes':
      return [panel.title, ...panel.items];
    case 'quantity':
      return [panel.title, panel.evidence, panel.unit];
    case 'hero':
      return [panel.title, panel.caption];
  }
}

export const STORYBOARD_CATALOG_PROMPT = `Return only {"board": null} or {"board": <source spec>}. Never return multiple boards.
A source spec has ONLY kind:"storyboard", specVersion:1, startWord,endWord, subject:{text,startWord,endWord}, panels, optional overview:{atWord}.
Every panel has ONLY id,kind,startWord,endWord,title:{text,startWord,endWord},revealWord,moveWord, optional prop.
Templates add exactly these fields:
statement: body label. comparison: left/right labels and evidence:{startWord,endWord} containing both sides and explicit comparison.
process: 2..4 ordered item labels, relationship:"sequence"|"causes", evidence span containing every item and explicit affirmative relationship.
notes: 1..4 ordered item labels. quantity: finite value, unit label, evidence label containing that exact number and unit (no estimates/conditions).
hero: caption label and required prop.
Prop: {id,model,action,atWord,evidence:{startWord,endWord}}. Models: lightbulb,clapperboard,laptop,hourglass,battery,gears,book.
All models allow reveal/activate; ONLY battery and lightbulb allow deactivate. Reveal identifies a literal source-backed object; actions require a local affirmative source clause about that object, not a metaphor or conditional claim.
Repeated prop id retains identical model and evidence; no invented decorative objects. Every label is the exact source phrase in its inclusive span (<=96 chars, <=16 words).
Use 1..5 ordered nonoverlapping panels in ONE owned section, one shared subject, 4..40 seconds total. First panel/reveal starts at board start; last panel ends at board end.
Reveal each panel no later than its move; incoming title must be present during the 0.75s pan. Reserve reading time (3.5 words/sec), action time (up to 2s), and >=0.8s final hold per panel. Overview is optional and needs 0.75s move +1.5s hold. Use it only for one or two panels with short labels; otherwise omit the overview, not any source facts.
Do not submit unsupported causality, negated/conditional directions, estimated quantities, URLs, code, SVG, styles, colors, geometry, fonts or extra fields. Null is better than an unsupported explanation.`;
