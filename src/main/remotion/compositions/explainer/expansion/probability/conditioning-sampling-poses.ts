import { PerspectiveCamera, Vector3 } from 'three';
import { DIAGRAM_REGIONS } from '../../diagrams/layout';
import { reveal } from '../../diagrams/motion';
import { EXPLANATION_CAMERA } from '../../explanation-layout';
import { plottedValueText } from '../kits/plots';
import type { PopulationCount, PopulationData } from '../kits/population';
import type { ExpansionKitPose, ExpansionKitState } from '../scene-types';
import type { ExpansionQuantity } from '../value-types';
import type {
  ExpansionConditioningSamplingScene,
  ExpansionPopulationCount,
  ExpansionPopulationDisplay,
} from './conditioning-sampling-types';

export function conditioningSamplingPose(
  t: number,
  scene: ExpansionConditioningSamplingScene,
): ExpansionKitPose {
  return {
    reveal: reveal(t, scene.setupAt, 0.35),
    action: reveal(t, scene.actionAt),
    response: reveal(t, scene.responseAt),
    check: reveal(t, scene.checkAt),
    resolve: reveal(t, scene.resolveAt, 0.25),
  };
}
export interface ConditioningSamplingRow {
  readonly id: string;
  readonly groupId: string;
  readonly label: string;
  readonly role: string;
  readonly rule: string;
  readonly state: ExpansionKitState;
  readonly quantity?: ExpansionQuantity;
  readonly population?: PopulationData;
  readonly display?: ExpansionPopulationDisplay;
}
function population(
  record: ExpansionPopulationCount,
  id: string,
  state: ExpansionKitState,
  groupId = id,
  denominator?: PopulationCount,
): PopulationData | undefined {
  const { quantity: q, display } = record;
  if (
    q.state !== 'known' ||
    !display ||
    q.amount.kind !== 'rational' ||
    display.membersPerMark.denominator !== 1
  )
    return undefined;
  return {
    marks: Array.from({ length: display.marks }, (_, index) => ({
      id: `${id}-display-${String(index).padStart(3, '0')}`,
      membership: [groupId],
      state,
      represents: { state: 'known' as const, value: display.membersPerMark },
    })),
    representedPopulation: { state: 'known', value: q.amount.value },
    // Never manufacture a reference denominator from this row's count.
    sourceDenominator:
      denominator ??
      (q.basis.denominator
        ? { state: 'known', value: q.basis.denominator }
        : { state: 'unknown', qualifier: 'not supplied' }),
    basis: q.basis,
    aggregation:
      display.mode === 'individual'
        ? { kind: 'literal' }
        : {
            kind: 'aggregate',
            qualifier: `each mark = ${display.membersPerMark.numerator} members`,
          },
  };
}
const stateOf = (
  q: ExpansionQuantity | undefined,
  fallback: ExpansionKitState,
): ExpansionKitState =>
  !q || q.state === 'missing' || q.state === 'unknown'
    ? 'unknown'
    : q.state === 'disputed'
      ? 'disputed'
      : fallback;

/** Display IDs identify aggregate slots, never invented person identities or cross-tray overlap. */
export function conditioningSamplingView(
  scene: ExpansionConditioningSamplingScene,
): readonly ConditioningSamplingRow[] {
  const label = (id: string) => {
    const entity = scene.entities.find((entry) => entry.id === id);
    if (!entity) throw new Error('Missing validated population identity');
    return entity.label;
  };
  if (scene.storyId === '11') {
    return (['population', 'subset', 'event'] as const).map((key) => {
      const id =
        key === 'population'
          ? scene.populationId
          : key === 'subset'
            ? scene.subsetId
            : scene.eventId;
      const record = scene.counts[key];
      const state = stateOf(record.quantity, key === 'population' ? 'retained' : 'active');
      return {
        id,
        groupId: id,
        label: label(id),
        state,
        quantity: record.quantity,
        role:
          key === 'subset'
            ? 'Conditioning denominator'
            : key === 'population'
              ? 'Original population (not denominator)'
              : 'Event within subset',
        rule: scene.inclusion.rule,
        display: record.display,
        population: population(
          record,
          id,
          state,
          id,
          key === 'population'
            ? undefined
            : scene.counts.subset.quantity.state === 'known' &&
                scene.counts.subset.quantity.amount.kind === 'rational'
              ? { state: 'known', value: scene.counts.subset.quantity.amount.value }
              : {
                  state: 'unknown',
                  qualifier: `${scene.counts.subset.quantity.state} conditioning denominator`,
                },
        ),
      };
    });
  }
  return scene.eligibility.flatMap((entry) => {
    const records = scene.measurements.filter((record) => record.groupId === entry.groupId);
    return (records.length ? records : [undefined]).map((record, index) => {
      const id = `${entry.groupId}-measurement-${index}`;
      const state = entry.status === 'excluded' ? 'excluded' : stateOf(record?.quantity, 'active');
      return {
        id,
        groupId: entry.groupId,
        label: label(entry.groupId),
        state,
        role: `${entry.status} · sampling-frame only`,
        rule: entry.rule,
        quantity: record?.quantity,
        display: record?.display,
        population: record ? population(record, id, state, entry.groupId) : undefined,
      };
    });
  });
}

export const CONDITIONING_SAMPLING_FONT = 22;
// A full 1em per character fits even W/M; reserve additional context lines above details.
export const CONDITIONING_SAMPLING_COLUMNS = 30;
export const CONDITIONING_SAMPLING_CONTEXT_COLUMNS = 40;
export const CONDITIONING_SAMPLING_PAGE_LINES = 9;
export interface ConditioningSamplingField {
  readonly id: string;
  readonly sourceId: string;
  readonly text: string;
}
export interface ConditioningSamplingPage {
  readonly id: string;
  readonly rowIndex: number;
  readonly fields: readonly ConditioningSamplingField[];
}
export function conditioningSamplingFields(
  row: ConditioningSamplingRow,
): readonly ConditioningSamplingField[] {
  const entries: [string, string][] = [['rule', row.rule]];
  const q = row.quantity;
  if (q) {
    entries.push(
      ['actor', `Actor: ${q.actor}`],
      ['claim', `Claim: ${q.claim}`],
      ['value', `Value: ${plottedValueText(q)}`],
      ['unit', `Unit: ${q.basis.unit}`],
      ['population', `Population: ${q.basis.population}`],
      ['period', `Period: ${q.basis.period}`],
    );
    if (q.basis.denominator)
      entries.push([
        'basis-denominator',
        `Source denominator: ${q.basis.denominator.numerator}/${q.basis.denominator.denominator}`,
      ]);
    if (q.state !== 'known')
      entries.push(['qualifier', q.state === 'conditional' ? q.condition : q.qualifier]);
  } else entries.push(['value', 'Measurement not supplied; not zero']);
  if (row.population) {
    const pop = row.population;
    const count = (v: PopulationCount) =>
      v.state === 'known'
        ? v.value.denominator === 1
          ? String(v.value.numerator)
          : `${v.value.numerator}/${v.value.denominator}`
        : `${v.state}: ${v.qualifier}`;
    entries.push(
      ['represented-count', `Population: ${count(pop.representedPopulation)}`],
      ['reference-denominator', `Reference denominator: ${count(pop.sourceDenominator)}`],
      [
        'aggregation',
        pop.aggregation.kind === 'literal'
          ? `${pop.marks.length} individually represented members`
          : `${pop.marks.length} displayed aggregate groups; ${pop.aggregation.qualifier}`,
      ],
    );
  } else if (row.display)
    entries.push([
      'aggregation',
      `${row.display.marks} ${row.display.mode} display weights; each = ${row.display.membersPerMark.numerator}/${row.display.membersPerMark.denominator} source members. No fractional individuals drawn.`,
    ]);
  return entries.map(([id, text]) => ({
    id: `${row.id}-${id}`,
    sourceId: `${row.id}-${id}`,
    text,
  }));
}
/** No truncation: oversized fields are split into exact consecutive substrings. */
export function conditioningSamplingPages(
  scene: ExpansionConditioningSamplingScene,
): readonly ConditioningSamplingPage[] {
  const rows = conditioningSamplingView(scene);
  const pages: ConditioningSamplingPage[] = [];
  function append(rowIndex: number, fields: readonly ConditioningSamplingField[], prefix: string) {
    let pending: ConditioningSamplingField[] = [],
      used = 0;
    function flush() {
      if (!pending.length) return;
      pages.push({ id: `${prefix}-page-${pages.length}`, rowIndex, fields: pending });
      pending = [];
      used = 0;
    }
    for (const field of fields) {
      const chars = Array.from(field.text);
      const chunk = CONDITIONING_SAMPLING_COLUMNS * CONDITIONING_SAMPLING_PAGE_LINES;
      for (let offset = 0; offset < chars.length; offset += chunk) {
        const text = chars.slice(offset, offset + chunk).join('');
        const lines = Math.ceil(Array.from(text).length / CONDITIONING_SAMPLING_COLUMNS);
        if (used + lines > CONDITIONING_SAMPLING_PAGE_LINES) flush();
        pending.push({ ...field, id: `${field.id}-part-${offset}`, text });
        used += lines;
      }
    }
    flush();
  }
  rows.forEach((row, index) => {
    append(
      index,
      scene.storyId === '12'
        ? [
            {
              id: `${row.id}-selection-rule`,
              sourceId: `${row.id}-selection-rule`,
              text: `Selection rule: ${scene.selection.rule}`,
            },
            ...conditioningSamplingFields(row),
          ]
        : conditioningSamplingFields(row),
      row.id,
    );
  });
  const finalRow =
    scene.storyId === '11'
      ? 2
      : Math.max(
          0,
          rows.findIndex((row) => row.groupId === scene.resolveGroupId),
        );
  const finalFields: ConditioningSamplingField[] = [];
  if (scene.storyId === '11' && scene.derived)
    finalFields.push({
      id: 'derived',
      sourceId: 'derived',
      text: `${plottedValueText(scene.derived)}; operands ${scene.derived.operands.map((v) => `${v.numerator}/${v.denominator}`).join(' ÷ ')}`,
    });
  finalFields.push({ id: 'resolution', sourceId: 'resolution', text: scene.resolutionText });
  append(finalRow, finalFields, 'resolution');
  return pages;
}
/** A real source-beat window, not a page override; every detail is visited before final hold. */
export function conditioningSamplingPage(
  t: number,
  scene: ExpansionConditioningSamplingScene,
): number {
  const total = conditioningSamplingPages(scene).length;
  if (!Number.isFinite(t) || t <= scene.setupAt) return 0;
  if (t >= scene.resolveAt) return total - 1;
  return Math.min(
    total - 2,
    Math.floor(((t - scene.setupAt) / (scene.resolveAt - scene.setupAt)) * (total - 1)),
  );
}
export function conditioningSamplingContext(
  scene: ExpansionConditioningSamplingScene,
  row: ConditioningSamplingRow,
): readonly string[] {
  const label = (id: string) => scene.entities.find((entity) => entity.id === id)?.label ?? '';
  const owner = `${label(scene.ownerId)}'s ${label(scene.storyId === '11' ? scene.populationId : scene.frameId)}`;
  const denominator =
    scene.storyId === '11'
      ? `Denominator: ${label(scene.denominatorId)} = ${scene.counts.subset.quantity.state === 'known' ? plottedValueText(scene.counts.subset.quantity) : scene.counts.subset.quantity.state}`
      : 'Scope: sampling frame, not the world';
  return [
    owner,
    denominator,
    `${row.label} · ${row.role}`,
    `Measurement state: ${row.quantity?.state ?? 'not supplied'}`,
  ];
}

export interface ConditioningSamplingViewport {
  width: number;
  height: number;
  surface: { x: number; y: number; width: number; height: number };
}
export const CONDITIONING_SAMPLING_VIEWPORT: ConditioningSamplingViewport = {
  width: 1080,
  height: 960,
  surface: DIAGRAM_REGIONS.body,
};
export function conditioningSamplingCamera(viewport: ConditioningSamplingViewport) {
  const camera = new PerspectiveCamera(
    EXPLANATION_CAMERA.fov,
    viewport.width / viewport.height,
    0.1,
    100,
  );
  camera.position.set(...EXPLANATION_CAMERA.position);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  return camera;
}
export function conditioningSamplingModelPlacement(
  index: number,
  rows: number,
  viewport = CONDITIONING_SAMPLING_VIEWPORT,
) {
  const p = conditioningSamplingPlacement(index, rows);
  const b = viewport.surface;
  const unit = Math.min(b.width / 952, b.height / 478);
  const x = b.x + (b.width - 952 * unit) / 2 + p.trayX * unit;
  const y = b.y + (b.height - 478 * unit) / 2 + p.trayY * unit;
  const camera = conditioningSamplingCamera(viewport);
  const world = new Vector3(
    (2 * x) / viewport.width - 1,
    1 - (2 * y) / viewport.height,
    new Vector3().project(camera).z,
  ).unproject(camera);
  const worldPerPixel =
    (2 * camera.position.length() * Math.tan((EXPLANATION_CAMERA.fov * Math.PI) / 360)) /
    viewport.height;
  return {
    position: world.toArray() as [number, number, number],
    quaternion: camera.quaternion.toArray(),
    scale: worldPerPixel * unit * 100 * p.trayScale,
  };
}

/** Uniform-meet body coordinates; each row owns a disjoint strip, including maximum labels. */
export function conditioningSamplingPlacement(index: number, rows: number) {
  if (
    !Number.isInteger(rows) ||
    rows < 1 ||
    rows > 12 ||
    !Number.isInteger(index) ||
    index < 0 ||
    index >= rows
  )
    throw new Error('Row bounds');
  // Each focus uses the same reserved detail stage; hidden rows remain mounted.
  const height = 290;
  return {
    x: 16,
    y: 130,
    width: 920,
    height,
    trayX: 120,
    trayY: 275,
    trayScale: 0.35,
  };
}
