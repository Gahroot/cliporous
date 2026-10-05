import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ExpansionKitPose } from '../scene-types';
import type { KitAssetProps } from './computing';
import {
  CONSTRAINT_ASSET_BUDGETS,
  ConstraintCandidateClay,
  ConstraintCandidateSvg,
  candidateDisposition,
  RequirementGateClay,
  RequirementGateSvg,
  type RequirementRecord,
  RetainedChoiceClay,
  RetainedChoiceSvg,
} from './constraints';
import {
  ApprovalStationClay,
  ApprovalStationSvg,
  RELATIONSHIP_ASSET_BUDGETS,
  RelationshipContainerClay,
  RelationshipContainerSvg,
  type RelationshipEntity,
  RelationshipEntityClay,
  RelationshipEntitySvg,
  relationshipSegment,
  TypedRelationshipClay,
  type TypedRelationshipProps,
  TypedRelationshipSvg,
} from './relationships';
import {
  DeadlineShutterClay,
  DeadlineShutterSvg,
  projectTemporalInterval,
  TEMPORAL_ASSET_BUDGETS,
  type TemporalInterval,
  TemporalJoinClay,
  TemporalJoinSvg,
  TemporalStateBadgeClay,
  TemporalStateBadgeSvg,
  TemporalTaskClay,
  TemporalTaskSvg,
} from './temporal';

const pose: ExpansionKitPose = { reveal: 1, action: 1, response: 1, check: 1, resolve: 1 };
const base: KitAssetProps = {
  position: [0, 0, 0],
  pose,
  state: 'retained',
  colors: { surface: '#f6ecd9', text: '#23100c', accent: '#9f75ff', muted: '#766e64' },
};
const requirements: RequirementRecord[] = Array.from({ length: 8 }, (_, index) => ({
  id: `requirement-${index}`,
  label: 'M'.repeat(28),
  result: index === 7 ? 'fail' : 'pass',
  priority: 'N'.repeat(28),
}));
const members: RelationshipEntity[] = Array.from({ length: 8 }, (_, index) => ({
  id: `entity-${index}`,
  label: 'M'.repeat(28),
  role: 'member',
}));
const measured: TemporalInterval = {
  kind: 'measured',
  id: 'task-0',
  label: 'M'.repeat(28),
  startValue: { numerator: 2, denominator: 1 },
  endValue: { numerator: 6, denominator: 1 },
  basis: 'hours',
};
const domain = [
  { numerator: 0, denominator: 1 },
  { numerator: 10, denominator: 1 },
] as const;
function html(node: ReactElement): string {
  return renderToStaticMarkup(node);
}
function tags(markup: string): string[] {
  return [...markup.matchAll(/<([A-Za-z][\w:-]*)(?=[\s/>])/g)].map((match) =>
    match[1].toLowerCase(),
  );
}
function verifyPair(
  svg: ReactElement,
  clay: ReactElement,
  budget: { meshes: number; svgElements: number },
): void {
  const diagram = html(svg);
  const model = html(clay);
  const hosts = tags(diagram);
  expect(hosts.length).toBe(budget.svgElements);
  expect(tags(model).filter((tag) => tag === 'mesh').length).toBe(budget.meshes);
  expect(diagram + model).not.toMatch(/<(?:canvas|primitive|instancedmesh|skinnedmesh)\b/i);
  expect(diagram).not.toMatch(/<(?:mesh|group|foreignObject)\b|NaN|Infinity/);
}

describe('constraint eligibility and retained alternatives', () => {
  it('distinguishes pass, failure, unknown and not-stated without choosing a winner', () => {
    expect(candidateDisposition([{ id: 'one', label: 'Requirement', result: 'pass' }])).toBe(
      'eligible',
    );
    expect(candidateDisposition(requirements)).toBe('ineligible');
    for (const result of ['unknown', 'not-stated'] as const)
      expect(candidateDisposition([{ id: 'one', label: 'Requirement', result }])).toBe(
        'unresolved',
      );
    for (const invalid of [
      [],
      [...requirements, requirements[0]],
      [requirements[0], requirements[0]],
    ])
      expect(() => candidateDisposition(invalid)).toThrow();
  });
  it('counts maximum candidate, gate and retained-slot hosts, including hidden meshes', () => {
    const candidate = { ...base, id: 'candidate-0', label: 'M'.repeat(28), requirements };
    verifyPair(
      createElement(ConstraintCandidateSvg, candidate),
      createElement(ConstraintCandidateClay, candidate),
      CONSTRAINT_ASSET_BUDGETS.candidate,
    );
    const gate = { ...base, requirement: requirements[0] };
    verifyPair(
      createElement(RequirementGateSvg, gate),
      createElement(RequirementGateClay, gate),
      CONSTRAINT_ASSET_BUDGETS.requirement,
    );
    const retained = {
      ...base,
      id: 'slot-0',
      label: 'M'.repeat(28),
      disposition: 'ineligible' as const,
    };
    verifyPair(
      createElement(RetainedChoiceSvg, retained),
      createElement(RetainedChoiceClay, retained),
      CONSTRAINT_ASSET_BUDGETS.retained,
    );
    const hidden = { ...candidate, pose: { ...pose, reveal: 0 } };
    verifyPair(
      createElement(ConstraintCandidateSvg, hidden),
      createElement(ConstraintCandidateClay, hidden),
      CONSTRAINT_ASSET_BUDGETS.candidate,
    );
  });
});

describe('temporal facts stay separate from seekable animation', () => {
  it('projects exact durations and qualitative concurrency without rebasing domain facts', () => {
    const original = structuredClone(measured);
    expect(projectTemporalInterval(measured, domain)).toEqual({
      x: 40,
      width: 80,
      schematic: false,
      milestone: false,
    });
    expect(measured).toEqual(original);
    expect(
      projectTemporalInterval(
        { id: 'task-q', label: 'Concurrent', kind: 'qualitative', qualifier: 'schematic overlap' },
        domain,
      ),
    ).toMatchObject({ schematic: true, milestone: false });
    const zero = {
      ...measured,
      kind: 'measured' as const,
      startValue: { numerator: 6, denominator: 1 },
      endValue: { numerator: 6, denominator: 1 },
      basis: 'hours',
    };
    expect(projectTemporalInterval(zero, domain)).toMatchObject({ width: 0, milestone: true });
    expect(html(createElement(TemporalTaskSvg, { ...base, interval: zero, domain }))).toContain(
      'data-milestone="true"',
    );
  });
  it('does not lose a narrow represented domain to floating-point subtraction', () => {
    const lower = { numerator: 999999998, denominator: 999999999 };
    const upper = { numerator: 999999999, denominator: 1000000000 };
    const interval = {
      id: 'task-close',
      label: 'Narrow interval',
      kind: 'measured' as const,
      startValue: lower,
      endValue: upper,
      basis: 'seconds',
    };
    expect(lower.numerator / lower.denominator).toBe(upper.numerator / upper.denominator);
    expect(projectTemporalInterval(interval, [lower, upper])).toEqual({
      x: 0,
      width: 200,
      schematic: false,
      milestone: false,
    });
  });
  it('rejects inverted, incomplete or out-of-domain timing', () => {
    expect(() => projectTemporalInterval(measured, [domain[1], domain[0]])).toThrow();
    expect(() => projectTemporalInterval(measured, [domain[0], domain[0]])).toThrow();
    expect(() =>
      projectTemporalInterval(
        {
          ...measured,
          kind: 'measured',
          startValue: { numerator: 12, denominator: 1 },
          endValue: { numerator: 6, denominator: 1 },
          basis: 'hours',
        },
        domain,
      ),
    ).toThrow();
  });
  it('counts all temporal assemblies and planar precision surfaces', () => {
    const task = { ...base, interval: measured, domain };
    verifyPair(
      createElement(TemporalTaskSvg, task),
      createElement(TemporalTaskClay, task),
      TEMPORAL_ASSET_BUDGETS.task,
    );
    const deadline = {
      ...base,
      id: 'window-0',
      deadlineLabel: 'Day 5',
      attemptLabel: 'Day 6',
      result: 'expired' as const,
    };
    verifyPair(
      createElement(DeadlineShutterSvg, deadline),
      createElement(DeadlineShutterClay, deadline),
      TEMPORAL_ASSET_BUDGETS.deadline,
    );
    const join = { ...base, id: 'join-0', label: 'Join', result: 'joined' as const };
    verifyPair(
      createElement(TemporalJoinSvg, join),
      createElement(TemporalJoinClay, join),
      TEMPORAL_ASSET_BUDGETS.join,
    );
    const badge = { ...base, id: 'state-0', label: 'Prior state', history: 'retained' as const };
    verifyPair(
      createElement(TemporalStateBadgeSvg, badge),
      createElement(TemporalStateBadgeClay, badge),
      TEMPORAL_ASSET_BUDGETS.state,
    );
  });
  it('retains complete semantic data through chronological, shuffled and repeated seeks', () => {
    const input = structuredClone(measured);
    const saved = new Map<number, string>();
    for (const p of [0, 0.25, 0.75, 1, 0.25, 0, 1]) {
      const framePose = { reveal: p, action: p, response: p, check: p, resolve: p };
      const snapshot = html(
        createElement(TemporalTaskSvg, { ...base, pose: framePose, interval: measured, domain }),
      );
      expect(snapshot).not.toMatch(/NaN|Infinity/);
      if (saved.has(p)) expect(snapshot).toBe(saved.get(p));
      else saved.set(p, snapshot);
      expect(measured).toEqual(input);
    }
  });
});

describe('typed relationships and approval state', () => {
  it('counts maximum containers, cards, approvals and directed condition links', () => {
    const card = { ...base, state: 'excluded' as const, entity: members[0] };
    verifyPair(
      createElement(RelationshipEntitySvg, card),
      createElement(RelationshipEntityClay, card),
      RELATIONSHIP_ASSET_BUDGETS.entity,
    );
    const container = {
      ...base,
      id: 'container-0',
      label: 'M'.repeat(28),
      members,
      completeness: 'complete' as const,
    };
    verifyPair(
      createElement(RelationshipContainerSvg, container),
      createElement(RelationshipContainerClay, container),
      RELATIONSHIP_ASSET_BUDGETS.container,
    );
    const approval = {
      ...base,
      id: 'approval-0',
      ownerLabel: 'Owner',
      approverLabel: 'Approver',
      authorization: 'granted' as const,
    };
    verifyPair(
      createElement(ApprovalStationSvg, approval),
      createElement(ApprovalStationClay, approval),
      RELATIONSHIP_ASSET_BUDGETS.approval,
    );
    const relation: TypedRelationshipProps = {
      ...base,
      id: 'link-0',
      role: 'dependency',
      from: [-0.5, 0, 0],
      to: [0.5, 0, 0],
      condition: 'When ready',
    };
    verifyPair(
      createElement(TypedRelationshipSvg, relation),
      createElement(TypedRelationshipClay, relation),
      RELATIONSHIP_ASSET_BUDGETS.relation,
    );
  });
  it('does not convert membership or correspondence into payment/time-order arrows', () => {
    for (const role of ['membership', 'correspondence'] as const) {
      const relation: TypedRelationshipProps = {
        ...base,
        id: `link-${role}`,
        role,
        from: [0, 0, 0],
        to: [1, 1, 0],
      };
      expect(relationshipSegment(relation).directed).toBe(false);
      expect(html(createElement(TypedRelationshipSvg, relation))).toContain(`data-role="${role}"`);
    }
    expect(() =>
      relationshipSegment({
        ...base,
        id: 'same',
        role: 'dependency',
        from: [0, 0, 0],
        to: [0, 0, 0],
      }),
    ).toThrow();
  });
  it('keeps denied, pending, unknown and not-stated authorizations distinct', () => {
    for (const authorization of ['denied', 'pending', 'unknown', 'not-stated'] as const) {
      const markup = html(
        createElement(ApprovalStationSvg, {
          ...base,
          id: 'approval',
          ownerLabel: 'Owner',
          approverLabel: 'Approver',
          authorization,
        }),
      );
      expect(markup).toContain(`data-authorization="${authorization}"`);
      expect(markup).toContain(authorization);
    }
    expect(() =>
      html(
        createElement(RelationshipContainerSvg, {
          ...base,
          id: 'group',
          label: 'Group',
          members,
          completeness: 'unknown',
        }),
      ),
    ).toThrow();
  });
});
