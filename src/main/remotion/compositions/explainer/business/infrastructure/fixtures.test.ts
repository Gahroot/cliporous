import { describe, expect, it } from 'vitest';
import {
  parseCapacityMapScene,
  parseOperatingLineageScene,
} from '../../../../../ai/explainer/business-infrastructure-contract';
import type { Rec } from '../../../../../ai/explainer/kind-spec';
import { diagramPose } from '../../diagrams/motion';
import { businessTextWidth } from '../text-width';
import {
  INFRASTRUCTURE_ADDITIONAL_SOURCE_FIXTURES,
  INFRASTRUCTURE_RECIPE_IDS,
  INFRASTRUCTURE_SOURCE_FIXTURES,
  type InfrastructureSourceFixture,
  infrastructureSourceContext,
  infrastructureSourceWindow,
} from './fixtures';
import {
  INFRASTRUCTURE_RAIL,
  infrastructureDetailWindows,
  infrastructureIdentities,
  infrastructureLines,
  infrastructurePageIndex,
  infrastructurePages,
  infrastructurePresentationFits,
  infrastructureReadingStart,
  infrastructureRows,
} from './presentation';
import type { InfrastructureScene } from './types';

const all = [...INFRASTRUCTURE_SOURCE_FIXTURES, ...INFRASTRUCTURE_ADDITIONAL_SOURCE_FIXTURES];
const cases = all.flatMap((fixture) =>
  (fixture.id === 'OP-71' ? (['diagram'] as const) : (['diagram', 'hybrid'] as const)).map(
    (mode) => ({ fixture, mode, name: `${fixture.fixtureId}:${mode}` }),
  ),
);
function parsed(
  fixture: InfrastructureSourceFixture,
  mode: 'diagram' | 'hybrid',
): InfrastructureScene {
  const raw: Rec = { ...fixture.raw, visualMode: mode },
    ctx = infrastructureSourceContext(fixture);
  const scene =
    raw.kind === 'capacity-map'
      ? parseCapacityMapScene(raw, ctx)
      : parseOperatingLineageScene(raw, ctx);
  if (!scene) throw new Error(`${fixture.fixtureId}: ${ctx.issues.join('; ')}`);
  expect(ctx.issues).toEqual([]);
  return scene;
}
describe('infrastructure authored raw fixtures and actual source reading windows', () => {
  it('owns all ten frozen source recipes and distinct scenario identities', () => {
    expect(INFRASTRUCTURE_SOURCE_FIXTURES.map((fixture) => fixture.id)).toEqual(
      INFRASTRUCTURE_RECIPE_IDS,
    );
    expect(new Set(all.map((fixture) => fixture.fixtureId)).size).toBe(all.length);
  });
  it.each(
    cases,
  )('accepts $name in its real full lead-in/tail window without artificial beat contexts', ({
    fixture,
    mode,
  }) => {
    const before = structuredClone(fixture),
      scene = parsed(fixture, mode),
      window = infrastructureSourceWindow(fixture);
    expect(window.endTime - window.startTime).toBeGreaterThanOrEqual(5);
    expect(window.endTime - window.startTime).toBeLessThanOrEqual(12);
    expect(scene.resolveAt).toBe(fixture.words[Number(fixture.raw.resolveWord)].start);
    expect(scene.setupAt).toBeGreaterThanOrEqual(window.startTime + 0.3);
    expect(window.endTime - scene.resolveAt).toBeGreaterThanOrEqual(0.8);
    const beats = [scene.setupAt, scene.actionAt, scene.responseAt, scene.checkAt, scene.resolveAt];
    expect([...beats].sort((a, b) => a - b)).toEqual(beats);
    expect(new Set(beats).size).toBe(5);
    expect(scene.visualMode).toBe(mode);
    expect(infrastructureIdentities(scene).length).toBeLessThanOrEqual(8);
    expect(fixture).toEqual(before);
  });
  it.each(
    cases,
  )('retains every complete fixed-font page of $name for >=1.5s at actual full diagram visibility', ({
    fixture,
    mode,
  }) => {
    const scene = parsed(fixture, mode),
      rows = infrastructureRows(scene),
      windows = infrastructureDetailWindows(scene);
    expect(windows.flatMap((w) => w.page.rows)).toEqual(rows);
    expect(infrastructurePresentationFits(scene, infrastructureSourceWindow(fixture).endTime)).toBe(
      true,
    );
    windows.forEach((window, index) => {
      expect(window.end - window.start).toBeGreaterThanOrEqual(1.5);
      expect(window.page.lines).toBeLessThanOrEqual(INFRASTRUCTURE_RAIL.bodyLines);
      for (const t of [window.start, (window.start + window.end) / 2, window.end - 1e-8]) {
        const pose = diagramPose(t, scene);
        expect(pose.setup).toBe(1);
        if (mode === 'hybrid') expect(pose.diagramOpacity).toBe(1);
        expect(infrastructurePageIndex(scene, t)).toBe(index);
      }
      for (const row of window.page.rows)
        for (const text of [row.text, `${row.label} · ${row.state}`]) {
          const lines = infrastructureLines(text);
          expect(lines.join(' ')).toBe(text.trim().replace(/\s+/gu, ' '));
          for (const line of lines) expect(businessTextWidth(line, 24)).toBeLessThanOrEqual(904);
        }
    });
    expect(infrastructurePageIndex(scene, scene.resolveAt)).toBe(windows.length - 1);
    expect(infrastructurePageIndex(scene, infrastructureSourceWindow(fixture).endTime)).toBe(
      windows.length - 1,
    );
  });
  it.each(
    INFRASTRUCTURE_SOURCE_FIXTURES.filter((fixture) => fixture.id !== 'OP-71'),
  )('$id modes preserve exactly identical facts and beats', (fixture) => {
    const diagram = parsed(fixture, 'diagram'),
      hybrid = parsed(fixture, 'hybrid');
    expect({ ...diagram, visualMode: 'hybrid' }).toEqual(hybrid);
    expect(infrastructureRows(diagram)).toEqual(infrastructureRows(hybrid));
  });
  it('accepts maximum source-built eight named resources/identities and 28 wide glyphs with natural widths', () => {
    for (const fixture of INFRASTRUCTURE_ADDITIONAL_SOURCE_FIXTURES.filter(
      (f) => f.fixtureId === 'OP-63:source-stated:7' || f.fixtureId === 'OP-72:sequential:6',
    )) {
      const scene = parsed(fixture, 'hybrid');
      expect(infrastructureIdentities(scene)).toHaveLength(8);
      expect(infrastructurePages(scene).length).toBeLessThanOrEqual(4);
    }
    const fixture = INFRASTRUCTURE_ADDITIONAL_SOURCE_FIXTURES.find(
      (f) => f.fixtureId === 'OP-68:source-stated:wide',
    );
    if (!fixture) throw new Error('Missing source-built maximum wide label');
    const scene = parsed(fixture, 'hybrid');
    expect(infrastructureRows(scene).some((row) => row.text.includes('W'.repeat(28)))).toBe(true);
    expect(infrastructurePresentationFits(scene, infrastructureSourceWindow(fixture).endTime)).toBe(
      true,
    );
  });
  it('rejects insufficient real time, insufficient final hold and widest-token overflow without truncation', () => {
    const fixture = INFRASTRUCTURE_SOURCE_FIXTURES[0];
    if (!fixture) throw new Error('Missing capacity source');
    const scene = parsed(fixture, 'hybrid');
    expect(infrastructurePresentationFits(scene, scene.resolveAt + 0.79)).toBe(false);
    expect(
      infrastructurePresentationFits(
        {
          ...scene,
          resolveAt:
            infrastructureReadingStart(scene) + infrastructurePages(scene).length * 1.5 - 0.01,
        },
        infrastructureSourceWindow(fixture).endTime,
      ),
    ).toBe(false);
    if (scene.preset !== 'installed-used-reserved') throw new Error('Missing installed scene');
    expect(
      infrastructurePresentationFits(
        { ...scene, resource: { ...scene.resource, label: 'W'.repeat(80) } },
        infrastructureSourceWindow(fixture).endTime,
      ),
    ).toBe(false);
  });
});
