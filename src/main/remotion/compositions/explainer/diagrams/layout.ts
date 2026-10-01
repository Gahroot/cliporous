import { type ExplainerAspect, type ExplainerLayout, stageSafeBox } from '../types';
import type { DiagramPoint, DiagramRect } from './types';

/** Virtual-stage regions. SceneFrame applies the same single safe-box transform to both modes. */
export const DIAGRAM_REGIONS = {
  title: { x: 64, y: 48, width: 952, height: 112 },
  condition: { x: 72, y: 166, width: 936, height: 80 },
  body: { x: 64, y: 262, width: 952, height: 478 },
  evidence: { x: 72, y: 756, width: 936, height: 52 },
  outcome: { x: 72, y: 828, width: 936, height: 108 },
} as const satisfies Record<string, DiagramRect>;

/** Fixed topology; entity data never supplies coordinates. */
export const FLOW_POINTS = {
  sources: [
    { x: 140, y: 50 },
    { x: 140, y: 290 },
  ],
  account: { x: 476, y: 170 },
  targets: [
    { x: 812, y: 50 },
    { x: 812, y: 290 },
  ],
} as const;
export const MODEL_POINTS = [
  { x: 176, y: 180 },
  { x: 476, y: 180 },
  { x: 776, y: 180 },
] as const;

/** Preserve every character (including signs/units); an overlong word wraps, never ellipsizes. */
export function labelLines(label: string, columns = 22): string[] {
  if (!Number.isSafeInteger(columns) || columns < 1) return [label];
  const lines: string[] = [];
  let line = '';
  for (const word of label.split(/\s+/u)) {
    if (line && line.length + word.length + 1 > columns) {
      lines.push(line);
      line = '';
    }
    let rest = word;
    while (rest.length > columns) {
      if (line) {
        lines.push(line);
        line = '';
      }
      lines.push(rest.slice(0, columns));
      rest = rest.slice(columns);
    }
    line = line ? `${line} ${rest}` : rest;
  }
  if (line) lines.push(line);
  return lines;
}

export function tokenPoint(index: number): DiagramPoint {
  return { x: 80 + (index % 6) * 156, y: index < 6 ? 116 : 316 };
}

export function projectedDiagramRegion(
  region: DiagramRect,
  layout: ExplainerLayout,
  aspect: ExplainerAspect,
): DiagramRect {
  const safe = stageSafeBox(layout, aspect);
  const scale = Math.min(safe.width / 1080, safe.height / 960);
  return {
    x: safe.x + (safe.width - 1080 * scale) / 2 + region.x * scale,
    y: safe.y + (safe.height - 960 * scale) / 2 + region.y * scale,
    width: region.width * scale,
    height: region.height * scale,
  };
}
