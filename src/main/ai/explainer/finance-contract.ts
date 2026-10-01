import {
  CURRENCIES,
  type Currency,
  type FinanceActor,
  type Money,
} from '../../remotion/compositions/explainer/finance/types';
import {
  assertedBusinessClaim,
  businessClaims,
  escaped,
  quantityPattern,
} from './concept-business-operations-contract';
import { hybridPhrase, includesPhrase, onlyFields } from './hybrid-contract';
import { isRec, type ParseContext } from './kind-spec';
import { mechanismIssue } from './mechanism-contract';

export const MAX_MINOR_UNITS = 100_000_000_000;
export function minorUnits(value: unknown): number | null {
  return typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= MAX_MINOR_UNITS
    ? value
    : null;
}
export function shareCount(value: unknown, allowZero = false): number | null {
  return typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= (allowZero ? 0 : 1) &&
    value <= 1_000_000_000
    ? value
    : null;
}
export function currency(value: unknown): Currency | null {
  return CURRENCIES.find((code) => code === value) ?? null;
}
export function parseMoney(value: unknown, ctx: ParseContext): Money | null {
  if (!isRec(value) || !onlyFields(value, ['minorUnits', 'currency'], ctx)) return null;
  const minor = minorUnits(value.minorUnits),
    code = currency(value.currency);
  return minor === null || code === null
    ? mechanismIssue(
        ctx,
        'money requires bounded integer minorUnits and explicit USD/EUR/GBP currency',
      )
    : { minorUnits: minor, currency: code };
}
export function moneyText(money: Money): string {
  return `${(money.minorUnits / 100).toFixed(money.minorUnits % 100 ? 2 : 0)} ${money.currency}`;
}
export function moneyPattern(money: Money): string {
  return quantityPattern(money.minorUnits / 100, money.currency);
}
export function sameCurrency(values: readonly Money[]): boolean {
  return values.length > 0 && values.every((value) => value.currency === values[0].currency);
}
export function conservesMoney(
  inputs: readonly Money[],
  outputs: readonly Money[],
  retained: Money | null,
): boolean {
  const all = [...inputs, ...outputs, ...(retained ? [retained] : [])];
  return (
    sameCurrency(all) &&
    inputs.every((m) => minorUnits(m.minorUnits) !== null) &&
    all.every((m) => minorUnits(m.minorUnits) !== null) &&
    inputs.reduce((n, m) => n + m.minorUnits, 0) ===
      outputs.reduce((n, m) => n + m.minorUnits, 0) + (retained?.minorUnits ?? 0)
  );
}
/** No currency or reporting-period conversion is inferred. */
export function compatibleBasis(
  left: { currency: Currency; period: string },
  right: { currency: Currency; period: string },
): boolean {
  return (
    left.currency === right.currency &&
    left.period.trim().length > 0 &&
    left.period.trim().toLowerCase() === right.period.trim().toLowerCase()
  );
}
export function validOwnership(
  shares: number,
  before: number,
  issued: number,
  after: number,
  beforePercent: number,
  afterPercent: number,
): boolean {
  if (
    [shares, before, after].some((n) => shareCount(n) === null) ||
    shareCount(issued, true) === null ||
    shares > before ||
    after !== before + issued
  )
    return false;
  return [
    [beforePercent, before],
    [afterPercent, after],
  ].every(
    ([percent, total]) =>
      Number.isFinite(percent) &&
      percent >= 0 &&
      percent <= 100 &&
      Math.abs(percent * 100 - Math.round((shares * 10000) / total)) < 1e-7,
  );
}
export function financeActor(raw: unknown, ctx: ParseContext): FinanceActor | null {
  if (!isRec(raw) || !onlyFields(raw, ['id', 'label'], ctx)) return null;
  const label = hybridPhrase(raw.label, ctx, 28);
  return typeof raw.id === 'string' && /^[a-z][a-z0-9-]{0,23}$/.test(raw.id) && label
    ? { id: raw.id, label }
    : mechanismIssue(ctx, 'actor needs a bounded source label and a stable lowercase identifier');
}
export function distinctActors(actors: readonly FinanceActor[]): boolean {
  return (
    new Set(actors.map((a) => a.id)).size === actors.length &&
    new Set(actors.map((a) => a.label.toLowerCase())).size === actors.length
  );
}

/** Anchored clauses bind the actual payer/holder, action, recipient and unit locally. */
export function financeClaim(text: string, pattern: string, condition?: string): boolean {
  const evidence = condition ? text.replace(new RegExp(escaped(condition), 'i'), '') : text;
  const regex = new RegExp(`^${pattern}[.\\s]*$`, 'iu');
  return businessClaims(evidence).some(
    (claim) => assertedBusinessClaim(claim) && regex.test(claim),
  );
}
export function namedIn(text: string, actor: FinanceActor): boolean {
  return includesPhrase(text, actor.label);
}
export function actorPattern(actor: FinanceActor): string {
  return escaped(actor.label);
}
