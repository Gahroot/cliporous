import type React from 'react';
import { useStage } from '../stage';
import type { SymbolRole } from './types';

/** Project-authored, fixed semantic silhouettes. No model-provided path data. */
export function SemanticSymbol({
  symbolRole,
  x = 0,
  y = 0,
  size = 64,
}: {
  symbolRole: SymbolRole;
  x?: number;
  y?: number;
  size?: number;
}): React.ReactElement {
  const S = useStage();
  const shapes: Record<SymbolRole, React.ReactNode> = {
    account: (
      <>
        <rect x="7" y="19" width="50" height="36" rx="7" />
        <path d="M14 19V11h36v8M7 34h50M41 41h9" />
      </>
    ),
    investor: (
      <>
        <circle cx="32" cy="17" r="10" />
        <path d="M10 56v-8a22 22 0 0 1 44 0v8Z" />
      </>
    ),
    company: (
      <>
        <path d="M9 56V20l23-12 23 12v36ZM24 56V41h16v15M18 28h8m12 0h8" />
      </>
    ),
    share: (
      <>
        <rect x="8" y="11" width="48" height="42" rx="4" />
        <path d="M8 32h48M32 11v42" />
      </>
    ),
    invoice: (
      <>
        <path d="M14 7h29l9 10v40l-10-5-10 5-9-5-9 5ZM43 7v12h9M23 28h20M23 38h15" />
      </>
    ),
    holding: (
      <>
        <path d="M7 22h50v34H7ZM14 8h36v14M7 35h50M27 30h10v10H27Z" />
      </>
    ),
    model: (
      <>
        <rect x="14" y="14" width="36" height="36" rx="9" />
        <path d="M25 4v10m14-10v10M25 50v10m14-10v10M4 25h10M4 39h10m36-14h10M50 39h10" />
        <circle cx="32" cy="32" r="8" />
      </>
    ),
    token: (
      <>
        <rect x="7" y="13" width="50" height="38" rx="8" />
        <path d="M22 23h20M32 23v19" />
      </>
    ),
    task: (
      <>
        <rect x="12" y="9" width="40" height="48" rx="4" />
        <path d="m20 27 5 5 10-12M20 43h23" />
      </>
    ),
    clock: (
      <>
        <circle cx="32" cy="32" r="25" />
        <path d="M32 15v19l13 8" />
      </>
    ),
    evidence: (
      <>
        <path d="M12 6h30l10 10v42H12ZM42 6v12h10m-30 7h20M22 34h20m-20 9h13" />
      </>
    ),
  };
  return (
    <g
      transform={`translate(${x - size / 2} ${y - size / 2}) scale(${size / 64})`}
      fill={S.cardRaised}
      stroke={S.text}
      strokeWidth={3.5}
      strokeLinejoin="round"
      strokeLinecap="round"
    >
      {shapes[symbolRole]}
    </g>
  );
}
