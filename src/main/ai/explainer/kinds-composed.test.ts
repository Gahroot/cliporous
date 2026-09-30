import { describe, expect, it } from 'vitest';
import {
  EXPLODED_TARGETS,
  EXPLODED_TEMPLATES,
  RELAY_PRESETS,
} from '../../remotion/compositions/explainer/mechanisms/composed-types';
import { makeParseContext, type Rec } from './kind-spec';
import { explodedViewSpec, relaySpec, synchronizationSpec } from './kinds-composed';

const RELAY_SOURCE = {
  unlock: 'The key enters and turns, the lock releases, then the door opens.',
  nurture: 'The watering can tilts and pours water onto the soil, then the sprout grows.',
  'attract-process':
    'The magnet pulls the metal onto the conveyor and the parcel closes around the workpiece.',
  'power-insight':
    'The battery supplies power to the chip, the chip activates, then the bulb lights.',
  'complete-system':
    'The missing puzzle piece seats, the connection becomes active, and the gears turn.',
  'idea-process-result':
    'The idea lights the bulb, the gears process it, then the conveyor delivers the parcel.',
} as const;
const LABELS = {
  unlock: 'key',
  nurture: 'watering can',
  'attract-process': 'magnet',
  'power-insight': 'battery',
  'complete-system': 'puzzle piece',
  'idea-process-result': 'idea',
} as const;
const SYNC_SOURCE =
  'The belts are out of sync. A metronome sets the shared rhythm, they align, then the envelope passes to the receiver.';
function context(text: string) {
  const tokens = text.split(/\s+/);
  const indexes = [
    0,
    Math.floor((tokens.length - 1) / 3),
    Math.floor((2 * (tokens.length - 1)) / 3),
    tokens.length - 1,
  ];
  const times = [10.35, 11.5, 12.65, 14.5];
  const words = tokens.map((text, i) => {
    const interval = i <= indexes[1] ? 0 : i <= indexes[2] ? 1 : 2;
    const u = (i - indexes[interval]) / (indexes[interval + 1] - indexes[interval]);
    const start = times[interval] + u * (times[interval + 1] - times[interval]);
    return { text, start, end: start + 0.025 };
  });
  return {
    ctx: makeParseContext(words, {
      startWord: 0,
      endWord: words.length - 1,
      startTime: 10,
      endTime: 16.2,
    }),
    indexes,
  };
}
function relay(preset: (typeof RELAY_PRESETS)[number], text: string = RELAY_SOURCE[preset]) {
  const {
    ctx,
    indexes: [sourceWord, transferWord, receiveWord, outcomeWord],
  } = context(text);
  return {
    ctx,
    raw: {
      preset,
      label: LABELS[preset],
      sourceWord,
      transferWord,
      receiveWord,
      outcomeWord,
    } as Rec,
  };
}
function sync(text = SYNC_SOURCE) {
  const {
    ctx,
    indexes: [disagreeWord, rhythmWord, alignWord, transferWord],
  } = context(text);
  return {
    ctx,
    raw: { label: 'shared rhythm', disagreeWord, rhythmWord, alignWord, transferWord } as Rec,
  };
}
function explode(template: (typeof EXPLODED_TEMPLATES)[number], target: string) {
  const text = `The ${template} assembly starts together, then separates into parts. We explain the ${target} detail and reassemble it.`;
  const {
    ctx,
    indexes: [assembleWord, separateWord, explainWord, returnWord],
  } = context(text);
  return {
    ctx,
    raw: {
      template,
      target,
      label: `${template} assembly`,
      detailLabel: target,
      assembleWord,
      separateWord,
      explainWord,
      returnWord,
    } as Rec,
  };
}

describe('composed source-grounded strict parsers', () => {
  it.each(RELAY_PRESETS)('accepts the complete %s causal chain with absolute times', (preset) => {
    const { raw, ctx } = relay(preset);
    expect(relaySpec.parse(raw, ctx)).toEqual({
      kind: 'relay',
      preset,
      label: LABELS[preset],
      sourceAt: 10.35,
      transferAt: 11.5,
      receiveAt: 12.65,
      outcomeAt: 14.5,
    });
    expect(ctx.issues).toEqual([]);
  });
  it('accepts explicit synchronization and each authored template/target', () => {
    const s = sync();
    expect(synchronizationSpec.parse(s.raw, s.ctx)?.alignAt).toBe(12.65);
    for (const template of EXPLODED_TEMPLATES)
      for (const target of EXPLODED_TARGETS[template]) {
        const e = explode(template, target);
        expect(explodedViewSpec.parse(e.raw, e.ctx)).toMatchObject({
          template,
          target,
          detailLabel: target,
          returnAt: 14.5,
        });
      }
  });
  it.each(RELAY_PRESETS)('rejects invented, negated and hypothetical %s outcomes', (preset) => {
    for (const text of [`Never: ${RELAY_SOURCE[preset]}`, `If ${RELAY_SOURCE[preset]}`]) {
      const c = relay(preset, text);
      expect(relaySpec.parse(c.raw, c.ctx)).toBeNull();
      expect(c.ctx.issues.length).toBeGreaterThan(0);
    }
    const c = relay(preset);
    expect(relaySpec.parse({ ...c.raw, label: 'Invented 99% success' }, c.ctx)).toBeNull();
  });
  it.each([
    'preset',
    'label',
    'sourceWord',
    'transferWord',
    'receiveWord',
    'outcomeWord',
  ])('rejects missing relay %s', (field) => {
    const c = relay('unlock');
    delete c.raw[field];
    expect(relaySpec.parse(c.raw, c.ctx)).toBeNull();
  });
  it.each([
    'template',
    'target',
    'label',
    'detailLabel',
    'assembleWord',
    'separateWord',
    'explainWord',
    'returnWord',
  ])('rejects missing exploded %s', (field) => {
    const c = explode('parcel', 'lid');
    delete c.raw[field];
    expect(explodedViewSpec.parse(c.raw, c.ctx)).toBeNull();
  });
  it.each([
    'label',
    'disagreeWord',
    'rhythmWord',
    'alignWord',
    'transferWord',
  ])('rejects missing synchronization %s', (field) => {
    const c = sync();
    delete c.raw[field];
    expect(synchronizationSpec.parse(c.raw, c.ctx)).toBeNull();
  });
  it('rejects invalid options, nonfinite/fractional/string/out-of-window beats, reversed order and insufficient holds', () => {
    for (const value of [NaN, Infinity, -1, 1.5, '1', 999, {}, []]) {
      const c = relay('unlock');
      expect(relaySpec.parse({ ...c.raw, transferWord: value }, c.ctx)).toBeNull();
    }
    for (const preset of ['unknown', [], 2, null]) {
      const c = relay('unlock');
      expect(relaySpec.parse({ ...c.raw, preset }, c.ctx)).toBeNull();
    }
    const c = relay('unlock');
    expect(relaySpec.parse({ ...c.raw, receiveWord: c.raw.transferWord }, c.ctx)).toBeNull();
    expect(relaySpec.parse({ ...c.raw, receiveWord: 1 }, c.ctx)).toBeNull();
    c.ctx.win.endTime = 14.8;
    expect(relaySpec.parse(c.raw, c.ctx)).toBeNull();
    const e = explode('parcel', 'lid');
    expect(explodedViewSpec.parse({ ...e.raw, target: 'chip' }, e.ctx)).toBeNull();
    expect(explodedViewSpec.parse({ ...e.raw, template: 'phone' }, e.ctx)).toBeNull();
    expect(explodedViewSpec.parse({ ...e.raw, detailLabel: 'assembly' }, e.ctx)).toBeNull();
  });
  it('rejects compressed phases, nonfinite source timestamps and short/long windows', () => {
    const c = relay('unlock');
    const word = c.ctx.words[c.raw.transferWord as number];
    word.start = 10.5;
    expect(relaySpec.parse(c.raw, c.ctx)).toBeNull();
    word.start = NaN;
    expect(relaySpec.parse(c.raw, c.ctx)).toBeNull();
    for (const duration of [2, 9, Infinity]) {
      const s = sync();
      s.ctx.win.endTime = s.ctx.win.startTime + duration;
      expect(synchronizationSpec.parse(s.raw, s.ctx)).toBeNull();
    }
  });
  it('rejects unrelated actors/relations and bounds serialized output', () => {
    const c = relay(
      'unlock',
      'A key enters the room, a clock releases a sound, and our front door is blue.',
    );
    expect(relaySpec.parse(c.raw, c.ctx)).toBeNull();
    const s = sync(
      'The metronome is a musical instrument and shared rhythm is important when playing music together.',
    );
    expect(synchronizationSpec.parse(s.raw, s.ctx)).toBeNull();
    const valid = relay('nurture');
    const parsed = relaySpec.parse(
      { ...valid.raw, arbitraryMesh: 'x'.repeat(10000), count: 1e99 },
      valid.ctx,
    );
    expect(parsed).not.toBeNull();
    expect(parsed).toEqual(relaySpec.parse(valid.raw, valid.ctx));
    expect(JSON.stringify(parsed).length).toBeLessThan(250);
  });
});
