import { diagramPose } from '../../diagrams/motion';
import { plottedValueText } from '../kits/plots';
import type { ExpansionKitPose } from '../scene-types';
import { compare, compatibleBasis, rationalPosition } from '../value-logic';
import type { ExpansionRational } from '../value-types';
import type {
  ExpansionMatrixMatchingScene,
  MatrixMatchingQualification,
} from './matrix-matching-types';

export interface MatrixMatchingPage {
  id: string;
  index: number;
  lines: string[];
}
export interface MatrixMatchingPose extends ExpansionKitPose {
  page: number;
  pages: MatrixMatchingPage[];
  turn: number;
}
export function qualificationText(fact: MatrixMatchingQualification): string {
  return `${fact.state}${'condition' in fact ? `: ${fact.condition}` : 'qualifier' in fact ? `: ${fact.qualifier}` : ''}`;
}
export function entityCode(scene: ExpansionMatrixMatchingScene, id: string): string {
  const index = scene.entities.findIndex((entity) => entity.id === id);
  if (index < 0) throw new Error('Missing source identity');
  return `E${index + 1}`;
}
export function matrixMatchingFields(scene: ExpansionMatrixMatchingScene, index: number): string[] {
  const common = [
    scene.label,
    scene.subject,
    scene.outcome,
    scene.evidence,
    ...(scene.condition ? [scene.condition] : []),
    `Period: ${scene.period}`,
    `Population: ${scene.population}`,
    ...scene.entities.map((e) => `${entityCode(scene, e.id)}: ${e.label}`),
  ];
  if (scene.storyId === '37') {
    const r = scene.relations[index];
    return [
      ...common,
      `Pair ${index + 1}`,
      `${entityCode(scene, r.fromId)} ${r.direction === 'from-to' ? 'to' : 'and'} ${entityCode(scene, r.toId)}`,
      r.role,
      r.direction,
      qualificationText(r),
      'Unrecorded: not supplied',
      'Only stated pairs',
    ];
  }
  if (index < scene.eligibility.length) {
    const r = scene.eligibility[index];
    return [
      ...common,
      'Eligibility, not assignment',
      `${entityCode(scene, r.candidateId)} to ${entityCode(scene, r.destinationId)}`,
      r.status ?? 'No eligibility judgment',
      qualificationText(r),
    ];
  }
  const r = scene.records[index - scene.eligibility.length];
  if (r.type === 'match')
    return [
      ...common,
      'Supplied match, not optimized',
      entityCode(scene, r.candidateId),
      r.status === 'matched'
        ? `Matched to ${entityCode(scene, r.destinationId)}`
        : 'Unresolved, not denied',
      qualificationText(r),
    ];
  const q = r.quantity;
  return [
    ...common,
    `Capacity: ${entityCode(scene, r.destinationId)}`,
    q.actor,
    q.claim,
    plottedValueText(q),
    qualificationText(q),
    `Unit: ${q.basis.unit}`,
    `Period: ${q.basis.period}`,
    `Population: ${q.basis.population}`,
    ...(q.basis.denominator
      ? [`Denominator: ${q.basis.denominator.numerator}/${q.basis.denominator.denominator}`]
      : []),
    'Supplied quantity only; no slots',
  ];
}
/** Conservative 18-codepoint wrap fits shipped Inter at 22px, including unbroken tokens. */
export function matrixMatchingPages(scene: ExpansionMatrixMatchingScene): MatrixMatchingPage[] {
  const count =
    scene.storyId === '37'
      ? scene.relations.length
      : scene.eligibility.length + scene.records.length;
  return Array.from({ length: count }, (_, index) => {
    const id =
      scene.storyId === '37'
        ? scene.relations[index].id
        : index < scene.eligibility.length
          ? scene.eligibility[index].id
          : scene.records[index - scene.eligibility.length].id;
    const lines = matrixMatchingFields(scene, index).flatMap((field) => {
      const chars = Array.from(field);
      return Array.from({ length: Math.max(1, Math.ceil(chars.length / 18)) }, (_, i) =>
        chars.slice(i * 18, (i + 1) * 18).join(''),
      );
    });
    return Array.from({ length: Math.ceil(lines.length / 13) }, (_, i) => ({
      id,
      index,
      lines: lines.slice(i * 13, (i + 1) * 13),
    }));
  }).flat();
}
export function matrixMatchingPose(
  scene: ExpansionMatrixMatchingScene,
  time: number,
): MatrixMatchingPose {
  const t = Number.isFinite(time) ? time : scene.setupAt;
  const p = diagramPose(t, scene);
  const pages = matrixMatchingPages(scene);
  const progress = Math.max(
    0,
    Math.min(1, (t - scene.setupAt) / Math.max(0.001, scene.resolveAt - scene.setupAt)),
  );
  return {
    reveal: p.setup,
    action: p.action,
    response: p.response,
    check: p.check,
    resolve: p.resolve,
    turn: p.modelTurn,
    pages,
    page: Math.min(pages.length - 1, Math.floor(progress * pages.length)),
  };
}
/** Exact supplied capacity operands. Unknown has no operand; zero has a real position. */
export function capacityPositions(scene: ExpansionMatrixMatchingScene, id: string): number[] {
  if (scene.storyId !== '38') return [];
  const selected = scene.records.find((r) => r.id === id);
  if (!selected || selected.type !== 'capacity') return [];
  let high: ExpansionRational = { numerator: 0, denominator: 1 };
  for (const r of scene.records) {
    if (r.type !== 'capacity' || !compatibleBasis(r.quantity.basis, selected.quantity.basis))
      continue;
    const q = r.quantity;
    const amounts = q.state === 'disputed' ? q.alternatives : 'amount' in q ? [q.amount] : [];
    for (const a of amounts) {
      if (a.kind !== 'rational') throw new Error('Expected parser count');
      const order = compare(a.value, high);
      if (!order.ok) throw new Error('Invalid capacity extent');
      if (order.value > 0) high = a.value;
    }
  }
  if (high.numerator === 0) high = { numerator: 1, denominator: 1 };
  const r = scene.records.find((r) => r.id === id);
  if (!r || r.type !== 'capacity') return [];
  const q = r.quantity;
  return (q.state === 'disputed' ? q.alternatives : 'amount' in q ? [q.amount] : []).map((a) => {
    if (a.kind !== 'rational') throw new Error('Expected parser count');
    const p = rationalPosition(a.value, { numerator: 0, denominator: 1 }, high);
    if (!p.ok) throw new Error('Invalid capacity position');
    return p.value;
  });
}
