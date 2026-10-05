import { plottedValueText } from '../kits/plots';
import type { ExpansionKitPose } from '../scene-types';
import type { ExpansionQuantity, ExpansionRational } from '../value-types';
import type { ExpansionVectorFactorizationScene } from './vector-factorization-types';

export interface VectorFactorizationPage {
  readonly id: string;
  readonly lines: readonly string[];
  readonly kind: 'source' | 'quantity' | 'identity' | 'relationship';
  readonly sourceId: string;
}
export interface VectorFactorizationPose extends ExpansionKitPose {
  readonly page: number;
  readonly pages: readonly VectorFactorizationPage[];
}
export const VECTOR_FACTORIZATION_TEXT = {
  x: 24,
  y: 238,
  font: 22,
  leading: 28,
  columns: 40,
  lines: 7,
} as const;
export function vectorFactorizationWrap(
  text: string,
  columns: number = VECTOR_FACTORIZATION_TEXT.columns,
): string[] {
  const chars = Array.from(text);
  return Array.from({ length: Math.max(1, Math.ceil(chars.length / columns)) }, (_, i) =>
    chars.slice(i * columns, (i + 1) * columns).join(''),
  );
}
export function vectorFactorizationLineNodes(
  lines: readonly string[],
  sourceId: string,
): { id: string; text: string }[] {
  return lines.map((text, index) => ({ id: `${sourceId}:line:${index}`, text }));
}
export function vectorFactorizationRational(r: ExpansionRational): string {
  return `(${r.numerator}/${r.denominator})`;
}
export function vectorFactorizationValue(q: ExpansionQuantity): string {
  if ('amount' in q && q.amount.kind === 'rational')
    return q.amount.notation ?? vectorFactorizationRational(q.amount.value);
  if (q.state === 'disputed')
    return q.alternatives
      .map((a) =>
        a.kind === 'rational' ? (a.notation ?? vectorFactorizationRational(a.value)) : 'disputed',
      )
      .join(' / ');
  return q.state;
}
function quantityFields(q: ExpansionQuantity): string[] {
  return [
    q.actor,
    q.claim,
    `State: ${q.state}`,
    plottedValueText(q),
    `Unit: ${q.basis.unit}`,
    `Scope: ${q.basis.population}`,
    `Period: ${q.basis.period}`,
    ...(q.basis.denominator
      ? [`Denominator: ${vectorFactorizationRational(q.basis.denominator)}`]
      : []),
    ...('condition' in q ? [q.condition] : 'qualifier' in q ? [q.qualifier] : []),
  ];
}
export function vectorFactorizationIdentity(scene: ExpansionVectorFactorizationScene): string {
  if (scene.storyId === '55')
    return 'Supplied components only; no resultant or decomposition inferred';
  const r = scene.result;
  if (r.state !== 'derived') return `Result ${r.state}: ${r.qualifier}`;
  const f = r.factors,
    v = vectorFactorizationRational,
    s = scene.symbol;
  // Only the parser's two frozen identities; no evaluation or symbolic rewriting.
  const original = r.operands;
  if (f.template === 'common-factor')
    return `${v(original[0])}${s} + ${v(original[1])} = ${v(f.outerFactor)}(${v(f.linear.coefficient)}${s} + ${v(f.linear.constant)})`;
  return `${v(original[0])}${s}² + ${v(original[1])} = (${v(f.left.coefficient)}${s} + ${v(f.left.constant)})(${v(f.right.coefficient)}${s} + ${v(f.right.constant)})`;
}
export function vectorFactorizationPages(
  scene: ExpansionVectorFactorizationScene,
): VectorFactorizationPage[] {
  const fields: { id: string; kind: VectorFactorizationPage['kind']; text: string[] }[] = [
    {
      id: `${scene.storyId}:source`,
      kind: 'source',
      text: [
        scene.label,
        scene.subject,
        scene.evidence,
        scene.template,
        `Scope: ${scene.scope}`,
        `Period: ${scene.period}`,
        ...(scene.condition ? [scene.condition] : []),
      ],
    },
  ];
  if (scene.storyId === '55') {
    fields[0].text.push(`Frame: ${scene.frame}`, `Axes: ${scene.axes.join(', ')}`);
    for (const [index, vector] of [scene.vector, ...scene.basis].entries()) {
      const label = scene.entities.find((e) => e.id === vector.entityId)?.label;
      if (label === undefined) throw new Error('Lost source vector entity');
      for (const component of vector.components)
        fields.push({
          id: component.id,
          kind: 'quantity',
          text: [
            index === 0 ? 'Supplied vector' : `Supplied basis ${index}`,
            label,
            `Corresponds to frame: ${scene.frame}`,
            `Axis: ${component.axis}`,
            `Direction: ${component.direction}`,
            ...quantityFields(component.quantity),
          ],
        });
    }
    fields.push({
      id: `${scene.storyId}:correspondence`,
      kind: 'relationship',
      text: [
        `Actor: ${scene.subject}`,
        `Frame: ${scene.correspondence.frame}`,
        ...[scene.correspondence.vectorId, ...scene.correspondence.basisIds].map((id) => {
          const vector = [scene.vector, ...scene.basis].find((v) => v.id === id);
          const label = scene.entities.find((e) => e.id === vector?.entityId)?.label;
          if (label === undefined) throw new Error('Lost supplied correspondence');
          return `${id === scene.vector.id ? 'Vector' : 'Basis'}: ${label}`;
        }),
        vectorFactorizationIdentity(scene),
        scene.outcome,
      ],
    });
  } else {
    for (const operand of scene.operands)
      fields.push({
        id: operand.id,
        kind: 'quantity',
        text: [`Source operand: ${operand.role}`, ...quantityFields(operand.quantity)],
      });
    const r = scene.result;
    fields.push({
      id: `${scene.storyId}:result`,
      kind: 'identity',
      text: [
        vectorFactorizationIdentity(scene),
        `Result state: ${r.state}`,
        ...(r.state === 'derived'
          ? [
              `Source state: ${r.sourceState}`,
              `Unit: ${r.basis.unit}`,
              `Scope: ${r.basis.population}`,
              `Period: ${r.basis.period}`,
              ...(r.basis.denominator
                ? [`Denominator: ${vectorFactorizationRational(r.basis.denominator)}`]
                : []),
              ...(r.qualifier ? [r.qualifier] : []),
              ...(r.condition ? [r.condition] : []),
            ]
          : []),
        scene.outcome,
      ],
    });
  }
  return fields.flatMap((field) => {
    const lines = field.text.flatMap((text) => vectorFactorizationWrap(text));
    return Array.from(
      { length: Math.ceil(lines.length / VECTOR_FACTORIZATION_TEXT.lines) },
      (_, i) => ({
        id: `${field.id}:page:${i}`,
        sourceId: field.id,
        kind: field.kind,
        lines: lines.slice(
          i * VECTOR_FACTORIZATION_TEXT.lines,
          (i + 1) * VECTOR_FACTORIZATION_TEXT.lines,
        ),
      }),
    );
  });
}
export function vectorFactorizationPose(
  scene: ExpansionVectorFactorizationScene,
  seconds: number,
): VectorFactorizationPose {
  const t = Number.isFinite(seconds) ? seconds : scene.setupAt;
  const progress = (at: number): number => Math.max(0, Math.min(1, (t - at) / 0.4));
  const pages = vectorFactorizationPages(scene);
  const page =
    t >= scene.resolveAt
      ? pages.length - 1
      : Math.min(
          pages.length - 2,
          Math.max(
            0,
            Math.floor(
              ((t - scene.setupAt) / (scene.resolveAt - scene.setupAt)) * (pages.length - 1),
            ),
          ),
        );
  return {
    reveal: progress(scene.setupAt),
    action: progress(scene.actionAt),
    response: progress(scene.responseAt),
    check: progress(scene.checkAt),
    resolve: progress(scene.resolveAt),
    page,
    pages,
  };
}
