import { readFileSync } from 'node:fs';
import { Fragment, isValidElement, type ReactNode } from 'react';
import { expansionFixtureSpeech } from '../../../../../ai/explainer/expansion-fixture-words';
import {
  parseExpansionSectionScan,
  parseExpansionSolidUnfold,
} from '../../../../../ai/explainer/expansion-geometry-section-unfold-contract';
import { makeParseContext, type Rec } from '../../../../../ai/explainer/kind-spec';
import { Clay } from '../../hero-kit';
import type { ExpansionSectionUnfoldScene } from './section-unfold-types';
import {
  EXPANSION_SECTION_PARTS,
  EXPANSION_UNFOLD_FACES,
  type ExpansionSectionTemplate,
} from './section-unfold-types';

export const sectionPacket = JSON.parse(
  readFileSync(
    'scripts/explainer-stills/fixtures/expansion/geometry/section-unfold.source.json',
    'utf8',
  ),
) as {
  stories: {
    id: string;
    name: string;
    words: Parameters<typeof makeParseContext>[0];
    window: Parameters<typeof makeParseContext>[1];
    proposal: Rec;
  }[];
};
export function sectionAccepted(
  story: (typeof sectionPacket.stories)[number],
  visualMode: 'diagram' | 'hybrid' = 'diagram',
): ExpansionSectionUnfoldScene {
  const ctx = makeParseContext(story.words, story.window);
  const scene = (story.id === '57' ? parseExpansionSectionScan : parseExpansionSolidUnfold)(
    { ...story.proposal, visualMode },
    ctx,
  );
  if (!scene || ctx.issues.length) throw new Error(JSON.stringify(ctx.issues));
  return scene;
}
function wordsEnd(spans: readonly { toWord: number }[]): number {
  return spans[spans.length - 1].toWord;
}
export function sectionMaximum(
  template: ExpansionSectionTemplate | 'cube',
  state = 'known',
  letter = 'W',
): (typeof sectionPacket.stories)[number] {
  const identity = letter.repeat(28),
    scope = `${letter.repeat(39)}S`,
    period = `${letter.repeat(31)}P`;
  const actors = Array.from({ length: 8 }, (_, i) =>
    i === 0 ? `${letter.repeat(12)}0` : `${letter.repeat(27)}${i}`,
  );
  const actor = actors[0];
  const condition = `If ${letter.repeat(93)}`;
  const qualifier =
    state === 'simulated'
      ? `simulated ${letter.repeat(86)}`
      : state === 'illustrative'
        ? `illustrative ${letter.repeat(83)}`
        : state;
  const status =
    state === 'conditional'
      ? { state, condition }
      : state === 'known'
        ? { state }
        : { state, qualifier };
  const qualify = (s: string) =>
    state === 'conditional'
      ? `${condition}, ${s}`
      : ['simulated', 'illustrative'].includes(state)
        ? `In this ${qualifier}, ${s}`
        : s;
  const unknown = ['unknown', 'missing', 'disputed'].includes(state);
  const context = `for ${scope} during ${period}`;
  const noun = template === 'cube' ? 'edge' : `${EXPANSION_SECTION_PARTS[template][0]} width`;
  const firstPart = template === 'cube' ? '' : EXPANSION_SECTION_PARTS[template][0];
  const list = (names: readonly string[]) =>
    names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  const setup = `${identity} lists ${list(actors)} as actors with ${template} template${template === 'cube' ? ` and ${list(EXPANSION_UNFOLD_FACES)} faces` : ''} ${context}.`;
  const visibility =
    template === 'cube'
      ? []
      : EXPANSION_SECTION_PARTS[template].map((part) =>
          qualify(
            `${actor} states ${identity} ${part} visibility is ${state === 'disputed' ? 'disputed between hidden and visible' : unknown ? state : 'hidden'} ${context}.`,
          ),
        );
  const amount = '1/1000000000';
  const measure = qualify(
    `${actor} ${identity} ${noun} is ${unknown ? (state === 'disputed' ? `disputed between ${amount} and 0` : state) : amount} millimetres during ${period} among ${scope}.`,
  );
  const unfolding = qualify(
    `${actor} states ${identity} unfolding is ${state === 'disputed' ? 'unknown' : unknown ? state : 'cube-cross'} ${context}.`,
  );
  const correspondence = qualify(
    `${actor} states ${identity} correspondence is ${state === 'disputed' ? 'disputed between matched and unresolved' : unknown ? state : `matched with ${list(EXPANSION_UNFOLD_FACES.map((face) => `${face} matches ${face}`))} on cube-cross`} ${context}.`,
  );
  const section = qualify(
    `${actor} states ${identity} section${unknown ? ` for ${firstPart} is ${state === 'disputed' ? 'disputed between intersects and misses' : state}` : ` intersects ${firstPart}`} ${context}.`,
  );
  const final = qualify(
    `${actor} states ${identity} result is ${state === 'disputed' ? (template === 'cube' ? 'disputed between unfolded and unresolved' : 'disputed between revealed and not-revealed') : unknown ? state : template === 'cube' ? 'unfolded' : 'revealed'} ${context}.`,
  );
  const clauses =
    template === 'cube'
      ? [setup, measure, unfolding, correspondence, final]
      : [setup, ...visibility, section, measure, final];
  const phaseIndexes =
    template === 'cube'
      ? [0, 1, 2, 3, 4]
      : [0, 1, visibility.length + 1, visibility.length + 2, visibility.length + 3];
  const speech = expansionFixtureSpeech(clauses, 10);
  // Five individually authored readable beats, irrespective of sentence word count.
  const words = speech.words.map((word, index) => {
    let phase = 0;
    while (
      phase + 1 < phaseIndexes.length &&
      index >= speech.spans[phaseIndexes[phase + 1]].fromWord
    )
      phase++;
    const first = speech.spans[phaseIndexes[phase]].fromWord;
    const last =
      phase === 4 ? wordsEnd(speech.spans) : speech.spans[phaseIndexes[phase + 1]].fromWord - 1;
    const span = { fromWord: first, toWord: last },
      step = 1.1 / (last - first + 1);
    return {
      ...word,
      start: 0.25 + phase * 1.85 + (index - span.fromWord) * step,
      end: 0.25 + phase * 1.85 + (index - span.fromWord + 1) * step,
    };
  });
  const disputedAlternatives: Record<string, [string, string]> = {
    visibility: ['hidden', 'visible'],
    section: ['intersects', 'misses'],
    correspondence: ['matched', 'unresolved'],
    result: template === 'cube' ? ['unfolded', 'unresolved'] : ['revealed', 'not-revealed'],
  };
  const fact = (claim: string, phase: number, value: string): Rec => ({
    actor,
    identity,
    claim,
    scope,
    period,
    evidence: speech.spans[phaseIndexes[phase]],
    ...status,
    ...(state === 'disputed'
      ? claim === 'unfolding'
        ? { state: 'unknown', qualifier: 'unknown' }
        : { alternatives: disputedAlternatives[claim] }
      : unknown
        ? {}
        : { value }),
  });
  const measurement: Rec = {
    actor,
    claim: `${identity} ${noun}`,
    basis: { unit: 'millimetre', period, population: scope },
    evidence: speech.spans[phaseIndexes[template === 'cube' ? 1 : 3]],
    ...status,
    ...(unknown
      ? state === 'disputed'
        ? {
            alternatives: [
              { kind: 'rational', value: { numerator: 1, denominator: 1000000000 } },
              { kind: 'rational', value: { numerator: 0, denominator: 1 } },
            ],
          }
        : {}
      : { amount: { kind: 'rational', value: { numerator: 1, denominator: 1000000000 } } }),
  };
  const proposal: Rec = {
    kind: template === 'cube' ? 'geometry-projection' : 'section-view',
    preset: template === 'cube' ? 'unfold' : 'scan',
    template,
    visualMode: 'diagram',
    evidence: 'source-stated',
    identity,
    scope,
    period,
    label: `${identity} lists ${actor}`,
    subject: actor,
    outcome: unknown ? state : template === 'cube' ? 'unfolded' : 'revealed',
    actors: actors.map((label) => ({ label, evidence: speech.spans[0] })),
    measurement,
    result: fact('result', 4, template === 'cube' ? 'unfolded' : 'revealed'),
  };
  ['setupWord', 'actionWord', 'responseWord', 'checkWord', 'resolveWord'].forEach((key, i) => {
    proposal[key] = speech.spans[phaseIndexes[i]].fromWord;
  });
  if (template === 'cube') {
    proposal.net = 'cube-cross';
    proposal.faces = [...EXPANSION_UNFOLD_FACES];
    proposal.unfolding = fact('unfolding', 2, 'cube-cross');
    proposal.correspondence = {
      ...fact('correspondence', 3, 'matched'),
      ...(unknown
        ? {}
        : { links: EXPANSION_UNFOLD_FACES.map((face) => ({ from: face, to: face })) }),
    };
  } else {
    proposal.parts = EXPANSION_SECTION_PARTS[template].map((part, i) => ({
      ...fact('visibility', 1, 'hidden'),
      evidence: speech.spans[1 + i],
      part,
    }));
    proposal.section = { ...fact('section', 2, 'intersects'), part: firstPart };
  }
  return {
    id: template === 'cube' ? '58' : '57',
    name: `maximum-${template}-${state}-${letter}`,
    words,
    window: speech.window,
    proposal,
  };
}
export const sectionCases = [
  ...sectionPacket.stories,
  ...(['box', 'cylinder', 'gadget', 'house', 'cube'] as const).flatMap((template) =>
    ['known', 'conditional', 'unknown', 'missing', 'disputed', 'simulated', 'illustrative'].map(
      (state) => sectionMaximum(template, state),
    ),
  ),
];

/** Never executes hook-bearing components. Only explicitly audited pure model functions/Clay. */
export function sectionTreeCost(node: ReactNode): { meshes: number; instances: number } {
  let meshes = 0,
    instances = 0;
  const walk = (n: ReactNode): void => {
    if (Array.isArray(n)) {
      n.forEach(walk);
      return;
    }
    if (!isValidElement<{ children?: ReactNode; count?: number }>(n)) return;
    if (n.type === Fragment) {
      walk(n.props.children);
      return;
    }
    if (n.type === Clay) {
      walk(Clay(n.props as Parameters<typeof Clay>[0]) as ReactNode);
      return;
    }
    if (typeof n.type !== 'string') throw new Error(`Unaudited component: ${String(n.type)}`);
    if (n.type === 'mesh') meshes++;
    if (n.type === 'instancedMesh') instances += n.props.count ?? 0;
    walk(n.props.children);
  };
  walk(node);
  return { meshes, instances };
}

interface ModelProps {
  children?: ReactNode;
  position?: number[];
  rotation?: number[];
  scale?: number | number[];
  args?: number[];
  userData?: { authoredId?: string };
}
/** Independent FK of actual host parents; includes the root model's authored placement/scale. */
export function sectionMeshWorldVertices(node: ReactNode): Map<string, number[][]> {
  const result = new Map<string, number[][]>();
  const transform = (p: number[], props: ModelProps): number[] => {
    const s = props.scale ?? 1;
    let [x, y, z] = p.map((v, i) => v * (typeof s === 'number' ? s : s[i]));
    const [a, b, c] = props.rotation ?? [0, 0, 0];
    // THREE Euler XYZ: local Z, then Y, then X.
    [x, y] = [x * Math.cos(c) - y * Math.sin(c), x * Math.sin(c) + y * Math.cos(c)];
    [x, z] = [x * Math.cos(b) + z * Math.sin(b), -x * Math.sin(b) + z * Math.cos(b)];
    [y, z] = [y * Math.cos(a) - z * Math.sin(a), y * Math.sin(a) + z * Math.cos(a)];
    return [x, y, z].map((v, i) => v + (props.position?.[i] ?? 0));
  };
  const walk = (n: ReactNode, parents: ModelProps[]): void => {
    if (Array.isArray(n)) {
      for (const child of n) walk(child, parents);
      return;
    }
    if (!isValidElement<ModelProps>(n)) return;
    if (n.type === Fragment) {
      walk(n.props.children, parents);
      return;
    }
    if (n.type === Clay) return;
    if (typeof n.type !== 'string') throw new Error('Unaudited FK component');
    const chain = [...parents, n.props];
    const id = n.props.userData?.authoredId;
    if (n.type === 'mesh' && id?.startsWith('expansion-58-face-')) {
      const children = Array.isArray(n.props.children) ? n.props.children : [n.props.children];
      const geometry = children.find(
        (child) => isValidElement<ModelProps>(child) && child.type === 'boxGeometry',
      );
      if (!isValidElement<ModelProps>(geometry) || !geometry.props.args)
        throw new Error('Missing actual panel geometry');
      const [w, h] = geometry.props.args;
      result.set(
        id,
        [
          [-w / 2, -h / 2, 0],
          [w / 2, -h / 2, 0],
          [w / 2, h / 2, 0],
          [-w / 2, h / 2, 0],
        ].map((corner) => chain.reduceRight((p, props) => transform(p, props), corner)),
      );
    }
    walk(n.props.children, chain);
  };
  walk(node, []);
  return result;
}
