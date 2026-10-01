import type { CashTimingScene } from '../../remotion/compositions/explainer/business-systems/types';
import { DIAGRAM_LAYOUTS } from '../../remotion/compositions/explainer/diagrams/types';
import type { SceneCue } from '../../remotion/compositions/explainer/types';
import { parseCashTiming } from './cash-timing-contract';

export const cashTimingSpec = {
  kind: 'cash-timing',
  family: 'process',
  layouts: DIAGRAM_LAYOUTS,
  durationSec: [5, 12],
  describe:
    'Profit versus cash or inventory before sales: distinct cost-payment and customer-payment lanes, explicit units, no invented remaining balance.',
  schema:
    '{"kind":"cash-timing","preset":"receivable-gap|inventory-before-sales","visualMode":"diagram","label":"Profit versus cash","subject":"Shop","outcome":"Payment arrives later","evidence":"illustrative","business":{"id":"shop","label":"Shop"},"customer":{"id":"customer","label":"Customer"},"sales":{"minorUnits":10000,"currency":"USD"},"totalCosts":{"minorUnits":7000,"currency":"USD"},"cashPaid":{"minorUnits":7000,"currency":"USD"},"profitMinor":3000,"paidWhen":"today","receivedWhen":"next month","setupWord":0,"actionWord":16,"responseWord":24,"checkWord":34,"resolveWord":40}',
  limits:
    'Title 48, subject 34, actors/lane labels 28, condition 96, outcome 54. Five local source beats; 5–12s with 0.8s final hold. Setup: BUSINESS records sales of AMOUNT CURRENCY; BUSINESS has total costs of AMOUNT CURRENCY. Action: BUSINESS pays AMOUNT CURRENCY in costs/for inventory TIME. Response: CUSTOMER pays AMOUNT CURRENCY to BUSINESS LATER. Check: BUSINESS records profit of AMOUNT CURRENCY. Profit requires complete costs. Inventory may use sales=null and profitMinor=null with customer pays an unstated amount, profit is not stated. Resolve: Payment arrives later / Cash and profit have different timing.',
  triggers: [
    /\b(?:profit|sales|inventory|invoice|receivable)\b.{0,100}\b(?:cash|paid|payment|next month|later)\b/i,
    /\b(?:cash timing|profit versus cash)\b/i,
  ],
  avoid:
    'Not unit margin alone, bankruptcy, unstated opening/closing cash or profit from partial costs.',
  parse: parseCashTiming,
  cues: (scene: CashTimingScene): SceneCue[] => [
    { kind: 'slide', at: scene.actionAt, gain: 0.3 },
    { kind: 'flip', at: scene.responseAt, gain: 0.3 },
  ],
} as const;
