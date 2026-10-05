import type { ReactElement } from 'react';
import { UI_FONT, useStage } from '../../stage';
import type { ScopePose } from './scope-poses';
import type { ExpansionReasoningScopeScene } from './scope-types';

export const SCOPE_LAYOUT = {
  overview: { x: 8, y: 12, width: 330, height: 456 },
  detail: { x: 352, y: 12, width: 592, height: 456 },
  font: 22,
  lineHeight: 26,
} as const;
/** Numbered references are navigation marks, not invented source names or verdicts. */
export function scopeOverview(scene: ExpansionReasoningScopeScene): string[] {
  const records = scene.storyId === '07' ? scene.statements : scene.facts;
  const marker = (id: string) =>
    `${scene.storyId === '07' ? 'S' : 'F'}${records.findIndex((r) => r.id === id) + 1}`;
  const rows = records.map((r) => marker(r.id));
  if (scene.storyId === '07')
    scene.relations.forEach((r, i) => {
      rows.push(
        `R${i + 1} ${marker(r.fromId).slice(1)}:${marker(r.toId).slice(1)} ${r.role === 'conflict' ? 'C' : 'S'}${r.status === 'disputed' ? 'D' : 'U'}`,
      );
    });
  else {
    scene.frames.forEach((f, i) => {
      rows.push(`View ${i + 1}: ${marker(f.referenceFactId)}`);
    });
    rows.push(`R1 ${scene.relations[0].role}`);
  }
  return rows;
}
export function ScopeDiagram({
  scene,
  pose,
}: {
  scene: ExpansionReasoningScopeScene;
  pose: ScopePose;
}): ReactElement {
  const S = useStage();
  const page = pose.pages[pose.page];
  const rows = scopeOverview(scene);
  const recordCount = scene.storyId === '07' ? scene.statements.length : scene.facts.length;
  const text = (value: string, x: number, y: number, size = 22) => (
    <text x={x} y={y} fontSize={size} fontFamily={UI_FONT} fill={S.text}>
      {value}
    </text>
  );
  return (
    <g data-scope-page={pose.page} data-scope-id={page.id}>
      <rect
        x={352}
        y={12}
        width={592}
        height={456}
        rx={12}
        fill={S.card}
        stroke={S.accent}
        strokeWidth={2}
      />
      {text('Source references', 8, 29)}
      {rows.slice(0, scene.storyId === '07' ? rows.length : recordCount).map((row, i) => {
        const count = scene.storyId === '07' ? scene.statements.length : scene.facts.length;
        const record = i < count;
        const index = record ? i : i - count;
        const x = record ? 8 + (index % 3) * 106 : 8 + (index % 2) * 168;
        const y = record ? 58 + Math.floor(index / 3) * 26 : 174 + Math.floor(index / 2) * 26;
        return (
          <g
            key={row}
            data-source-id={
              record
                ? scene.storyId === '07'
                  ? scene.statements[index].id
                  : scene.facts[index].id
                : undefined
            }
          >
            {text(row, x, y, 22)}
          </g>
        );
      })}
      {scene.storyId === '07' ? (
        <>
          {text('C conflict / S scope distinction', 8, 424, 22)}
          {text('D disputed / U unresolved', 8, 452, 22)}
        </>
      ) : (
        <>
          {scene.frames.map((view, v) => (
            <g key={view.id} data-frame-id={view.id} data-reference-id={view.referenceFactId}>
              {text(`View ${v + 1}`, 8 + v * 168, 174)}
              {text(
                `Ref F${scene.facts.findIndex((f) => f.id === view.referenceFactId) + 1}`,
                8 + v * 168,
                200,
              )}
              {view.factIds.map((id, i) => (
                <g key={id} data-view-fact-id={id} data-is-reference={id === view.referenceFactId}>
                  <rect
                    x={8 + v * 168 + (i % 3) * 52}
                    y={210 + Math.floor(i / 3) * 26}
                    width={48}
                    height={25}
                    rx={4}
                    fill={id === view.referenceFactId ? S.accent : S.card}
                  />
                  {text(`F${i + 1}`, 10 + v * 168 + (i % 3) * 52, 230 + Math.floor(i / 3) * 26)}
                </g>
              ))}
            </g>
          ))}
          {text('R1', 8, 346)}
          {text(scene.relations[0].role, 48, 346)}
          {text('Shared facts · unchanged', 8, 452)}
        </>
      )}
      {scene.visualMode === 'hybrid' && (
        <>
          {text(scene.storyId === '07' ? 'S1' : 'View 1', 56, 408)}
          {text(scene.storyId === '07' ? 'S2' : 'View 2', 216, 408)}
        </>
      )}
      {text(page.marker, 368, 40, 22)}
      {text(page.id, 368, 66, 22)}
      {page.lines.map((line, i) => (
        <g key={`${i}-${line}`}>{text(line, 368, 100 + i * 24)}</g>
      ))}
      {page.qualification.map((line, i) => (
        <g key={`qualification-${i}`}>{text(line, 368, 350 + i * 24)}</g>
      ))}
      <g opacity={pose.resolve}>{text(scene.result.status, 368, 450)}</g>
    </g>
  );
}
