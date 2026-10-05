import type { BusinessIdentityRole } from '../../../shared/business-explanation-source';
import type { WordTimestamp } from '../../../shared/types';
import { capitalIdentities } from '../../remotion/compositions/explainer/business/capital/types';
import { commercialIdentities } from '../../remotion/compositions/explainer/business/commercial/poses';
import { decisionIdentities } from '../../remotion/compositions/explainer/business/decisions/presentation';
import { economicsIdentities } from '../../remotion/compositions/explainer/business/economics/identities';
import { infrastructureIdentities } from '../../remotion/compositions/explainer/business/infrastructure/presentation';
import { marketsIdentities } from '../../remotion/compositions/explainer/business/markets/presentation';
import type { BusinessIdentity } from '../../remotion/compositions/explainer/business/types';
import { workIdentities } from '../../remotion/compositions/explainer/business/work/identities';
import type { AgentWorkflowScene } from '../../remotion/compositions/explainer/technology/types';
import type { ExplainerScene } from '../../remotion/compositions/explainer/types';

export interface ValidatedBusinessIdentity {
  readonly identity: BusinessIdentity;
  readonly origin: 'native' | 'semantic-slot';
  /** Roles come from concrete parsed facts, never the spelling of a label or an ID. */
  readonly roles: readonly BusinessIdentityRole[];
  readonly version?: string;
}
export const APPROVAL_GATE_IDENTITY_SLOTS = ['agent', 'human-approver', 'task', 'tool'] as const;
function approvalGateIdentities(
  scene: AgentWorkflowScene,
  source: { choices: Readonly<Record<string, unknown>>; words: readonly WordTimestamp[] },
): ValidatedBusinessIdentity[] {
  const { choices, words } = source;
  const selector = (key: string): number => {
    const value = choices[key];
    if (
      typeof value !== 'number' ||
      !Number.isSafeInteger(value) ||
      value < 0 ||
      value >= words.length
    )
      throw new Error('Invalid approval source selector');
    return value;
  };
  const setup = selector('setupWord'),
    action = selector('actionWord'),
    response = selector('responseWord'),
    check = selector('checkWord'),
    resolve = selector('resolveWord');
  const escapePattern = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  // Match exactly one complete positive native clause in its real source phase.
  const locate = (from: number, to: number, pattern: RegExp) => {
    const matches: { fromWord: number; toWord: number; text: string; match: RegExpMatchArray }[] =
      [];
    let first = from;
    for (let last = from; last <= to; last++)
      if (/[.!?;]$/u.test(words[last].text)) {
        const text = words
            .slice(first, last + 1)
            .map((word) => word.text)
            .join(' '),
          match = text.match(pattern);
        if (match && (first === 0 || /[.!?;]$/u.test(words[first - 1].text)))
          matches.push({ fromWord: first, toWord: last, text, match });
        first = last + 1;
      }
    if (matches.length !== 1)
      throw new Error('Approval role slot requires exactly one complete supported local clause');
    return matches[0];
  };
  const receives = locate(
    setup,
    action - 1,
    new RegExp(
      `^(?:The )?(Agent) (?:gets?|got|receives?|received|takes?|took) (?:a |the |that )?${escapePattern(scene.subject)}[.!?;]$`,
      'iu',
    ),
  );
  const calls = locate(
    action,
    response - 1,
    new RegExp(
      `^(?:The )?Agent (?:calls?|called|invokes?|invoked) (?:the |a )?${escapePattern(scene.toolLabel)}[.!?;]$`,
      'iu',
    ),
  );
  const grant = locate(
    check,
    resolve - 1,
    /^(?:The )?(Human|Person|Reviewer) (?:approves?|approved) (?:the |that )?(?:task|result)[.!?;]$/iu,
  );
  const identity = (
    id: string,
    label: string,
    clause: { fromWord: number; toWord: number },
  ): BusinessIdentity => ({
    id,
    label,
    source: { fromWord: clause.fromWord, toWord: clause.toWord },
  });
  return [
    {
      identity: identity('agent', receives.match[1], receives),
      roles: ['actor'],
      origin: 'semantic-slot',
    },
    {
      identity: identity('human-approver', grant.match[1], grant),
      roles: ['actor'],
      origin: 'semantic-slot',
    },
    {
      identity: identity('task', scene.subject, receives),
      roles: ['subject', 'task'],
      origin: 'semantic-slot',
    },
    {
      identity: identity('tool', scene.toolLabel, calls),
      roles: ['asset'],
      origin: 'semantic-slot',
    },
  ];
}
/** Explicit vocabulary projection only. No arbitrary-property traversal or inferred ownership. */
export function businessExplanationIdentities(
  scene: ExplainerScene,
  source?: { choices: Readonly<Record<string, unknown>>; words: readonly WordTimestamp[] },
): ValidatedBusinessIdentity[] {
  const result: ValidatedBusinessIdentity[] = [];
  let expected: readonly BusinessIdentity[] | undefined;
  const add = (
    identity: BusinessIdentity,
    role: BusinessIdentityRole,
    version?: string,
    origin: ValidatedBusinessIdentity['origin'] = 'native',
  ) => {
    const index = result.findIndex((entry) => entry.identity.id === identity.id);
    if (index < 0)
      result.push({
        identity,
        roles: [role],
        origin,
        ...(version === undefined ? {} : { version }),
      });
    else {
      const prior = result[index];
      if (
        prior.identity.label !== identity.label ||
        prior.identity.source.fromWord !== identity.source.fromWord ||
        prior.identity.source.toWord !== identity.source.toWord ||
        prior.version !== version ||
        prior.origin !== origin
      )
        throw new Error('Conflicting concrete identity evidence');
      result[index] = { ...prior, roles: [...new Set([...prior.roles, role])] };
    }
  };
  const many = (identities: readonly BusinessIdentity[], role: BusinessIdentityRole) => {
    for (const identity of identities) add(identity, role);
  };
  switch (scene.kind) {
    case 'task-map':
      expected = workIdentities(scene);
      many(scene.actors, 'actor');
      many(scene.tasks, 'task');
      if (scene.preset === 'task-split') add(scene.job, 'subject');
      break;
    case 'coordination-map':
      expected = workIdentities(scene);
      many(scene.tasks, 'task');
      if (scene.preset === 'supervised-fanout') {
        add(scene.supervisor, 'actor');
        many(scene.delegates, 'actor');
      } else {
        many(scene.actors, 'actor');
        if (scene.preset === 'approval-load') add(scene.queue.identity, 'claim');
      }
      break;
    case 'work-redesign':
      expected = workIdentities(scene);
      if (scene.preset === 'redeployment') {
        add(scene.worker, 'actor');
        many(scene.beforeTasks, 'task');
        many(scene.afterTasks, 'task');
      } else {
        add(scene.preset === 'expertise-transfer' ? scene.expert : scene.owner, 'actor');
        many([scene.recorder, scene.receiver, scene.approver], 'actor');
        add(scene.task, 'task');
        add(scene.record, 'asset');
        add(scene.playbook.identity, 'asset', scene.playbook.version);
      }
      break;
    case 'delegation-scope':
      add(scene.actor, 'actor');
      if (scene.preset === 'permissions') {
        for (const permission of scene.permissions) add(permission.action, 'task');
      } else {
        add(scene.action, 'task');
        add(scene.actionCondition, 'claim');
        many(scene.limits, 'claim');
      }
      break;
    case 'authority-handoff':
      many(scene.actors, 'actor');
      add(scene.action, 'task');
      if (scene.preset === 'exception-review') add(scene.exception, 'claim');
      if (scene.preset === 'declared-audit-chain') {
        add(scene.record.identity, 'asset', scene.record.version);
        many(scene.events, 'claim');
      }
      break;
    case 'constraint-check':
      add(scene.actor, 'actor');
      add(scene.action, 'task');
      if (scene.preset === 'conflicting-limits') many(scene.requirements, 'claim');
      else {
        add(scene.policy.identity, 'asset', scene.policy.version);
        many(scene.conditions, 'claim');
      }
      break;
    case 'business-blueprint':
    case 'business-replication': {
      const identities = commercialIdentities(scene);
      add(scene.business, 'subject');
      if (scene.kind === 'business-replication') {
        add(scene.standard, 'asset');
        many(
          scene.units.map((unit) => unit.identity),
          'actor',
        );
      } else if (scene.preset === 'owner-dependency') {
        add(scene.founder, 'actor');
        add(scene.task, 'task');
      } else {
        add(scene.service, 'task');
        if (scene.preset === 'back-office')
          many(
            scene.tasks.map((entry) => entry.task),
            'task',
          );
        if (scene.preset === 'service-lifecycle')
          many([scene.lead.identity, scene.booking.identity, scene.delivery.identity], 'task');
        if (scene.preset === 'service-modules') many(scene.modules, 'asset');
      }
      if (identities.some((identity) => !result.some((entry) => entry.identity.id === identity.id)))
        throw new Error('Incomplete commercial vocabulary');
      break;
    }
    case 'organization-map':
    case 'system-reconciliation':
      add(scene.organization, 'subject');
      if (scene.kind === 'system-reconciliation') {
        add(scene.owner, 'actor');
        for (const system of scene.systems) add(system.identity, 'asset', system.version);
        many(
          scene.records.map((record) => record.identity),
          'claim',
        );
      } else
        switch (scene.preset) {
          case 'federated-units':
            many(scene.units, 'actor');
            many(scene.tasks, 'task');
            break;
          case 'decision-rights':
            many(
              scene.units.map((unit) => unit.identity),
              'actor',
            );
            many(
              scene.rights.map((right) => right.decision),
              'task',
            );
            break;
          case 'rollout-rings':
            add(scene.rollout.identity, 'asset', scene.rollout.version);
            many(
              scene.rings.map((ring) => ring.unit),
              'actor',
            );
            break;
          case 'legacy-boundaries':
            many([scene.legacy, scene.replacement, scene.interface], 'asset');
            break;
          case 'stated-chargeback':
            add(scene.payer, 'actor');
            add(scene.service, 'task');
            many(scene.units, 'actor');
            break;
          case 'declared-tool-boundaries':
            many(scene.units, 'actor');
            many(
              scene.workers.map((worker) => worker.identity),
              'actor',
            );
            many(
              scene.tools.map((tool) => tool.identity),
              'asset',
            );
            break;
        }
      break;
    case 'operating-cost':
    case 'scale-economics':
    case 'value-capture':
      add(scene.business, 'subject');
      add(scene.activity, 'task');
      many(
        economicsIdentities(scene).filter(
          (identity) => identity.id !== scene.business.id && identity.id !== scene.activity.id,
        ),
        'claim',
      );
      break;
    case 'procurement-commitment':
      expected = marketsIdentities(scene);
      many(scene.actors, 'actor');
      add(scene.task, 'task');
      add(scene.item, 'asset');
      many([scene.quote.identity, scene.payment.identity], 'claim');
      break;
    case 'market-dependency':
      expected = marketsIdentities(scene);
      add(scene.business, 'subject');
      switch (scene.preset) {
        case 'channel-concentration':
          many(scene.customerGroups, 'actor');
          many(
            scene.channels.map((channel) => channel.identity),
            'asset',
          );
          break;
        case 'demand-access':
          many([scene.offering, scene.channel], 'asset');
          add(scene.demand, 'claim');
          break;
        case 'migration-constraints':
          many([scene.fromProvider, scene.toProvider], 'actor');
          add(scene.migration.identity, 'task');
          many(
            scene.constraints.map((constraint) => constraint.identity),
            'claim',
          );
          break;
        case 'participation-matching':
          many(
            scene.participants.map((participant) => participant.identity),
            'actor',
          );
          break;
        case 'stated-participation-benefit':
          many(scene.participants, 'actor');
          break;
        case 'differentiated-offering':
          add(scene.comparisonSubject, 'claim');
          many(
            scene.offerings.map((offering) => offering.identity),
            'asset',
          );
          break;
        case 'supplier-distribution-boundaries':
          add(scene.supplier, 'actor');
          many([scene.item, scene.channel], 'asset');
          break;
        case 'complementary-specialists':
          many(
            scene.specialists.map((specialist) => specialist.identity),
            'actor',
          );
          many(
            scene.specialists.map((specialist) => specialist.capability.identity),
            'claim',
          );
          break;
      }
      break;
    case 'fund-lifecycle':
    case 'distribution-waterfall':
    case 'fund-liquidity':
      add(scene.fund, 'subject');
      add(scene.operator, 'actor');
      if (scene.preset === 'source-periods')
        many(
          scene.periods.map((period) => period.identity),
          'claim',
        );
      if (scene.preset === 'stated-priority-tiers')
        many(
          scene.tiers.map((tier) => tier.identity),
          'claim',
        );
      if (scene.preset === 'gross-to-net')
        many(
          scene.costs.map((cost) => cost.identity),
          'claim',
        );
      if (scene.preset === 'periodic-repurchase')
        many(
          scene.requests.map((request) => request.identity),
          'claim',
        );
      break;
    case 'economic-rights':
    case 'capital-structure':
    case 'investment-outcomes':
      expected = capitalIdentities(scene);
      add(scene.company, 'subject');
      if (scene.kind === 'economic-rights') {
        add(scene.holder, 'actor');
        add(scene.claim, 'claim');
      } else if (scene.kind === 'investment-outcomes')
        many(
          scene.outcomes.map((outcome) => outcome.identity),
          'claim',
        );
      else if (scene.preset === 'conditional-rounds') {
        add(scene.holder, 'actor');
        for (const round of scene.rounds)
          add(round.identity.identity, 'claim', round.identity.version);
      } else {
        add(scene.lender, 'actor');
        add(scene.asset, 'asset');
        many(
          scene.obligations.map((obligation) => obligation.identity),
          'claim',
        );
      }
      break;
    case 'capacity-map':
    case 'operating-lineage':
      expected = infrastructureIdentities(scene);
      if (scene.kind === 'capacity-map') {
        add(scene.resource, 'subject');
        add(scene.resource, 'asset');
        switch (scene.preset) {
          case 'physical-readiness':
            add(scene.funding, 'claim');
            many([scene.power, scene.cooling], 'asset');
            break;
          case 'bounded-request-capacity':
            add(scene.task, 'task');
            break;
          case 'resource-states':
            add(scene.cooling, 'asset');
            break;
          case 'declared-processing-scope':
            add(scene.item, 'asset');
            add(scene.boundary, 'claim');
            break;
          case 'end-to-end-periods':
            add(scene.task, 'task');
            many(
              scene.stages.map((stage) => stage.identity),
              'task',
            );
            break;
        }
      } else if (scene.preset === 'provider-transition') {
        add(scene.resource, 'subject');
        add(scene.resource, 'asset');
        many([scene.fromProvider, scene.toProvider], 'actor');
        add(scene.dependency, 'claim');
      } else {
        add(scene.owner, 'subject');
        if (scene.preset === 'evidence-and-missing-information')
          for (const item of scene.items) add(item.entry.identity, 'claim', item.entry.version);
        if (scene.preset === 'versioned-provenance')
          for (const entry of scene.entries) add(entry.identity, 'claim', entry.version);
        if (scene.preset === 'evaluation-periods') add(scene.task, 'task');
      }
      break;
    case 'staged-decision':
      expected = decisionIdentities(scene);
      add(scene.owner, 'subject');
      add(scene.commitment.identity, 'claim', scene.commitment.version);
      add(scene.action, 'task');
      add(scene.gate, 'claim');
      add(scene.approver, 'actor');
      break;
    case 'measurement-frame':
      expected = decisionIdentities(scene);
      add(scene.owner, 'subject');
      if (scene.preset === 'planned-observed') add(scene.task, 'task');
      if (scene.preset === 'firms-functions-workers')
        many(
          scene.frames.map((frame) => frame.identity),
          'claim',
        );
      if (scene.preset === 'original-and-surviving-cohorts')
        many(
          [scene.original.identity, scene.surviving.identity, scene.attrition.identity],
          'claim',
        );
      break;
    case 'uncertainty-album':
      expected = decisionIdentities(scene);
      add(scene.owner, 'subject');
      for (const alternative of scene.alternatives)
        add(alternative.entry.identity, 'claim', alternative.entry.version);
      break;
    case 'portfolio-exposure':
      // Legacy funds/exposure are FinanceActor (no source span). Only additive firm IDs are linkable.
      if (scene.dependencyLens)
        many(
          scene.dependencyLens.firms.map((firm) => firm.identity),
          'asset',
        );
      break;
    case 'possible-futures':
      if (scene.businessAlternatives) {
        add(scene.businessAlternatives.baseline.subject, 'subject');
        add(
          scene.businessAlternatives.baseline.identity,
          'claim',
          scene.businessAlternatives.baseline.revision,
        );
        for (const record of scene.businessAlternatives.records)
          add(record.identity, 'claim', record.revision);
      }
      break;
    case 'agent-workflow':
      if (scene.preset === 'idempotent-retry')
        throw new Error('Unsupported concrete business vocabulary');
      // Code-owned semantic slots, not selected person IDs or label-based equivalence.
      if (!source)
        throw new Error('Approval role slots require their authoritative raw source words');
      for (const slot of approvalGateIdentities(scene, source))
        for (const role of slot.roles) add(slot.identity, role, undefined, 'semantic-slot');
      break;
    default:
      throw new Error('Unsupported concrete business vocabulary');
  }
  if (
    expected?.some(
      (identity) =>
        !result.some(
          (entry) =>
            entry.identity.id === identity.id &&
            entry.identity.label === identity.label &&
            entry.identity.source.fromWord === identity.source.fromWord &&
            entry.identity.source.toWord === identity.source.toWord,
        ),
    )
  )
    throw new Error('Incomplete concrete native identity projection');
  if (
    source &&
    ['task-map', 'coordination-map', 'work-redesign'].includes(scene.kind) &&
    'subject' in scene
  ) {
    const start = source.choices.setupWord,
      end = source.choices.actionWord;
    if (
      typeof start !== 'number' ||
      typeof end !== 'number' ||
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end)
    )
      throw new Error('Missing work subject source window');
    const literal = scene.subject.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'),
      pattern = new RegExp(`^${literal} is (?:a business|a company|an organization)[.!?;]$`, 'iu');
    const matches: BusinessIdentity[] = [];
    let first = start;
    for (let last = start; last < end; last++)
      if (/[.!?;]$/u.test(source.words[last]?.text ?? '')) {
        const text = source.words
          .slice(first, last + 1)
          .map((word) => word.text)
          .join(' ');
        if (
          pattern.test(text) &&
          (first === 0 || /[.!?;]$/u.test(source.words[first - 1]?.text ?? ''))
        )
          matches.push({
            id: 'business-subject',
            label: scene.subject,
            source: { fromWord: first, toWord: last },
          });
        first = last + 1;
      }
    if (matches.length > 1) throw new Error('Ambiguous work business subject source');
    if (matches.length === 1) add(matches[0], 'subject', undefined, 'semantic-slot');
  }
  return result;
}
