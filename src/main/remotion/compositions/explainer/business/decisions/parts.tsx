import type React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { useStage } from '../../stage';
import { ApprovalRail } from '../assets/authority';
import { CommitmentFolio } from '../assets/funds';
import { BranchPod, OperatingDesk } from '../assets/retail';
import { decisionQuantityRatio, decisionsPose } from './poses';
import {
  decisionAlbumHeaders,
  decisionLines,
  decisionPages,
  DECISIONS_ALBUM_HEADER as H,
  DECISIONS_RAIL as R,
} from './presentation';
import type { DecisionQuantity, DecisionsScene } from './types';

function QuantityMark({
  id,
  label,
  quantity,
  index,
}: {
  id: string;
  label: string;
  quantity: DecisionQuantity;
  index: number;
}): React.ReactElement {
  const S = useStage();
  const ratio = decisionQuantityRatio(quantity);
  return (
    <g data-measurement-id={id} data-measurement-state={quantity.state}>
      <text x={24} y={28 + index * 36} fill={S.text} fontFamily="Inter" fontSize={24}>
        {label}
      </text>
      {ratio !== null ? (
        <>
          <text x={230} y={28 + index * 36} fill={S.text} fontFamily="Inter" fontSize={24}>
            {`${quantity.value} / ${quantity.basis.denominator} (source denominator)`}
          </text>
          <rect x={230} y={32 + index * 36} width={690} height={4} fill="none" stroke={S.text} />
          <rect
            data-observed-share={ratio}
            x={230}
            y={32 + index * 36}
            width={690 * ratio}
            height={4}
            fill={S.accent}
          />
        </>
      ) : (
        <text x={230} y={28 + index * 36} fill={S.text} fontFamily="Inter" fontSize={24}>
          {`${quantity.state}: no share measurement`}
        </text>
      )}
    </g>
  );
}

/** Pure SVG facts, no stage, canvas, truncation or font scaling. */
export function DecisionsDiagram({ scene }: { scene: DecisionsScene }): React.ReactElement {
  const S = useStage();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pose = decisionsPose(scene, frame, fps);
  const pages = decisionPages(scene);
  const page = pages[pose.page];
  let lineIndex = 0;
  return (
    <g data-decisions-preset={scene.preset}>
      {scene.preset === 'contingent-commitment' && (
        <g data-authority-state={pose.authorityState}>
          <path d="M100 46H852" stroke={S.cardBorder} strokeWidth={8} fill="none" />
          <path
            d={`M100 46H${100 + pose.handshake.approach * 330}`}
            stroke={S.text}
            strokeWidth={8}
            fill="none"
          />
          <path d="M476 26V66" stroke={S.text} strokeWidth={6} />
          {decisionLines(`${scene.action.label}: ${pose.authorityState}`).map((line, index) => {
            const key = `${scene.action.id}:authority:${index}:${line}`;
            return (
              <text
                key={key}
                x={R.padding}
                y={100 + index * R.lineHeight}
                fill={S.text}
                fontFamily="Inter"
                fontSize={R.fontSize}
              >
                {line}
              </text>
            );
          })}
        </g>
      )}
      {scene.preset === 'planned-observed' && (
        <>
          <g data-observation-state={scene.planned.state} opacity={pose.observation.planOpacity}>
            {decisionLines(`Planned: ${scene.task.label} (${scene.planned.state})`).map(
              (line, index) => {
                const key = `${scene.task.id}:plan:${index}:${line}`;
                return (
                  <text
                    key={key}
                    x={R.padding}
                    y={26 + index * R.lineHeight}
                    fill={S.text}
                    fontFamily="Inter"
                    fontSize={R.fontSize}
                  >
                    {line}
                  </text>
                );
              },
            )}
            <path d="M24 64H928" stroke={S.text} strokeWidth={4} strokeDasharray="10 8" />
          </g>
          <g
            data-observation-state={scene.observed.state}
            opacity={pose.observation.observationOpacity}
          >
            {decisionLines(`Observation: ${scene.task.label} (${scene.observed.state})`).map(
              (line, index) => {
                const key = `${scene.task.id}:observation:${index}:${line}`;
                return (
                  <text
                    key={key}
                    x={R.padding}
                    y={82 + index * R.lineHeight}
                    fill={S.text}
                    fontFamily="Inter"
                    fontSize={R.fontSize}
                  >
                    {line}
                  </text>
                );
              },
            )}
            <path d="M24 140H928" stroke={S.text} strokeWidth={4} />
          </g>
        </>
      )}
      {scene.preset === 'firms-functions-workers' &&
        scene.frames.map((entry, index) => (
          <QuantityMark
            key={entry.identity.id}
            id={entry.identity.id}
            label={entry.frame}
            quantity={entry.quantity}
            index={index}
          />
        ))}
      {scene.preset === 'original-and-surviving-cohorts' &&
        [scene.original, scene.surviving, scene.attrition].map((entry, index) => (
          <QuantityMark
            key={entry.identity.id}
            id={entry.identity.id}
            label={['Original', 'Surviving', 'Attrition'][index]}
            quantity={entry.quantity}
            index={index}
          />
        ))}
      {scene.preset === 'alternatives-or-source-distribution' &&
        decisionAlbumHeaders(scene).map((header, index) => {
          const probability = scene.alternatives[index].probability;
          return (
            <g
              key={header.id}
              data-alternative-id={header.id}
              opacity={pose.alternatives[index].opacity}
            >
              <rect
                x={header.x}
                y={header.y}
                width={header.width}
                height={header.height}
                rx={8}
                fill={S.cardRaised}
                stroke={S.text}
              />
              {header.lines.map((line, lineIndex) => {
                const key = `${header.id}:${lineIndex}:${line}`;
                return (
                  <text
                    key={key}
                    x={header.x + H.padding}
                    y={header.y + H.padding + H.fontSize + lineIndex * H.lineHeight}
                    fill={S.text}
                    fontFamily="Inter"
                    fontSize={H.fontSize}
                  >
                    {line}
                  </text>
                );
              })}
              {probability && (
                <rect
                  data-source-probability={`${probability.numerator}/${probability.denominator}`}
                  x={header.x + 4}
                  y={header.y + header.height - 20}
                  width={((header.width - 8) * probability.numerator) / probability.denominator}
                  height={12}
                  fill={S.accent}
                />
              )}
            </g>
          );
        })}
      {page.rows.map((row) => (
        <g key={row.id} data-fact-id={row.id} data-fact-state={row.state}>
          {[
            ...decisionLines(`${row.label} · ${row.state}`).map((text) => ({ text, strong: true })),
            ...decisionLines(row.text).map((text) => ({ text, strong: false })),
          ].map((line, index) => {
            const y = 174 + lineIndex++ * R.lineHeight;
            const key = `${row.id}:${index}:${line.text}`;
            return (
              <text
                key={key}
                x={R.padding}
                y={y}
                fill={S.text}
                fontFamily="Inter"
                fontSize={R.fontSize}
                fontWeight={line.strong ? 700 : 400}
              >
                {line.text}
              </text>
            );
          })}
        </g>
      ))}
      <text x={928} y={470} textAnchor="end" fill={S.text} fontFamily="Inter" fontSize={24}>
        {`${pose.page + 1} / ${pages.length}`}
      </text>
    </g>
  );
}

/** Only explicitly source-gated assemblies; inspection is not approval, cash or telemetry. */
export function DecisionsNativeParts({
  scene,
}: {
  scene: DecisionsScene;
}): React.ReactElement | null {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pose = decisionsPose(scene, frame, fps);
  const supported = (asset: string, identityId: string): boolean =>
    pose.native.some((entry) => entry.asset === asset && entry.identityId === identityId);
  if (scene.visualMode === 'diagram' || pose.native.length === 0) return null;
  switch (scene.preset) {
    case 'contingent-commitment':
      return (
        <group name="contingent-commitment">
          {supported('A-09', scene.commitment.identity.id) && (
            <group name={scene.commitment.identity.id} position={[-1.35, 0.3, 0]} scale={0.58}>
              <CommitmentFolio open={pose.folioOpen} contributed={pose.contributed} />
            </group>
          )}
          {supported('A-06', scene.gate.id) && (
            <group name={scene.gate.id} position={[1.4, 0.3, 0]} scale={0.6}>
              <ApprovalRail accepted={0} />
            </group>
          )}
        </group>
      );
    case 'planned-observed':
    case 'original-and-surviving-cohorts':
      return supported('A-04', scene.owner.id) ? (
        <group name={scene.owner.id} position={[0, 0.35, 0]} scale={0.85}>
          <OperatingDesk pending={pose.deskPending} />
        </group>
      ) : null;
    case 'firms-functions-workers':
    case 'alternatives-or-source-distribution':
      return supported('A-03', scene.owner.id) ? (
        <group name={scene.owner.id} position={[0, 0.3, 0]} scale={0.75}>
          <BranchPod open={pose.branchOpen} />
        </group>
      ) : null;
  }
}
