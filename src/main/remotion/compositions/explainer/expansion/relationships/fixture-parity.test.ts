import * as fs from 'node:fs';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { relationshipsFixtureRows } from '../../../../../../../scripts/explainer-stills/relationships-fixtures';
import { parseExpansionRelationships } from '../../../../../ai/explainer/expansion-relationships-contract';
import { makeParseContext } from '../../../../../ai/explainer/kind-spec';
import { ApprovalDependencyView } from './approval-dependency-Scene';
import { MatrixMatchingView } from './matrix-matching-Scene';
import { RelationshipsScene } from './Scene';
import { SetsTopologyView } from './sets-topology-Scene';
import { TaxonomyRightsView } from './taxonomy-rights-Scene';

vi.mock('node:fs', { spy: true });
const rows = relationshipsFixtureRows();
describe('relationship authored render inputs, not native render evidence', () => {
  it('persisted fixtures equal complete-source parser output with identical facts in both modes', () => {
    expect(
      JSON.parse(
        readFileSync('scripts/explainer-stills/fixtures/expansion/relationships.json', 'utf8'),
      ),
    ).toEqual(rows);
    expect(rows).toHaveLength(16);
    expect(rows.map((row) => `${row.scene.storyId}/${row.scene.visualMode}`)).toEqual(
      ['33', '34', '35', '36', '37', '38', '39', '40'].flatMap((id) => [
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
          'scripts/explainer-stills/fixtures/expansion/relationships/taxonomy-rights.source.json',
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
        expect(() => relationshipsFixtureRows()).toThrow(
          'Malformed authored relationships source seed',
        );
      } finally {
        read.mockRestore();
      }
    });
  }
  for (const row of rows) {
    it(`${row.name}: complete source, timing and presentation declarations retain parity`, () => {
      const ctx = makeParseContext(row.sourceWords, {
        startWord: 0,
        endWord: row.sourceWords.length - 1,
        startTime: 0,
        endTime: row.durationSec,
      });
      expect(parseExpansionRelationships(row.plannerInput, ctx)).toEqual(row.scene);
      expect(ctx.issues).toEqual([]);
      const view = RelationshipsScene({ scene: row.scene });
      expect(view.props.scene).toBe(row.scene);
      const id = row.scene.storyId;
      expect(view.type).toBe(
        id === '33' || id === '34'
          ? TaxonomyRightsView
          : id === '35' || id === '36'
            ? ApprovalDependencyView
            : id === '37' || id === '38'
              ? MatrixMatchingView
              : SetsTopologyView,
      );
      expect(row.sourceWords.map((word) => word.text).join(' ')).toBe(row.sourceText);
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
