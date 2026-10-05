import type { ReactElement } from 'react';
import { UI_FONT, useStage } from '../../stage';
import {
  VECTOR_FACTORIZATION_TEXT,
  type VectorFactorizationPose,
  vectorFactorizationIdentity,
  vectorFactorizationLineNodes,
  vectorFactorizationValue,
  vectorFactorizationWrap,
} from './vector-factorization-poses';
import type { ExpansionVectorFactorizationScene } from './vector-factorization-types';

/** Primary source-math pages: fixed component tables and the parser's two authored identities.
 * No orientation, resultant, decomposition or quantitative geometry is inferred. */
export function VectorFactorizationDiagram({
  scene,
  pose,
}: {
  scene: ExpansionVectorFactorizationScene;
  pose: VectorFactorizationPose;
}): ReactElement {
  const S = useStage();
  const page = pose.pages[pose.page];
  const vectors = scene.storyId === '55' ? [scene.vector, ...scene.basis] : [];
  const activeVector =
    vectors.find((v) => v.components.some((c) => c.id === page.sourceId)) ?? vectors[0];
  const component =
    activeVector?.components.find((c) => c.id === page.sourceId) ?? activeVector?.components[0];
  const vectorLabel =
    scene.storyId === '55'
      ? scene.entities.find((e) => e.id === activeVector?.entityId)?.label
      : undefined;
  const operand =
    scene.storyId === '56' ? scene.operands.find((o) => o.id === page.sourceId) : undefined;
  const board =
    scene.storyId === '56' ? vectorFactorizationWrap(vectorFactorizationIdentity(scene)) : [];
  const row = operand
    ? vectorFactorizationWrap(`${operand.role}: ${vectorFactorizationValue(operand.quantity)}`)
    : [];
  const heading =
    vectorLabel && activeVector
      ? vectorFactorizationWrap(
          `${scene.storyId === '55' && activeVector.id === scene.vector.id ? 'Vector' : 'Basis'}: ${vectorLabel}`,
        )
      : [];
  return (
    <g
      data-story={scene.storyId}
      data-page-id={page.id}
      data-persistent-diagram-surface="true"
      data-primary-source-surface="true"
    >
      <rect x={8} y={8} width={936} height={462} rx={16} fill={S.card} />
      <rect
        x={16}
        y={16}
        width={920}
        height={194}
        rx={12}
        fill={S.cardRaised}
        stroke={S.accent}
        strokeWidth={2}
        strokeOpacity={0.35 + 0.65 * (page.kind === 'identity' ? pose.resolve : pose.action)}
      />
      {scene.storyId === '55' && activeVector && component && (
        <g
          data-component-table="true"
          data-component-id={component.id}
          data-vector-id={activeVector.id}
        >
          {vectorFactorizationLineNodes(heading, `${activeVector.id}:heading`).map((line, i) => (
            <text
              key={line.id}
              x={24}
              y={34 + i * 28}
              fontFamily={UI_FONT}
              fontSize={22}
              fill={S.text}
            >
              {line.text}
            </text>
          ))}
          <text
            x={24}
            y={90}
            fontFamily={UI_FONT}
            fontSize={22}
            fill={S.text}
          >{`Frame: ${scene.frame}`}</text>
          {[
            { x: 24, width: 100, name: 'Axis' },
            { x: 124, width: 256, name: 'Direction' },
            { x: 380, width: 548, name: `Value (${component.quantity.basis.unit})` },
          ].map((cell) => (
            <g key={cell.name}>
              <rect
                x={cell.x}
                y={102}
                width={cell.width}
                height={96}
                fill="none"
                stroke={S.muted}
              />
              <text x={cell.x + 12} y={126} fontFamily={UI_FONT} fontSize={22} fill={S.muted}>
                {cell.name}
              </text>
            </g>
          ))}
          <text x={36} y={162} fontFamily={UI_FONT} fontSize={22} fill={S.accent}>
            {component.axis}
          </text>
          <text x={136} y={162} fontFamily={UI_FONT} fontSize={22} fill={S.accent}>
            {component.direction}
          </text>
          {vectorFactorizationLineNodes(
            vectorFactorizationWrap(vectorFactorizationValue(component.quantity), 32),
            `${component.id}:value`,
          ).map((line, i) => (
            <text
              key={line.id}
              data-quantity-value={component.id}
              x={392}
              y={162 + i * 28}
              fontFamily={UI_FONT}
              fontSize={22}
              fill={S.accent}
            >
              {line.text}
            </text>
          ))}
        </g>
      )}
      {scene.storyId === '56' && (
        <g data-equation-board="true" data-result-state={scene.result.state}>
          {vectorFactorizationLineNodes(board, `${scene.storyId}:equation`).map((line, i) => (
            <text
              key={line.id}
              data-approved-identity="true"
              x={24}
              y={42 + i * 28}
              fontFamily={UI_FONT}
              fontSize={22}
              fill={S.accent}
            >
              {line.text}
            </text>
          ))}
          {vectorFactorizationLineNodes(row, `${operand?.id ?? scene.storyId}:operand`).map(
            (line, i) => (
              <text
                key={line.id}
                data-quantity-value={operand?.id}
                x={24}
                y={174 + i * 28}
                fontFamily={UI_FONT}
                fontSize={22}
                fill={S.text}
              >
                {line.text}
              </text>
            ),
          )}
        </g>
      )}
      <g data-source-id={page.sourceId} data-source-kind={page.kind} data-factual-page="true">
        {vectorFactorizationLineNodes(page.lines, page.id).map((line, i) => (
          <text
            key={line.id}
            x={VECTOR_FACTORIZATION_TEXT.x}
            y={VECTOR_FACTORIZATION_TEXT.y + i * VECTOR_FACTORIZATION_TEXT.leading}
            fontFamily={UI_FONT}
            fontSize={VECTOR_FACTORIZATION_TEXT.font}
            fill={page.kind === 'identity' ? S.accent : S.text}
          >
            {line.text}
          </text>
        ))}
      </g>
      <text
        x={24}
        y={446}
        fontFamily={UI_FONT}
        fontSize={22}
        fill={S.muted}
      >{`${pose.page + 1}/${pose.pages.length}`}</text>
    </g>
  );
}
