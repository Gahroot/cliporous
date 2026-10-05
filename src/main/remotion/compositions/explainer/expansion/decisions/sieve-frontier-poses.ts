import { diagramPose } from '../../diagrams/motion';
import { plottedValueText } from '../kits/plots';
import type { ExpansionKitPose } from '../scene-types';
import { compare, rationalPosition } from '../value-logic';
import type { ExpansionQuantity, ExpansionRational } from '../value-types';
import type {
  ExpansionParetoScene,
  ExpansionSieveFrontierScene,
  ExpansionSieveScene,
  SieveCheck,
} from './sieve-frontier-types';

export interface SieveFrontierPage {
  id: string;
  record: number;
  lines: string[];
  rows: { id: string; text: string; index: number }[];
}
export interface SieveFrontierPose extends ExpansionKitPose {
  turn: number;
  page: number;
  pages: SieveFrontierPage[];
}
export function checkText(r: SieveCheck): string {
  return r.state === 'disputed'
    ? 'disputed: pass / fail'
    : 'status' in r
      ? `${r.state}: ${r.status}`
      : r.state;
}
export function checkCode(r: SieveCheck): string {
  return `${{ known: 'K', unknown: '?', missing: 'M', disputed: 'D', conditional: 'C', illustrative: 'I', simulated: 'S' }[r.state]}${'status' in r ? (r.status === 'pass' ? '+' : '-') : ''}`;
}
export function sieveFrontierFields(scene: ExpansionSieveFrontierScene, index: number): string[] {
  const r = scene.records[index];
  const option = scene.entities.find((e) => e.id === r.optionId);
  const common = [
    scene.label,
    scene.subject,
    scene.outcome,
    scene.evidence,
    ...(scene.condition ? [scene.condition] : []),
    `Period: ${scene.period}`,
    `Population: ${scene.population}`,
    `O${scene.entities.findIndex((e) => e.id === r.optionId) + 1}: ${option?.label}`,
    `R${index + 1}`,
  ];
  if (scene.storyId === '25') {
    const check = scene.records[index];
    const requirement = scene.requirements.find((q) => q.id === check.requirementId);
    if (!requirement) throw new Error('Missing source requirement');
    return [
      ...common,
      sieveOptionStatus(scene, check.optionId).text,
      `C${scene.requirements.indexOf(requirement) + 1}: ${requirement.label}`,
      requirement.content,
      checkText(check),
      ...('condition' in check ? [check.condition] : 'qualifier' in check ? [check.qualifier] : []),
      'Source checks, not winner',
    ];
  }
  const record = scene.records[index];
  const criterion = scene.criteria.find((c) => c.id === record.criterionId);
  if (!criterion) throw new Error('Missing source criterion');
  const q = record.quantity;
  return [
    ...common,
    `C${scene.criteria.indexOf(criterion) + 1}: ${criterion.label}`,
    criterion.direction,
    plottedValueText(q),
    `State: ${q.state}`,
    `Unit: ${q.basis.unit}`,
    ...(q.basis.denominator
      ? [`Denominator: ${q.basis.denominator.numerator}/${q.basis.denominator.denominator}`]
      : []),
    ...('condition' in q ? [q.condition] : 'qualifier' in q ? [q.qualifier] : []),
    ...(scene.result.state === 'derived'
      ? [
          scene.result.nondominatedOptionIds.includes(record.optionId)
            ? 'Nondominated in scope'
            : 'Dominated in scope',
          ...scene.result.dominations
            .filter((d) => d.fromId === record.optionId || d.toId === record.optionId)
            .map(
              (d) =>
                `O${scene.entities.findIndex((e) => e.id === d.fromId) + 1} dominates O${scene.entities.findIndex((e) => e.id === d.toId) + 1}`,
            ),
        ]
      : ['Source-qualified: no frontier']),
    'Not a universal winner',
  ];
}
/** Character paging preserves even unbroken source tokens; no ellipsis or font scaling. */
export function sieveFrontierPages(scene: ExpansionSieveFrontierScene): SieveFrontierPage[] {
  return scene.records.flatMap((r, record) => {
    const lines = sieveFrontierFields(scene, record).flatMap((field) => {
      const chars = Array.from(field);
      return Array.from({ length: Math.max(1, Math.ceil(chars.length / 18)) }, (_, i) =>
        chars.slice(i * 18, (i + 1) * 18).join(''),
      );
    });
    return Array.from({ length: Math.ceil(lines.length / 13) }, (_, i) => ({
      id: r.id,
      record,
      lines: lines.slice(i * 13, (i + 1) * 13),
      rows: lines
        .slice(i * 13, (i + 1) * 13)
        .map((text, index) => ({ id: `${r.id}:page:${i}:line:${i * 13 + index}`, text, index })),
    }));
  });
}
export function sieveFrontierPose(
  scene: ExpansionSieveFrontierScene,
  time: number,
): SieveFrontierPose {
  const t = Number.isFinite(time) ? time : scene.setupAt;
  const p = diagramPose(t, scene);
  const pages = sieveFrontierPages(scene);
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
export function sieveOptionStatus(
  scene: ExpansionSieveScene,
  optionId: string,
): { code: string; fail: boolean; qualified: boolean; text: string } {
  const records = scene.records.filter((r) => r.optionId === optionId);
  const fail = records.some((r) => r.state === 'known' && r.status === 'fail');
  const qualified =
    records.some((r) => r.state !== 'known') ||
    !!scene.condition ||
    scene.evidence !== 'source-stated';
  return {
    code: `${fail ? 'F' : qualified ? '' : 'P'}${qualified ? '/Q' : ''}`,
    fail,
    qualified,
    text: `${fail ? 'Fails a stated requirement' : qualified ? 'No unqualified clearance' : 'Passes stated checks'}${qualified ? '; qualifications retained' : ''}`,
  };
}
export function frontierMarks(
  scene: ExpansionParetoScene,
  criterionId: string,
): {
  id: string;
  optionId: string;
  state: ExpansionQuantity['state'];
  positions: number[];
  operands: { id: string; position: number }[];
}[] {
  const domain = frontierDomain(scene, criterionId);
  return scene.records
    .filter((r) => r.criterionId === criterionId)
    .map((r) => {
      const q = r.quantity;
      const values = q.state === 'disputed' ? q.alternatives : 'amount' in q ? [q.amount] : [];
      const operands = values.map((a) => {
        if (a.kind !== 'rational') throw new Error('Expected parser scalar');
        const p = rationalPosition(a.value, ...domain);
        if (!p.ok) throw new Error('Invalid exact position');
        return {
          id: `${r.id}:operand:${a.value.numerator}/${a.value.denominator}`,
          position: p.value,
        };
      });
      return {
        id: r.id,
        optionId: r.optionId,
        state: q.state,
        positions: operands.map((o) => o.position),
        operands,
      };
    });
}
/** Independent exact domains, including zero, never a shared-unit or weighted axis. */
export function frontierDomain(
  scene: ExpansionParetoScene,
  criterionId: string,
): readonly [ExpansionRational, ExpansionRational] {
  let low: ExpansionRational = { numerator: 0, denominator: 1 };
  let high = low;
  for (const r of scene.records.filter((r) => r.criterionId === criterionId)) {
    const q = r.quantity;
    const amounts = q.state === 'disputed' ? q.alternatives : 'amount' in q ? [q.amount] : [];
    for (const amount of amounts) {
      if (amount.kind !== 'rational') throw new Error('Expected parser scalar');
      const below = compare(amount.value, low),
        above = compare(amount.value, high);
      if (!below.ok || !above.ok) throw new Error('Invalid exact domain');
      if (below.value < 0) low = amount.value;
      if (above.value > 0) high = amount.value;
    }
  }
  const order = compare(low, high);
  if (!order.ok) throw new Error('Invalid exact domain');
  return [low, order.value === 0 ? { numerator: 1, denominator: 1 } : high];
}
