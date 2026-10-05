import { capitalMoneyLabel } from '../../remotion/compositions/explainer/business/capital/presentation';
import type { EconomicRightsScene } from '../../remotion/compositions/explainer/business/capital/types';
import type { QuantityBasis } from '../../remotion/compositions/explainer/business/types';

function basisTuple(basis: QuantityBasis): string {
  return `${basis.population}; ${basis.unit}; ${basis.period}; ${basis.denominator ?? 'unknown'}`;
}

/** Native quantities and clauses, arranged once by their actual roles; no inferred relationship. */
export function projectEconomicRights(scene: EconomicRightsScene): {
  headings: string[];
  rows: { id: string; cells: string[] }[];
  notes: string[];
} {
  const company = `Company: ${scene.company.label}`;
  if (scene.preset === 'claim-asset-distinction') {
    return {
      headings: ['Claim / asset', 'Rights / status'],
      rows: [
        {
          id: `${scene.claim.id}:claim`,
          cells: [
            scene.claim.label,
            `${scene.claimEvidence.label}; ${scene.transfer.label}; transfer ${scene.transfer.state}`,
          ],
        },
        {
          id: `${scene.company.id}:liquidity`,
          cells: [
            `${scene.company.label} financial asset`,
            `${scene.liquidity.label}; liquidity ${scene.liquidity.state}; period ${scene.period}`,
          ],
        },
      ],
      notes: [company],
    };
  }
  return {
    headings: ['Role / claim', 'Value / rights', 'Population; unit; period; denominator'],
    rows: [
      {
        id: `${scene.holder.id}:shares`,
        cells: [
          `${scene.holder.label} share holder`,
          `${scene.ownership.shares}/${scene.ownership.total} shares (${scene.ownership.percent}%); ${scene.control.label}`,
          basisTuple(scene.ownership.basis),
        ],
      },
      {
        id: `${scene.claim.id}:claim`,
        cells: [
          scene.claim.label,
          `${scene.claimEvidence.label}; ${scene.priority.label}; priority ${scene.priority.state}`,
          '—',
        ],
      },
      {
        id: `${scene.claim.id}:payout`,
        cells: [
          `${scene.claim.label} payout`,
          capitalMoneyLabel(scene.payout),
          basisTuple(scene.payout.basis),
        ],
      },
    ],
    notes: [company, 'Shares ≠ control ≠ payout.'],
  };
}
