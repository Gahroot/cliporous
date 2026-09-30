import { unit } from './motion';

export interface NumberValue {
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  countAt: number;
  landAt: number;
}

/** Integer arithmetic preserves decimal places and a monotonic count independent of container motion. */
export function sampleMechanicalNumber(scene: NumberValue, t: number) {
  const decimals = Math.max(0, Math.min(2, Math.trunc(scene.decimals ?? 0)));
  const target = Math.round(Math.abs(scene.value) * 10 ** decimals);
  const p = unit((t - scene.countAt) / Math.max(0.2, scene.landAt - scene.countAt));
  const progress = 1 - (1 - p) ** 3;
  const current = p === 1 ? target : Math.floor(target * progress);
  const places = Math.max(decimals + 1, String(target).length);
  const digits = String(current).padStart(places, '0');
  const chars: { id: string; char: string; place?: number }[] = [];
  for (let i = 0; i < places; i++) {
    const place = places - 1 - i;
    chars.push({ id: `place-${place}`, char: digits[i] ?? '0', place });
    if (place === decimals && decimals > 0) chars.push({ id: 'decimal-point', char: '.' });
    else if (place > decimals && (place - decimals) % 3 === 0)
      chars.push({ id: `group-${place - decimals}`, char: ',' });
  }
  const sign = scene.value < 0 ? '−' : '';
  const text = `${scene.prefix ?? ''}${sign}${chars.map((c) => c.char).join('')}${scene.suffix ?? ''}`;
  return { decimals, target, current, places, progress, chars, sign, text };
}

/** A forward rolling strip approaches the sampled integer; no spring drives a value. */
export function digitTravel(
  current: number,
  target: number,
  place: number,
  progress: number,
): number {
  const divisor = 10 ** place;
  if (progress >= 1) return Math.floor(target / divisor) % 10;
  const integer = Math.floor(current / divisor);
  const remainder = current % divisor;
  const carry =
    place === 0 ? current - Math.floor(current) : Math.max(0, (remainder / divisor - 0.8) / 0.2);
  return (integer % 10) + carry;
}
