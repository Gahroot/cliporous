import type React from 'react';
import { Clay } from './hero-kit';
import { MechanismStage } from './mechanisms/MechanismStage';
import { mixHex } from './palette';
import { useSceneTime, useStage, useWideStage, WideStageText } from './stage';
import { ClayPart, StopSeal } from './technology/clay';
import { TechText } from './technology/primitives';
import {
  RETRIEVAL_CLAY as G,
  retrievalGroundingCamera,
  retrievalQuestionPosition,
  retrievalSlipPosition,
  retrievalSlipTextRect,
} from './technology/retrieval-camera';
import {
  type RetrievalEvidencePose,
  type RetrievalGroundingPose,
  retrievalGroundingPose,
} from './technology/retrieval-grounding';
import {
  RETRIEVAL_TYPE,
  retrievalLibraryCaption,
  retrievalSlipText,
} from './technology/retrieval-text';
import type { RetrievalGroundingScene as Scene } from './technology/types';
import { type CameraSpec, projectToStage } from './three-helpers';

/** Bound volumes, page edges and open shelf mouths, not a grid of UI cards. */
function DocumentLibrary({ pose }: { pose: RetrievalGroundingPose }): React.ReactElement {
  const S = useStage();
  return (
    <group position={[G.libraryX, 0, G.depth]}>
      <ClayPart
        size={[3.36, 4.0, 0.16]}
        position={[0, 0.66, -0.72]}
        color={mixHex(S.clay[2], S.bgInner, 0.28)}
      />
      {[-1.66, 1.66].map((x) => (
        <ClayPart key={x} size={[0.18, 4.0, 1.3]} position={[x, 0.66, -0.13]} color={S.clay[2]} />
      ))}
      {[-1.315, 0.63, 2.61].map((y) => (
        <ClayPart
          key={y}
          size={[3.55, 0.13, 1.9]}
          position={[0, y, 0.16]}
          color={S.clay[2]}
          radius={0.05}
        />
      ))}
      {G.rows.map((y, index) => (
        <group key={y} position={[0, y, -0.04]}>
          {/* The hard cover and layered page block remain after an excerpt is removed. */}
          <ClayPart size={[2.96, 1.88, 0.56]} color={S.clay[index]} radius={0.065} />
          <ClayPart
            size={[2.65, 1.72, 0.59]}
            position={[0.08, 0, 0.045]}
            color={mixHex(S.paper, S.clay[1], 0.32)}
            radius={0.025}
          />
          <ClayPart
            size={[0.23, 1.88, 0.64]}
            position={[-1.36, 0, 0.02]}
            color={S.clay[2]}
            radius={0.05}
          />
          {[-0.4, 0.4].map((band) => (
            <ClayPart
              key={band}
              size={[0.25, 0.055, 0.67]}
              position={[-1.36, band, 0.02]}
              color={S.clay[1]}
              radius={0.018}
            />
          ))}
          {[-0.15, 0, 0.15].map((z) => (
            <ClayPart
              key={z}
              size={[0.025, 1.65, 0.012]}
              position={[1.405, 0, z]}
              color={S.clay[2]}
              radius={0.005}
            />
          ))}
        </group>
      ))}
      {/* A physical reading loupe scans once, only during the existing search interval. */}
      <group position={[1.62, 1.82 - 1.98 * pose.searchProgress, 0.79]}>
        <mesh>
          <torusGeometry args={[0.17, 0.042, 12, 32]} />
          <Clay color={S.accent} />
        </mesh>
        <ClayPart
          size={[0.09, 0.27, 0.1]}
          position={[0.15, -0.19, 0]}
          rotation={[0, 0, 0.64]}
          color={S.clay[1]}
          radius={0.04}
        />
      </group>
      {pose.noMatch && <StopSeal position={[1.66, 2.34, 0.61]} />}
    </group>
  );
}

/** An independent, open writing lectern: no fabricated answer sheet, lines or success seal. */
function AnswerWorkspace({ offset }: { offset: number }): React.ReactElement {
  const S = useStage();
  return (
    <group position={[G.answerX, -offset / 125, G.depth]}>
      <ClayPart size={[3.38, 0.14, 1.75]} position={[0, -1.3, 0.16]} color={S.clay[2]} />
      {[-1.1, 1.1].map((x) => (
        <ClayPart
          key={x}
          size={[0.2, 1.95, 0.2]}
          position={[x, -0.3, -0.57]}
          rotation={[-0.23, 0, 0]}
          color={S.clay[2]}
        />
      ))}
      <ClayPart
        size={[3.34, 3.92, 0.25]}
        position={[0, 0.645, 0.34]}
        color={S.clay[2]}
        radius={0.14}
      />
      <ClayPart
        size={[3.22, 3.75, 0.035]}
        position={[0, 0.65, 0.48]}
        color={mixHex(S.clay[2], S.bgInner, 0.18)}
        radius={0.1}
      />
      <ClayPart
        size={[3.21, 0.13, 0.42]}
        position={[0, -1.21, 0.71]}
        color={S.clay[1]}
        radius={0.04}
      />
      {/* A binder clip identifies a workspace, rather than a third source volume. */}
      <ClayPart size={[0.68, 0.17, 0.19]} position={[0, 2.38, 0.55]} color={S.clay[1]} />
      <mesh position={[0, 2.51, 0.52]}>
        <torusGeometry args={[0.14, 0.025, 10, 28]} />
        <Clay color={S.clay[1]} />
      </mesh>
    </group>
  );
}

function EvidenceSlip({
  slip,
  offset,
}: {
  slip: RetrievalEvidencePose;
  offset: number;
}): React.ReactElement {
  const S = useStage();
  return (
    <group position={retrievalSlipPosition(slip, offset)} visible={slip.opacity > 0}>
      <ClayPart size={G.slipSize} color={S.paper} radius={0.02} />
      <ClayPart
        size={[0.07, 1.7, 0.023]}
        position={[-1.53, 0, 0.03]}
        color={slip.selected ? S.accent : S.clay[2]}
        radius={0.01}
      />
      <ClayPart
        size={[0.19, 0.13, 0.035]}
        position={[1.41, 0.85, 0.035]}
        color={S.clay[slip.reference - 1]}
        radius={0.025}
      />
    </group>
  );
}

function QuestionTicket({ pose }: { pose: RetrievalGroundingPose }): React.ReactElement {
  const S = useStage();
  return (
    <group position={retrievalQuestionPosition(pose)} scale={pose.question.opacity}>
      <ClayPart size={[2.2, 0.12, 0.6]} color={S.clay[0]} radius={0.055} />
      <ClayPart
        size={[1.7, 0.016, 0.37]}
        position={[0.1, 0.069, 0]}
        color={S.paper}
        radius={0.02}
      />
      <ClayPart
        size={[0.09, 0.028, 0.44]}
        position={[-0.9, 0.069, 0]}
        color={S.accent}
        radius={0.015}
      />
    </group>
  );
}

/** Keep the real quotation and its numbered source on the same moving paper. */
function SlipLabel({
  camera,
  slip,
  pose,
}: {
  camera: CameraSpec;
  slip: RetrievalEvidencePose;
  pose: RetrievalGroundingPose;
}): React.ReactElement {
  const S = useStage();
  const rect = retrievalSlipTextRect(camera, slip, pose.workspaceOffset);
  const text = retrievalSlipText(slip.label, slip.excerpt, slip.reference);
  return (
    <div
      data-evidence-id={slip.id}
      data-location={slip.inAnswer ? 'answer' : 'library-or-transfer'}
      style={{
        position: 'absolute',
        left: rect.left,
        top: rect.top,
        width: RETRIEVAL_TYPE.width,
        opacity: slip.opacity,
        color: S.paperText,
        fontFamily: 'Inter',
        fontWeight: 700,
        fontKerning: 'none',
        fontVariantLigatures: 'none',
        whiteSpace: 'pre',
      }}
    >
      <div
        style={{
          fontSize: RETRIEVAL_TYPE.sourceSize,
          lineHeight: `${RETRIEVAL_TYPE.sourceLineHeight}px`,
        }}
      >
        {text.sourceLines.join('\n')}
      </div>
      <div
        style={{
          height: RETRIEVAL_TYPE.gap,
          borderTop: `2px solid ${S.paperText}`,
          opacity: pose.referenceEmphasis,
          boxSizing: 'border-box',
        }}
      />
      <div
        style={{
          fontSize: text.excerptSize,
          lineHeight: `${text.excerptLineHeight}px`,
        }}
      >
        {text.excerptLines.join('\n')}
      </div>
    </div>
  );
}

function LibraryLabels({
  scene,
  pose,
  camera,
}: {
  scene: Scene;
  pose: RetrievalGroundingPose;
  camera: CameraSpec;
}): React.ReactElement {
  const S = useStage();
  const wide = useWideStage();
  const library = projectToStage(camera, G.libraryLabel);
  const answer = projectToStage(camera, G.answerLabel);
  const [qx] = retrievalQuestionPosition(pose);
  const question = projectToStage(camera, [qx, -1.7, G.depth + 0.5]);
  const libraryPhase = retrievalLibraryCaption(pose);
  return (
    <div style={{ position: 'absolute', inset: 0, fontFamily: S.font, pointerEvents: 'none' }}>
      {scene.condition && (
        <TechText slot="condition" x={528} y={710} width={480} size={26} align="left">
          {scene.condition}
        </TechText>
      )}
      {/* Three labelled zones only; source names belong to their physical volumes/slips. */}
      <TechText x={library.x - 190} y={library.y - 36} width={380} size={32} align="center">
        {libraryPhase}
      </TechText>
      <TechText x={answer.x - 180} y={answer.y - 36} width={360} size={32} align="center">
        Answer workspace
      </TechText>
      {pose.slips.map((slip) => {
        const origin = projectToStage(camera, [
          G.libraryX,
          G.rows[slip.reference - 1],
          G.depth + 0.32,
        ]);
        return (
          <div
            key={slip.id}
            style={{
              position: 'absolute',
              left: origin.x - 132,
              top: origin.y - 30,
              width: 264,
              color: S.paperText,
              fontSize: 28,
              fontWeight: 700,
              lineHeight: 1.15,
              textAlign: 'center',
              overflowWrap: 'anywhere',
              opacity: Math.max(0, (slip.progress - 0.7) / 0.3),
            }}
          >
            [{slip.reference}] {slip.label}
          </div>
        );
      })}
      {pose.slips.map((slip) => (
        <SlipLabel key={slip.id} camera={camera} slip={slip} pose={pose} />
      ))}
      <TechText
        x={question.x - 198}
        y={question.y}
        width={396}
        size={26}
        align="center"
        opacity={pose.question.opacity}
      >
        Question: {scene.subject}
      </TechText>
      {wide ? (
        <>
          <WideStageText
            slot="outcome"
            text={scene.condition ? `Possible: ${scene.outcome}` : scene.outcome}
            size={34}
            opacity={pose.outcomeOpacity}
          />
          <WideStageText
            slot="evidence"
            text={
              scene.preset === 'no-evidence'
                ? 'Answer left empty.'
                : 'References show origin, not correctness.'
            }
            size={26}
            opacity={pose.outcomeOpacity}
          />
        </>
      ) : (
        <div
          style={{
            position: 'absolute',
            left: 72,
            top: 818,
            width: 936,
            paddingTop: 12,
            borderTop: `2px solid ${S.text}`,
            color: S.text,
            opacity: pose.outcomeOpacity,
          }}
        >
          <div style={{ fontSize: 34, fontWeight: 650, lineHeight: 1.15 }}>
            {scene.condition ? `Possible: ${scene.outcome}` : scene.outcome}
          </div>
          <div style={{ marginTop: 10, fontSize: 26, lineHeight: 1.15 }}>
            {scene.preset === 'no-evidence'
              ? 'Answer left empty.'
              : 'References show origin, not correctness.'}
          </div>
        </div>
      )}
    </div>
  );
}

/** One clay canvas; layout, backgrounds and transitions remain owned by the parent stage. */
export function RetrievalGroundingScene({ scene }: { scene: Scene }): React.ReactElement {
  const { t } = useSceneTime();
  const pose = retrievalGroundingPose(scene, t);
  const camera = retrievalGroundingCamera(scene, t);
  return (
    <MechanismStage
      title={scene.label}
      camera={camera}
      bobAmount={0}
      overlay={(sampled) => <LibraryLabels scene={scene} pose={pose} camera={sampled} />}
    >
      <DocumentLibrary pose={pose} />
      <AnswerWorkspace offset={pose.workspaceOffset} />
      <QuestionTicket pose={pose} />
      {pose.slips.map((slip) => (
        <EvidenceSlip key={slip.id} slip={slip} offset={pose.workspaceOffset} />
      ))}
    </MechanismStage>
  );
}
