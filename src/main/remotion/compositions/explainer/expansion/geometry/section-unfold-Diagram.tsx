import type { ReactElement } from 'react';
import { UI_FONT, useStage } from '../../stage';
import {
  cubeFaceVertices,
  type SectionUnfoldPose,
  sectionTeachingLabel,
} from './section-unfold-poses';
import type { ExpansionSectionUnfoldScene } from './section-unfold-types';

/** The source rail is identical in both modes, independent of the model handoff. */
export function SectionUnfoldDiagram({
  scene,
  pose,
}: {
  scene: ExpansionSectionUnfoldScene;
  pose: SectionUnfoldPose;
}): ReactElement {
  const S = useStage();
  const text = (value: string, x: number, y: number) => (
    <text x={x} y={y} fontFamily={UI_FONT} fontSize={22} fill={S.text}>
      {value}
    </text>
  );
  const page = pose.pages[pose.page];
  const graphic =
    scene.storyId === '57' ? (
      <g data-template={scene.template}>
        {text(`Authored ${scene.template}`, 12, 30)}
        {scene.template === 'cylinder' ? (
          <>
            <ellipse cx={230} cy={100} rx={120} ry={32} fill={S.card} stroke={S.muted} />
            <path
              d="M110 100V350Q230 414 350 350V100"
              fill={S.card}
              stroke={S.muted}
              strokeWidth={2}
            />
          </>
        ) : (
          <>
            <rect
              x={90}
              y={125}
              width={290}
              height={250}
              fill={S.card}
              stroke={S.muted}
              strokeWidth={2}
            />
            {scene.template === 'house' && (
              <path d="M70 125L235 50L400 125Z" fill={S.card} stroke={S.muted} strokeWidth={2} />
            )}
          </>
        )}
        <path
          d={`M${100 + ('value' in scene.section && scene.section.value === 'intersects' ? pose.sweep : 0) * 260} 110V390`}
          stroke={S.accent}
          strokeWidth={3}
          strokeDasharray="6 5"
        />
        {scene.parts.map((p) => {
          const shown = pose.visibleIds.includes(p.id) || pose.revealedIds.includes(p.id);
          const positions = {
            board: [125, 170],
            port: [270, 170],
            cell: [125, 270],
            drive: [270, 270],
            core: [125, 170],
            insert: [125, 270],
            shaft: [270, 170],
            partition: [270, 170],
            beam: [125, 170],
            valve: [125, 270],
          };
          const [x, y] = positions[p.part];
          const knownPresent = 'value' in p && p.value !== 'absent';
          return (
            <g key={p.id} data-part-id={p.id} data-state={p.state}>
              {knownPresent && (
                <g opacity={shown ? 1 : 0}>
                  {p.part === 'cell' || p.part === 'shaft' ? (
                    <rect x={x + 22} y={y} width={24} height={55} rx={12} fill={S.accent} />
                  ) : p.part === 'drive' || p.part === 'valve' ? (
                    <circle
                      cx={x + 34}
                      cy={y + 25}
                      r={24}
                      fill={p.part === 'valve' ? 'none' : S.accent}
                      stroke={S.accent}
                      strokeWidth={6}
                    />
                  ) : (
                    <rect
                      x={x}
                      y={y}
                      width={p.part === 'beam' ? 95 : 72}
                      height={
                        p.part === 'beam' || p.part === 'insert'
                          ? 12
                          : p.part === 'partition'
                            ? 58
                            : 45
                      }
                      fill={S.accent}
                    />
                  )}
                </g>
              )}
              {text(p.part, x - 8, y + 80)}
            </g>
          );
        })}
        {text(sectionTeachingLabel(scene), 12, 444)}
        {text(
          scene.section.state === 'known'
            ? `Section: ${scene.section.value}`
            : `Section: ${scene.section.state}`,
          12,
          472,
        )}
      </g>
    ) : (
      <g data-template="cube-cross" data-correspondence-ids={pose.correspondenceIds.join(' ')}>
        {text('Six authored faces', 12, 30)}
        {scene.faces
          .map((face) => {
            const vertices = cubeFaceVertices(face.face, pose.fold);
            const points = vertices.map(([x, y, z]) => [
              230 + 80 * (x + 0.4 * z * (1 - pose.fold)),
              280 - 80 * (y + 0.25 * z * (1 - pose.fold)),
            ]);
            return { face, vertices, points };
          })
          .sort(
            (a, b) =>
              a.vertices.reduce((n, v) => n + v[2], 0) - b.vertices.reduce((n, v) => n + v[2], 0),
          )
          .map(({ face, vertices, points }) => {
            const x = points.reduce((n, p) => n + p[0], 0) / 4;
            const y = points.reduce((n, p) => n + p[1], 0) / 4;
            return (
              <g key={face.id} data-face-id={face.id} data-fold-vertices={JSON.stringify(vertices)}>
                <polygon
                  points={points.map((p) => p.join(',')).join(' ')}
                  fill={face.face === 'front' ? S.accent : S.card}
                  stroke={S.muted}
                  strokeWidth={2}
                />
                {(pose.fold > 0.999 || face.face === 'front') && text(face.face, x - 34, y + 8)}
              </g>
            );
          })}
        {text(sectionTeachingLabel(scene), 12, 444)}
        {text(`Links: ${pose.correspondenceIds.length ? 'supplied' : 'not asserted'}`, 12, 472)}
      </g>
    );
  return (
    <g data-page-id={page.id}>
      {graphic}
      {page.rows.map((row) => (
        <g key={row.id}>{text(row.text, 492, row.baseline)}</g>
      ))}
    </g>
  );
}
