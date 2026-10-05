import * as fs from 'node:fs';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { quantitiesFixtureRows } from '../../../../../../../scripts/explainer-stills/quantities-fixtures';
import { parseExpansionQuantities } from '../../../../../ai/explainer/expansion-quantities-contract';
import { makeParseContext } from '../../../../../ai/explainer/kind-spec';
import { DenominatorPartitionView } from './denominator-partition-Scene';
import { DeviationMultiplesView } from './deviation-multiples-Scene';
import { DistributionView } from './distribution-Scene';
import { RankingCalendarView } from './ranking-calendar-Scene';
import { QuantitiesScene } from './Scene';

vi.mock('node:fs', { spy: true });
const rows = quantitiesFixtureRows();
describe('quantity authored render inputs, not native render evidence', () => {
  it('persisted fixtures equal real complete-source parser output in both modes', () => {
    expect(
      JSON.parse(
        readFileSync('scripts/explainer-stills/fixtures/expansion/quantities.json', 'utf8'),
      ),
    ).toEqual(rows);
    expect(rows).toHaveLength(16);
    expect(rows.map((row) => `${row.scene.storyId}/${row.scene.visualMode}`)).toEqual(
      ['17', '18', '19', '20', '21', '22', '23', '24'].flatMap((id) => [
        `${id}/diagram`,
        `${id}/hybrid`,
      ]),
    );
    for (let i = 0; i < rows.length; i += 2) {
      const { visualMode: diagramMode, ...diagramFacts } = rows[i].scene;
      const { visualMode: hybridMode, ...hybridFacts } = rows[i + 1].scene;
      expect(diagramMode).toBe('diagram');
      expect(hybridMode).toBe('hybrid');
      expect(diagramFacts).toEqual(hybridFacts);
    }
  });
  for (const malformed of [
    'source-text',
    'word-shape',
    'out-of-window',
    'overlap',
    'negative-start',
  ] as const) {
    it(`rejects malformed authored ${malformed} before constructing render data`, () => {
      const packet = JSON.parse(
        readFileSync(
          'scripts/explainer-stills/fixtures/expansion/quantities/distribution.source.json',
          'utf8',
        ),
      );
      if (malformed === 'source-text') packet.stories[0].sourceText = 'A different transcript.';
      else if (malformed === 'word-shape') packet.stories[0].words[0].start = '0.25';
      else if (malformed === 'out-of-window')
        packet.stories[0].words.at(-1).end = packet.stories[0].window.endTime + 1;
      else if (malformed === 'overlap')
        packet.stories[0].words[1].start = packet.stories[0].words[0].start;
      else packet.stories[0].words[0].start = -1e-8;
      const read = vi.mocked(fs.readFileSync).mockReturnValueOnce(JSON.stringify(packet));
      try {
        expect(() => quantitiesFixtureRows()).toThrow('Malformed authored quantities source seed');
      } finally {
        read.mockRestore();
      }
    });
  }
  for (const row of rows) {
    it(`${row.name}: source/time/mode parity and local view dispatch`, () => {
      const ctx = makeParseContext(row.sourceWords, {
        startWord: 0,
        endWord: row.sourceWords.length - 1,
        startTime: 0,
        endTime: row.durationSec,
      });
      expect(parseExpansionQuantities(row.plannerInput, ctx)).toEqual(row.scene);
      expect(ctx.issues).toEqual([]);
      expect(row.sourceWords.map((word) => word.text).join(' ')).toBe(row.sourceText);
      const view = QuantitiesScene({ scene: row.scene });
      expect(view.props.scene).toBe(row.scene);
      const id = row.scene.storyId;
      expect(view.type).toBe(
        id === '17' || id === '18'
          ? DistributionView
          : id === '19' || id === '20'
            ? DenominatorPartitionView
            : id === '21' || id === '22'
              ? RankingCalendarView
              : DeviationMultiplesView,
      );
      expect(row.samples.map((sample) => sample.name)).toEqual([
        'setup',
        'action',
        'intermediate',
        'response',
        'check',
        'resolve',
        'final-hold',
      ]);
      expect(row.samples[0].frame).toBe(Math.ceil(row.scene.setupAt * 30));
      expect(row.samples[5].frame).toBe(Math.ceil(row.scene.resolveAt * 30));
      expect(row.samples[6].frame).toBe(Math.ceil(row.durationSec * 30) - 1);
      expect(row.scene.resolveAt).toBeLessThanOrEqual(row.durationSec - 0.8);
      expect(row.cases).toHaveLength(6);
      expect(row.cases.filter((c) => c.aspect === '9:16').map((c) => c.layout)).toEqual([
        'stack',
        'stack',
        'stack-flipped',
        'stack-flipped',
      ]);
      expect(row.cases.filter((c) => c.aspect === '16:9').map((c) => c.layout)).toEqual([
        'takeover',
        'takeover',
      ]);
      expect(row.cases.every((c) => c.aspect !== '9:16' || c.layout !== 'takeover')).toBe(true);
    });
  }
});
