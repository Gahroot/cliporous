import type React from 'react';
import { HybridStage } from '../../diagrams/HybridStage';
import { useSceneTime, useStage } from '../../stage';
import {
  ApprovalRail,
  ExceptionTrolley,
  PermissionCard,
  PlaybookBinder,
} from '../assets/authority';
import {
  AUTHORITY_BODY,
  authorityLines,
  type BusinessAuthorityPose,
  sampleBusinessAuthority,
} from './poses';
import { authorityLayout } from './readability';
import type { AuthorityBusinessScene } from './types';

export interface AuthorityPartsProps {
  scene: AuthorityBusinessScene;
  pose: BusinessAuthorityPose;
}

function keyed<T>(items: readonly T[], content: (value: T) => string): { key: string; value: T }[] {
  const occurrences = new Map<string, number>();
  return items.map((value) => {
    const text = content(value);
    const occurrence = occurrences.get(text) ?? 0;
    occurrences.set(text, occurrence + 1);
    return { key: `${text}:${occurrence}`, value };
  });
}

/** Stage-free, authored semantic assemblies. No runtime prop/asset selector or extra canvas. */
export function AuthorityModelParts({
  scene,
  pose,
}: AuthorityPartsProps): React.ReactElement | null {
  if (scene.preset === 'conflicting-limits') return null; // Frozen OP-16 is diagram-only.
  if (scene.preset === 'permissions')
    return (
      <group visible={pose.opacity > 0}>
        {pose.cards.map((card, index) => (
          <group
            key={card.id}
            position={[(index - (pose.cards.length - 1) / 2) * 1.1, 0, 0]}
            scale={0.58}
          >
            <PermissionCard state={card.state} focus={card.focus} />
          </group>
        ))}
      </group>
    );
  if (scene.preset === 'action-limits')
    return (
      <group visible={pose.opacity > 0}>
        {pose.cards.map((card) => (
          <group key={card.id} position={[-1.15, 0, 0]} scale={0.68}>
            <PermissionCard state={card.state} focus={card.focus} />
          </group>
        ))}
        <group position={[0.95, 0, 0]} scale={0.65}>
          <PlaybookBinder open={pose.binderOpen} revision={pose.binderRevision} />
        </group>
      </group>
    );
  if (scene.preset === 'exception-review')
    return (
      <group visible={pose.opacity > 0}>
        {scene.review.state === 'pending' ? (
          <ExceptionTrolley pending />
        ) : (
          <PermissionCard
            state={scene.review.state === 'denied' ? 'denied' : 'unknown'}
            focus={pose.binderOpen}
          />
        )}
      </group>
    );
  if (scene.preset === 'accountable-transfer')
    return (
      <group visible={pose.opacity > 0}>
        {/* The rail includes an approver figure: mount it only for an explicit source role.
            Acceptance illustrates the declared transfer, never permission or execution. */}
        {scene.roles.approverId === null ? (
          <PlaybookBinder open={pose.binderOpen} revision={0} />
        ) : (
          <ApprovalRail accepted={pose.gateAccepted} />
        )}
      </group>
    );
  // A source record, source classification or dated guidance, not a training iteration.
  return (
    <group visible={pose.opacity > 0}>
      <PlaybookBinder open={pose.binderOpen} revision={pose.binderRevision} />
    </group>
  );
}

/** Native 952x478 SVG content. HybridStage supplies DiagramSurface and DiagramChrome.
 * Fixed-size type and explicit continued detail pages: never clipped claims or shrinking type.
 * Denial/pending/unknown status remains in the persistent header on every page/final hold.
 */
export function AuthorityDiagramParts({ pose }: AuthorityPartsProps): React.ReactElement {
  const S = useStage();
  const { width, height, fontSize, lineHeight } = AUTHORITY_BODY;
  const { header, footer, panelTop, footerTop, panelHeight } = authorityLayout(
    pose.status,
    pose.declaration,
  );
  const page = pose.pages[pose.pageIndex] ?? [];
  return (
    <g fontFamily={S.font} fontSize={fontSize} fill={S.text}>
      <title>{`${pose.status} ${pose.declaration}`}</title>
      {keyed(header, (line) => line).map(({ value: line, key }, index) => (
        <text key={key} x={16} y={28 + index * lineHeight} fontWeight={650}>
          {line}
        </text>
      ))}
      {keyed(page, (panel) => `${panel.label}:${panel.lines.join('\n')}`).map(
        ({ value: panel, key }, index) => {
          const x = 16 + index * (width / 2);
          const labels = authorityLines(panel.label, 14);
          return (
            <g key={key}>
              <rect
                x={x}
                y={panelTop}
                width={444}
                height={panelHeight}
                rx={18}
                fill={S.cardRaised}
                stroke={S.muted}
              />
              {keyed(labels, (line) => line).map(({ value: line, key }, at) => (
                <text
                  key={key}
                  x={x + 20}
                  y={panelTop + 32 + at * lineHeight}
                  fill={S.accent}
                  fontWeight={650}
                >
                  {line}
                </text>
              ))}
              {keyed(panel.lines, (line) => line).map(({ value: line, key }, at) => (
                <text key={key} x={x + 20} y={panelTop + 44 + (labels.length + at) * lineHeight}>
                  {line}
                </text>
              ))}
            </g>
          );
        },
      )}
      {keyed(footer, (line) => line).map(({ value: line, key }, index) => (
        <text key={key} x={16} y={footerTop + 24 + index * lineHeight}>
          {line}
        </text>
      ))}
      <text
        x={width - 20}
        y={height - 16}
        textAnchor="end"
      >{`${pose.pageIndex + 1}/${pose.pages.length}`}</text>
    </g>
  );
}

/** One existing HybridStage canvas for hybrid, none for native diagram. */
export function BusinessAuthoritySceneView({
  scene,
}: {
  scene: AuthorityBusinessScene;
}): React.ReactElement {
  const { t } = useSceneTime(); // Remotion's seekable frame-derived scene time, never wall-clock time.
  const pose = sampleBusinessAuthority(scene, { frame: t * 30, fps: 30, beats: scene });
  return (
    <HybridStage
      scene={scene}
      settledOutcome
      model={<AuthorityModelParts scene={scene} pose={pose} />}
      diagram={<AuthorityDiagramParts scene={scene} pose={pose} />}
    />
  );
}
