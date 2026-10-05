import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { businessLabelLines, businessTextWidth } from './text-width';

function asciiAdvances(font: Buffer): { units: number; widths: readonly number[] } {
  const tables = new Map<string, number>();
  for (let index = 0; index < font.readUInt16BE(4); index++) {
    const offset = 12 + index * 16;
    tables.set(font.toString('ascii', offset, offset + 4), font.readUInt32BE(offset + 8));
  }
  const head = tables.get('head'),
    hhea = tables.get('hhea'),
    hmtx = tables.get('hmtx'),
    cmap = tables.get('cmap');
  if (head === undefined || hhea === undefined || hmtx === undefined || cmap === undefined)
    throw new Error('Bundled Inter needs its actual TrueType metrics');
  const units = font.readUInt16BE(head + 18),
    metrics = font.readUInt16BE(hhea + 34);
  const mappings: { format: number; offset: number }[] = [];
  for (let index = 0; index < font.readUInt16BE(cmap + 2); index++) {
    const record = cmap + 4 + 8 * index;
    const platform = font.readUInt16BE(record);
    const offset = cmap + font.readUInt32BE(record + 4),
      format = font.readUInt16BE(offset);
    if ((platform === 0 || platform === 3) && (format === 4 || format === 12))
      mappings.push({ format, offset });
  }
  mappings.sort((left, right) => right.format - left.format);
  const mapping = mappings[0];
  if (!mapping) throw new Error('Bundled Inter needs a Unicode character map');
  const glyph = (code: number): number => {
    const offset = mapping.offset;
    if (mapping.format === 12) {
      for (let index = 0; index < font.readUInt32BE(offset + 12); index++) {
        const group = offset + 16 + index * 12;
        const start = font.readUInt32BE(group),
          end = font.readUInt32BE(group + 4);
        if (code >= start && code <= end) return font.readUInt32BE(group + 8) + code - start;
      }
      return 0;
    }
    const count = font.readUInt16BE(offset + 6) / 2;
    for (let index = 0; index < count; index++) {
      const end = font.readUInt16BE(offset + 14 + index * 2);
      const start = font.readUInt16BE(offset + 16 + count * 2 + index * 2);
      if (code < start || code > end) continue;
      const delta = font.readInt16BE(offset + 16 + count * 4 + index * 2);
      const rangeAt = offset + 16 + count * 6 + index * 2,
        range = font.readUInt16BE(rangeAt);
      if (!range) return (code + delta) & 65535;
      const value = font.readUInt16BE(rangeAt + range + (code - start) * 2);
      return value ? (value + delta) & 65535 : 0;
    }
    return 0;
  };
  return {
    units,
    widths: Array.from({ length: 95 }, (_, index) =>
      font.readUInt16BE(hmtx + Math.min(glyph(index + 32), metrics - 1) * 4),
    ),
  };
}

describe('business fixed-font pixel-rail wrapping', () => {
  it.each([
    [
      'resources/fonts/Inter.ttf',
      '29160a80ff49ddcab2c97711247e08b1fab27a484a329ce8b813d820dc559031',
    ],
    [
      'resources/fonts/Inter-Bold.ttf',
      'b37284b5701b6b168dfc770aa1a4ac492106422fd3ba76bc7641e37434e8019c',
    ],
  ])('bounds every actual bundled ASCII advance in %s', (path, hash) => {
    const font = readFileSync(path);
    expect(createHash('sha256').update(font).digest('hex')).toBe(hash);
    const actual = asciiAdvances(font);
    actual.widths.forEach((advance, index) => {
      expect(businessTextWidth(String.fromCodePoint(index + 32), 24)).toBeGreaterThanOrEqual(
        (advance / actual.units) * 1.04 * 24,
      );
    });
  });

  it.each([
    206, 252, 402, 416, 920,
  ])('retains maximum wide labels/conditions/facts at %s pixels', (width) => {
    for (const text of [
      'W'.repeat(128),
      'M'.repeat(64),
      'Unknown conditional worker use remains separate.',
      'January participant denominator 100 workers USD',
      '歧义'.repeat(28),
      '10.25 USD among 2 requests during June',
    ]) {
      const lines = businessLabelLines(text, width, 24);
      expect(lines.length).toBeGreaterThan(0);
      expect(lines.join('').replace(/\s+/gu, '')).toBe(text.replace(/\s+/gu, ''));
      expect(lines.every((line) => businessTextWidth(line, 24) <= width)).toBe(true);
      expect(lines.join('')).not.toContain('…');
    }
  });

  it('retains natural words when they fit instead of chopping by worst-glyph count', () => {
    expect(businessLabelLines('configured', 206, 24)).toEqual(['configured']);
    expect(businessLabelLines('observed use', 252, 24)).toEqual(['observed use']);
    expect(businessLabelLines('', 252, 24)).toEqual([]);
    expect(businessTextWidth('WWWW', 24)).toBeGreaterThan(businessTextWidth('iiii', 24) * 3);
    const text = 'Source identity stays named at every backward seek.';
    expect(businessLabelLines(text, 252, 24)).toEqual(businessLabelLines(text, 252, 24));
  });

  it.each([
    0,
    -1,
    Number.NaN,
    Number.POSITIVE_INFINITY,
  ])('rejects invalid code-owned dimensions %s instead of dropping facts', (value) => {
    expect(() => businessLabelLines('source', value, 24)).toThrow();
    expect(() => businessLabelLines('source', 252, value)).toThrow();
  });
  it('fails an impossible one-glyph rail instead of shrinking text', () => {
    expect(() => businessLabelLines('W', 1, 24)).toThrow();
  });
});
