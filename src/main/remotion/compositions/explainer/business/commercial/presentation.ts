import { layoutWorkTable, type WorkTable } from '../work/presentation';
import { commercialIdentities } from './poses';
import { COMMERCIAL_LIMITS, type CommercialScene, type ServiceSlotQuantity } from './types';

export const COMMERCIAL_RECIPE_IDS = [
  'OP-17',
  'OP-19',
  'OP-20',
  'OP-21',
  'OP-22',
  'OP-23',
] as const;
export type CommercialRecipeId = (typeof COMMERCIAL_RECIPE_IDS)[number];

export function commercialRecipeId(scene: CommercialScene): CommercialRecipeId {
  switch (scene.preset) {
    case 'back-office':
      return 'OP-17';
    case 'service-slots':
      return 'OP-19';
    case 'service-lifecycle':
      return 'OP-20';
    case 'owner-dependency':
      return 'OP-21';
    case 'service-modules':
      return 'OP-22';
    case 'shared-standard-local-context':
      return 'OP-23';
  }
}
function name(scene: CommercialScene, id: string): string {
  return commercialIdentities(scene).find((entry) => entry.id === id)?.label ?? 'Not stated';
}
function slotCell(quantity: ServiceSlotQuantity | null): string {
  if (!quantity) return 'Not stated';
  return quantity.count === null ? quantity.state : `${quantity.count} (${quantity.state})`;
}
function basisNote(scene: CommercialScene, quantity: ServiceSlotQuantity): string | null {
  const b = quantity.basis;
  return b
    ? `Basis: ${name(scene, b.subjectId)}; ${b.unit}; ${b.population}; ${b.period}; denominator ${b.denominator ?? 'not stated'}`
    : null;
}

/** Concrete factual tables, using the work pack's fixed-font rails; never a programmable graph. */
export function commercialTable(scene: CommercialScene): WorkTable {
  if (scene.kind === 'business-replication')
    return {
      headings: ['Local unit', 'Standard use', 'Local context / state'],
      rows: scene.units.map((unit) => ({
        id: unit.identity.id,
        cells: [
          unit.identity.label,
          unit.standardUse.state,
          `${unit.localDifference.label}: ${unit.localDifference.state}`,
        ],
      })),
      notes: [`Business: ${scene.business.label}`, `Shared standard: ${scene.standard.label}`],
    };
  if (scene.preset === 'back-office')
    return {
      headings: ['Back-office task', 'Service', 'Support state'],
      rows: scene.tasks.map((entry) => ({
        id: entry.task.id,
        cells: [entry.task.label, scene.service.label, entry.state],
      })),
      notes: [`Business: ${scene.business.label}`],
    };
  if (scene.preset === 'service-slots') {
    const notes = [`Business: ${scene.business.label}; service: ${scene.service.label}`];
    for (const quantity of [scene.reserved, scene.used, scene.available]) {
      if (!quantity) continue;
      const note = basisNote(scene, quantity);
      if (note && !notes.includes(note)) notes.push(note);
    }
    return {
      headings: ['Reserved', 'Used', 'Available'],
      rows: [
        {
          id: scene.service.id,
          cells: [slotCell(scene.reserved), slotCell(scene.used), slotCell(scene.available)],
        },
      ],
      notes,
    };
  }
  if (scene.preset === 'service-lifecycle')
    return {
      headings: ['Stage', 'Named artifact', 'State'],
      rows: (['lead', 'booking', 'delivery'] as const).map((role) => ({
        id: `${role}:${scene[role].identity.id}`,
        cells: [role, scene[role].identity.label, scene[role].state],
      })),
      notes: [`Business: ${scene.business.label}; service: ${scene.service.label}`],
    };
  if (scene.preset === 'owner-dependency')
    return {
      headings: ['Founder', 'Task', 'Dependency'],
      rows: [
        {
          id: scene.task.id,
          cells: [scene.founder.label, scene.task.label, scene.dependency.state],
        },
      ],
      notes: [`Business: ${scene.business.label}`],
    };
  const notes = [`Business: ${scene.business.label}; service: ${scene.service.label}`];
  if (scene.repeatedOffering) notes.push(`Repeated offering: ${scene.repeatedOffering.state}`);
  return {
    headings: ['Module / pair', 'Service / module', 'Relationship'],
    rows: [
      ...scene.modules.map((module) => ({
        id: module.id,
        cells: [module.label, scene.service.label, 'member'],
      })),
      ...scene.compatibility.map((entry) => ({
        id: `${entry.leftModuleId}:${entry.rightModuleId}`,
        cells: [name(scene, entry.leftModuleId), name(scene, entry.rightModuleId), entry.state],
      })),
    ],
    notes,
  };
}

export const layoutCommercialTable = layoutWorkTable;
export function commercialPresentationFits(scene: CommercialScene): boolean {
  return layoutCommercialTable(commercialTable(scene)).height <= 478;
}

/** Unresolved/conditional facts are native holds, not extra AI-chosen hold nodes. */
export function commercialContentCounts(scene: CommercialScene): {
  identities: number;
  links: number;
  holds: number;
} {
  let states: readonly string[];
  let links: number;
  if (scene.kind === 'business-replication') {
    states = scene.units.flatMap((unit) => [unit.standardUse.state, unit.localDifference.state]);
    links = 1 + scene.units.length * 3; // business/standard, local membership, standard use, local context
  } else
    switch (scene.preset) {
      case 'back-office':
        states = scene.tasks.map((entry) => entry.state);
        links = scene.tasks.length;
        break;
      case 'service-slots':
        states = [scene.reserved, scene.used, scene.available].flatMap((entry) =>
          entry ? [entry.state] : [],
        );
        links = states.length;
        break;
      case 'service-lifecycle':
        states = [scene.lead.state, scene.booking.state, scene.delivery.state];
        links = 3;
        break;
      case 'owner-dependency':
        states = [scene.dependency.state];
        links = 1;
        break;
      case 'service-modules':
        states = [
          ...scene.compatibility.map((entry) => entry.state),
          ...(scene.repeatedOffering ? [scene.repeatedOffering.state] : []),
        ];
        links =
          1 + scene.modules.length + scene.compatibility.length + (scene.repeatedOffering ? 1 : 0);
        break;
    }
  return {
    identities: commercialIdentities(scene).length,
    links,
    holds: states.filter((state) => ['pending', 'conditional', 'unknown'].includes(state)).length,
  };
}
export function commercialContentFits(scene: CommercialScene): boolean {
  const counts = commercialContentCounts(scene);
  return (
    counts.identities <= COMMERCIAL_LIMITS.entities &&
    counts.links <= COMMERCIAL_LIMITS.sourceLinks &&
    counts.holds <= COMMERCIAL_LIMITS.holds
  );
}
