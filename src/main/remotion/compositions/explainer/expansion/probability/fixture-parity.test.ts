import * as fs from 'node:fs';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { probabilityFixtureRows } from '../../../../../../../scripts/explainer-stills/probability-fixtures';
import { parseExpansionProbability } from '../../../../../ai/explainer/expansion-probability-contract';
import { makeParseContext } from '../../../../../ai/explainer/kind-spec';
import { ProbabilityBaseUpdateView } from './base-update-Scene';
import { ConditioningSamplingView } from './conditioning-sampling-Scene';
import { RiskCalibrationView } from './risk-calibration-Scene';
import { ProbabilityScene } from './Scene';
import { VariationRangeView } from './variation-range-Scene';

vi.mock('node:fs', { spy: true });
const rows = probabilityFixtureRows();
describe('probability authored render inputs, not native render evidence', () => {
  it('persisted render fixtures equal the real complete-source parser output', () => {
    expect(
      JSON.parse(
        readFileSync('scripts/explainer-stills/fixtures/expansion/probability.json', 'utf8'),
      ),
    ).toEqual(rows);
    expect(rows).toHaveLength(16);
    expect(rows.map((row) => `${row.scene.storyId}/${row.scene.visualMode}`)).toEqual(
      ['09', '10', '11', '12', '13', '14', '15', '16'].flatMap((id) => [
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
  for (const malformed of ['source-text', 'word-shape'] as const) {
    it(`rejects malformed authored ${malformed} before planning/render data is constructed`, () => {
      const packet = JSON.parse(
        readFileSync(
          'scripts/explainer-stills/fixtures/expansion/probability/base-update.source.json',
          'utf8',
        ),
      );
      if (malformed === 'source-text') packet.stories[0].sourceText = 'A different transcript.';
      else packet.stories[0].words[0].start = '0.25';
      const read = vi.mocked(fs.readFileSync).mockReturnValueOnce(JSON.stringify(packet));
      try {
        expect(() => probabilityFixtureRows()).toThrow(
          'Malformed authored probability source seed',
        );
      } finally {
        read.mockRestore();
      }
    });
  }
  for (const row of rows) {
    it(`${row.name}: source/time/mode parity and actual local view dispatch`, () => {
      const window = {
        startWord: 0,
        endWord: row.sourceWords.length - 1,
        startTime: 0,
        endTime: row.durationSec,
      };
      const ctx = makeParseContext(row.sourceWords, window);
      expect(parseExpansionProbability(row.plannerInput, ctx)).toEqual(row.scene);
      expect(ctx.issues).toEqual([]);
      expect(row.sourceWords.map((word) => word.text).join(' ')).toBe(row.sourceText);
      const view = ProbabilityScene({ scene: row.scene });
      expect(view.props.scene).toBe(row.scene);
      expect(typeof view.type).toBe('function');
      const id = row.scene.storyId;
      expect(view.type).toBe(
        id === '09' || id === '10'
          ? ProbabilityBaseUpdateView
          : id === '11' || id === '12'
            ? ConditioningSamplingView
            : id === '13' || id === '14'
              ? VariationRangeView
              : RiskCalibrationView,
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
