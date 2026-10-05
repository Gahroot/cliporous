import type React from 'react';
import { labelLines } from '../../diagrams/layout';
import { useStage } from '../../stage';
import { sampleApprovalGate } from './approval-poses';

export { type ApprovalGateSample, sampleApprovalGate } from './approval-poses';

import type { AgentWorkflowScene } from '../../technology/types';
import { ApprovalRail } from '../assets/authority';

/** Presentation of an already source-validated approval-gate, not a permission validator.
 * The existing parser requires a passing result, a request, a human grant in the check
 * span and actual task completion in the resolve span. No new state/DTO is inferred.
 */

type ApprovalGatePartsProps = { scene: AgentWorkflowScene; seconds: number };

/** Six authored entities and five relationships in the existing 952 × 478 SVG body.
 * Source/condition text stays here, not in the model or a new stage wrapper.
 */
export function ApprovalGateDiagramParts({
  scene,
  seconds,
}: ApprovalGatePartsProps): React.ReactElement | null {
  const S = useStage();
  const pose = sampleApprovalGate(scene, seconds);
  if (!pose) return null;
  const nodes = [
    { id: 'source', x: 140, y: 94, label: 'Source task', detail: scene.subject },
    {
      id: 'agent',
      x: 476,
      y: 94,
      label: 'Agent',
      detail: pose.called ? 'Tool called' : 'Task received',
    },
    {
      id: 'tool',
      x: 812,
      y: 94,
      label: scene.toolLabel,
      detail: pose.returned ? 'Result returned' : 'Waiting for result',
    },
    {
      id: 'check',
      x: 812,
      y: 270,
      label: 'Result check',
      detail: pose.checked ? 'Passed' : 'Awaiting check',
    },
    {
      id: 'human',
      x: 476,
      y: 270,
      label: 'Human approval',
      detail: pose.pending ? 'Pending' : 'Approved',
    },
    { id: 'result', x: 140, y: 270, label: 'Task result', detail: scene.outcome },
  ];
  return (
    <g data-task={scene.subject} fontFamily={S.font}>
      {[
        'M 270 94 H 346',
        'M 606 94 H 682',
        'M 812 186 V 206',
        'M 682 270 H 606',
        'M 346 270 H 270',
      ].map((d, index) => (
        <path
          key={d}
          data-edge={index}
          d={d}
          fill="none"
          stroke={S.muted}
          strokeWidth={3}
          opacity={index === 4 && !pose.completed ? 0 : 1}
        />
      ))}
      {nodes.map((node) =>
        node.id === 'result' && !pose.completed ? null : (
          <g key={node.id} data-entity={node.id} transform={`translate(${node.x} ${node.y})`}>
            <rect
              x={-130}
              y={-64}
              width={260}
              height={156}
              rx={18}
              fill={S.cardRaised}
              stroke={node.id === 'human' ? S.accent : S.muted}
              strokeWidth={2}
            />
            {labelLines(node.label, 20).map((line, index) => (
              <text
                key={`label-${index}-${line}`}
                x={0}
                y={-32 + index * 25}
                textAnchor="middle"
                fontSize={22}
                fontWeight={700}
                fill={S.text}
              >
                {line}
              </text>
            ))}
            {labelLines(node.detail, 22).map((line, index) => (
              <text
                key={`detail-${index}-${line}`}
                x={0}
                y={22 + index * 25}
                textAnchor="middle"
                fontSize={22}
                fill={node.id === 'human' && pose.pending ? S.muted : S.text}
              >
                {line}
              </text>
            ))}
          </g>
        ),
      )}
      <text x={476} y={394} textAnchor="middle" fontSize={22} fill={S.muted}>
        {scene.condition ? 'Conditional source account' : 'Source-stated account'}
      </text>
      {scene.condition &&
        labelLines(scene.condition, 56).map((line, index) => (
          <text
            key={`condition-${index}-${line}`}
            x={476}
            y={426 + index * 25}
            textAnchor="middle"
            fontSize={22}
            fill={S.text}
          >
            {line}
          </text>
        ))}
    </g>
  );
}

/** Literal A-06 task carrier and separate generic human approver. No canvas/stage/text.
 * accepted remains zero before the source human grant, independent of the tool result.
 */
export function ApprovalGateModelParts({
  scene,
  seconds,
}: ApprovalGatePartsProps): React.ReactElement | null {
  const pose = sampleApprovalGate(scene, seconds);
  if (!pose) return null;
  return (
    <group
      name={`Task: ${scene.subject}`}
      userData={{
        subject: scene.subject,
        toolLabel: scene.toolLabel,
        gateState: pose.pending ? 'pending' : 'approved',
        completed: pose.completed,
      }}
    >
      <ApprovalRail accepted={pose.accepted} />
    </group>
  );
}
