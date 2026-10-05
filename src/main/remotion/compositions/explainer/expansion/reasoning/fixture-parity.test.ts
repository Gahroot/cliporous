import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { reasoningFixtureRows } from '../../../../../../../scripts/explainer-stills/reasoning-fixtures';
import { parseExpansionReasoning } from '../../../../../ai/explainer/expansion-reasoning-contract';
import { makeParseContext } from '../../../../../ai/explainer/kind-spec';
import { ReasoningArgumentView } from './argument-Scene';
import { ReasoningInformationView } from './information-Scene';
import { ReasoningScene } from './Scene';
import { ReasoningScopeView } from './scope-Scene';
import { ReasoningTraceView } from './trace-Scene';

const rows = reasoningFixtureRows();
describe('reasoning authored render inputs, not native render evidence', () => {
  it('committed fixture data is exact output of the complete-source parser builder', () => {
    expect(
      JSON.parse(
        readFileSync('scripts/explainer-stills/fixtures/expansion/reasoning.json', 'utf8'),
      ),
    ).toEqual(rows);
    expect(rows).toHaveLength(16);
    expect(rows.map((r) => `${r.scene.storyId}/${r.scene.visualMode}`)).toEqual(
      ['01', '02', '03', '04', '05', '06', '07', '08'].flatMap((id) => [
        `${id}/diagram`,
        `${id}/hybrid`,
      ]),
    );
  });
  for (const row of rows) {
    it(`${row.name}: exact source, time, mode and actual local view dispatch`, () => {
      const window = {
        startWord: 0,
        endWord: row.sourceWords.length - 1,
        startTime: 0,
        endTime: row.durationSec,
      };
      const ctx = makeParseContext(row.sourceWords, window);
      expect(parseExpansionReasoning(row.plannerInput, ctx)).toEqual(row.scene);
      expect(ctx.issues).toEqual([]);
      expect(row.sourceWords.map((word) => word.text).join(' ')).toBe(row.sourceText);
      const view = ReasoningScene({ scene: row.scene });
      expect(view.props.scene).toBe(row.scene);
      const id = row.scene.storyId;
      expect(view.type).toBe(
        id === '01' || id === '02'
          ? ReasoningTraceView
          : id === '03' || id === '04'
            ? ReasoningArgumentView
            : id === '05' || id === '06'
              ? ReasoningInformationView
              : ReasoningScopeView,
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
