import type { BusinessIdentity, BusinessWordSpan } from '../types';

export interface CapitalDependencyFirm {
  fundId: string;
  identity: BusinessIdentity;
  holdingSource: BusinessWordSpan;
  driverSource: BusinessWordSpan;
}

/** Opt-in qualitative lens; no weights, probabilities, risk or payout data. */
export interface CapitalDependencyLens {
  version: 1;
  firms: CapitalDependencyFirm[];
  modelSource: BusinessWordSpan;
  finalHoldSeconds: number;
}
