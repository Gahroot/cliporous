import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { describe, expect, it } from 'vitest';
import { DiagramSurface } from '../../diagrams/DiagramStage';
import { RankingCalendarDiagram } from './ranking-calendar-Diagram';
import { RankingCalendarModels } from './ranking-calendar-models';
import {
  rankingCalendarPages,
  rankingCalendarPose,
  rankingRankDomain,
} from './ranking-calendar-poses';
import { rankingCalendarCases } from './ranking-calendar-test-fixtures';

const colors = { surface: '#fff', text: '#111', accent: '#999', muted: '#555' };
const tags = (s: string, name: string) => [...s.matchAll(new RegExp(`<${name}\\b`, 'g'))].length;

describe('ranking/calendar composed CPU geometry and source ownership (not native/GPU proof)', () => {
  it('pins exact mounted meshes and SVG costs across all accepted maximum pages and hidden beats', () => {
    const maxima = { rankMeshes: 0, calendarMeshes: 0, rankSvg: 0, calendarSvg: 0 };
    for (const scene of rankingCalendarCases()) {
      const pages = rankingCalendarPages(scene);
      const times = [
        -1,
        scene.setupAt,
        scene.actionAt,
        scene.responseAt,
        scene.checkAt,
        scene.resolveAt,
        100,
        ...pages.map(
          (_, i) => scene.setupAt + ((i + 0.5) / pages.length) * (scene.resolveAt - scene.setupAt),
        ),
      ];
      const visited = new Set<number>();
      for (const t of times) {
        const pose = rankingCalendarPose(scene, t);
        visited.add(pose.page);
        const model = renderToStaticMarkup(
          createElement(RankingCalendarModels, { scene, pose, colors }),
        );
        expect(model).not.toMatch(/<(?:instancedMesh|skinnedMesh|primitive|canvas|text)\b/);
        const meshes = tags(model, 'mesh');
        // A retained evidence sheet has seven body meshes plus two state bars.
        // Ranking mounts both supplied states; calendar mounts one sheet and three temporal meshes.
        expect(meshes).toBe(scene.storyId === '21' ? 18 : 12);
        const diagrams = (['diagram', 'hybrid'] as const).map((visualMode) =>
          renderToStaticMarkup(
            createElement(
              DiagramSurface,
              null,
              createElement(RankingCalendarDiagram, {
                scene: { ...scene, visualMode },
                pose,
              }),
            ),
          ),
        );
        expect(diagrams[0]).toBe(diagrams[1]);
        const svg = [...diagrams[0].matchAll(/<(?:svg|g|rect|circle|path|text)\b/g)].length;
        const expected =
          scene.storyId === '21'
            ? 10 +
              rankingRankDomain(scene).length * 2 +
              scene.entities.length * 6 +
              pose.pages[pose.page].lines.length * 2
            : 7 + scene.records.length * 5 + pose.pages[pose.page].lines.length * 2;
        expect(svg).toBe(expected);
        if (scene.storyId === '21') {
          maxima.rankMeshes = Math.max(maxima.rankMeshes, meshes);
          maxima.rankSvg = Math.max(maxima.rankSvg, svg);
        } else {
          maxima.calendarMeshes = Math.max(maxima.calendarMeshes, meshes);
          maxima.calendarSvg = Math.max(maxima.calendarSvg, svg);
        }
      }
      expect(visited.size).toBe(pages.length);
    }
    expect(maxima).toEqual({ rankMeshes: 18, calendarMeshes: 12, rankSvg: 76, calendarSvg: 93 });
  }, 30000);
  it('accounts separately for offline studio meshes/instances and displayed/scratch shadow meshes', () => {
    const room = new RoomEnvironment();
    let meshes = 0,
      instances = 0;
    room.traverse((object) => {
      if ('isMesh' in object && object.isMesh) meshes++;
      if ('isInstancedMesh' in object && object.isInstancedMesh && 'count' in object)
        instances += Number(object.count);
    });
    room.dispose();
    expect({ meshes, instances }).toEqual({ meshes: 8, instances: 6 });
    const shadows = readFileSync('node_modules/@react-three/drei/core/ContactShadows.js', 'utf8');
    expect(shadows.match(/new THREE.Mesh\(planeGeometry\)/g)).toHaveLength(1);
    expect(shadows.match(/React.createElement\("mesh"/g)).toHaveLength(1);
    const stage = readFileSync('src/main/remotion/compositions/explainer/Stage3D.tsx', 'utf8');
    expect(stage.match(/<ThreeCanvas\b/g)).toHaveLength(1);
    expect(stage.match(/<StudioEnvironment\b/g)).toHaveLength(1);
    expect(stage.match(/<ContactShadows\b/g)).toHaveLength(1);
    expect(stage).not.toMatch(/<mesh\b/);
    // Ranking: 18 authored + 1 displayed shadow = 19 live; +1 scratch = 20.
    // Calendar: 12 authored + 1 displayed shadow = 13 live; +1 scratch = 14.
    // Offline PMREM preparation: separate 8 meshes containing 6 instances, not scene geometry.
  });
  it('proves zero diagram/one hybrid canvas from actual ownership without a fake ThreeCanvas SSR context', () => {
    const route = readFileSync(
      'src/main/remotion/compositions/explainer/expansion/quantities/ranking-calendar-Scene.tsx',
      'utf8',
    );
    expect(route).toMatch(/if \(scene\.visualMode === 'diagram'\)\s*return \(?\s*<DiagramStage/);
    expect(route.match(/<HybridStage\b/g)).toHaveLength(1);
    expect(route).toContain('diagram={null}');
    expect(route.match(/<DiagramSurface\b/g)).toHaveLength(1);
    expect(route).not.toMatch(/<Stage3D\b|<ThreeCanvas\b|<canvas\b/);
    const hybrid = readFileSync(
      'src/main/remotion/compositions/explainer/diagrams/HybridStage.tsx',
      'utf8',
    );
    expect(hybrid.match(/<Stage3D\b/g)).toHaveLength(1);
    for (const token of ['driftDeg={0}', 'pushAmount={0}', 'bobAmount={0}'])
      expect(hybrid).toContain(token);
    const diagram = readFileSync(
      'src/main/remotion/compositions/explainer/diagrams/DiagramStage.tsx',
      'utf8',
    );
    expect(diagram).not.toMatch(/import .*Stage3D|<ThreeCanvas\b|<canvas\b/);
    const models = readFileSync(
      'src/main/remotion/compositions/explainer/expansion/quantities/ranking-calendar-models.tsx',
      'utf8',
    );
    expect(models).toContain('rotation={[0, -pose.turn, 0]}');
  });
});
