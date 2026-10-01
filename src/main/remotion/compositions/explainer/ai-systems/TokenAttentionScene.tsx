import type React from 'react';
import { HybridStage } from '../diagrams/HybridStage';
import { labelLines, tokenPoint } from '../diagrams/layout';
import { DiagramText } from '../diagrams/primitives';
import { ClayBlock } from '../explanation-kit';
import { useSceneTime, useStage } from '../stage';
import { tokenAttentionPose } from './poses';
import type { TokenAttentionScene as Scene } from './types';

export function TokenAttentionScene({ scene }: { scene: Scene }): React.ReactElement {
  const S = useStage();
  const { t } = useSceneTime();
  const p = tokenAttentionPose(t, scene);
  const from = tokenPoint(scene.targetIndex),
    to = tokenPoint(scene.contextIndex);
  // Across rows, use the outside rail and empty row gap, never cross another word tile.
  const sameRow = from.y === to.y;
  const referencePath = sameRow
    ? `M ${from.x} ${from.y + 70} H ${to.x}`
    : `M ${from.x} ${from.y + 70} H 936 V 220 H ${to.x} V ${to.y + 70}`;
  return (
    <HybridStage
      scene={scene}
      model={
        <>
          {scene.tokens.map((token, i) => (
            <group key={token.id} position={[((i % 6) - 2.5) * 0.92, i < 6 ? 0.58 : -0.68, 0]}>
              <ClayBlock
                size={[0.8, 0.63, 0.28]}
                color={i === scene.targetIndex ? S.clay[1] : S.clay[0]}
              />
              <ClayBlock size={[0.38, 0.07, 0.04]} position={[0, 0, 0.17]} color={S.clay[2]} />
            </group>
          ))}
        </>
      }
      diagram={
        <>
          <path
            d={referencePath}
            fill="none"
            stroke={S.text}
            strokeWidth={5}
            pathLength={1}
            strokeDasharray={1}
            strokeDashoffset={1 - p.linked}
          />
          <path
            d="M -14 -8 L 0 0 L -14 8"
            fill="none"
            stroke={S.text}
            strokeWidth={5}
            opacity={p.linked}
            transform={`translate(${to.x} ${to.y + 70}) rotate(${sameRow ? 180 : -90})`}
          />
          {scene.tokens.map((token, i) => {
            const point = tokenPoint(i),
              selected = i === scene.targetIndex && p.selected > 0;
            const wide = token.text.length > 6 || /[MW@]{3}/u.test(token.text);
            const size = wide ? 24 : 30;
            const columns = wide ? 5 : 6;
            const lines = labelLines(token.text, columns).length;
            return (
              <g key={token.id} data-entity-id={token.id}>
                <rect
                  x={point.x - 69}
                  y={point.y - 62}
                  width={138}
                  height={124}
                  rx={12}
                  fill={S.cardRaised}
                  stroke={S.text}
                  strokeWidth={selected ? 7 : 2}
                />
                <DiagramText
                  x={point.x}
                  y={point.y + size * 0.33 - (lines - 1) * size * 0.6}
                  size={size}
                  columns={columns}
                  strong={selected}
                >
                  {token.text}
                </DiagramText>
              </g>
            );
          })}
          {t >= scene.checkAt && (
            <DiagramText x={476} y={448} size={30} columns={44}>
              No measured weights
            </DiagramText>
          )}
        </>
      }
    />
  );
}
