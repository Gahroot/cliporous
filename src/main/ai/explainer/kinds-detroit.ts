import type { DetroitPlaceScene } from '../../remotion/compositions/explainer/detroit/types';
import { DIAGRAM_LAYOUTS } from '../../remotion/compositions/explainer/diagrams/types';
import type { SceneCue } from '../../remotion/compositions/explainer/types';
import { parseDetroitPlace } from './detroit-contract';

export const detroitPlaceSpec = {
  kind: 'detroit-place',
  family: 'story',
  describe:
    'A source-named Detroit landmark, RenCen-centered city portrait or Eastern Market block. Diagram and hybrid are equally valid.',
  schema:
    '{"kind":"detroit-place","preset":"landmark-focus","visualMode":"hybrid","label":"Renaissance Center","subject":"Detroit","outcome":"A recognizable skyline","evidence":"source-stated","landmarks":["renaissance-center"],"setupWord":0,"actionWord":8,"responseWord":16,"checkWord":24,"resolveWord":32}',
  limits:
    'title 48, subject 34, condition 96, outcome 54 chars; one landmark or at most three for city portrait; five ordered source beats and 0.8s final hold',
  layouts: DIAGRAM_LAYOUTS,
  durationSec: [5, 12],
  triggers: [
    /\bdetroit\b/i,
    /\b(?:renaissance center|rencen|michigan central|fox theatre|fox theater|guardian building|penobscot building|ambassador bridge|eastern market)\b/i,
  ],
  avoid:
    'Do not infer Detroit from hometown, fox, central, Renaissance or train station alone. Spirit of Detroit is unavailable. No implied ownership, traffic or financial impact.',
  parse: parseDetroitPlace,
  cues: (scene: DetroitPlaceScene): SceneCue[] => [
    { kind: 'slide', at: scene.actionAt, gain: 0.3 },
    { kind: 'tick', at: scene.checkAt, gain: 0.3 },
  ],
} as const;
