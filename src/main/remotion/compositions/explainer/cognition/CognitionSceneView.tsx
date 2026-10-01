import type React from 'react';
import { ClayBlock, ExplanationStage } from '../explanation-kit';
import { EXPLANATION_EVIDENCE_TOP } from '../explanation-layout';
import { HouseModel } from '../spatial/HouseModel';
import { shade, useSceneTime, useStage } from '../stage';
import { TechText } from '../technology/primitives';
import {
  AllowanceMagazine,
  DeskTool,
  FoldedDocument,
  ModelHousing,
  PaperTray,
  PlanSheet,
  Reviewer,
  WorkDesk,
  WorkPress,
} from './models';
import {
  type BudgetPose,
  type CognitionPoint,
  type CognitionPose,
  type ConflictPose,
  cognitionPose,
  type EvaluationPose,
  type PaperPose,
  type PlanPose,
  revisedPlanPath,
  type TeamPose,
  type TrainingPose,
} from './poses';
import type { CognitionScene } from './types';

function Paper({
  pose,
  color,
  scale = 0.6,
  mark = 'lines',
  ink = 1,
}: {
  pose: PaperPose;
  color: string;
  scale?: number;
  mark?: React.ComponentProps<typeof FoldedDocument>['mark'];
  ink?: number;
}): React.ReactElement | null {
  if (!pose.visible) return null;
  return (
    <group position={pose.position} rotation={[pose.tilt, 0, 0]} scale={scale}>
      <FoldedDocument color={color} mark={mark} ink={ink} />
    </group>
  );
}

function Team({ pose }: { pose: TeamPose }): React.ReactElement {
  const S = useStage();
  const colors = [S.accent, S.text, shade(S.text, -0.5)];
  return (
    <group>
      {pose.preset === 'contractor-crew' && (
        // Same authored house as the property stories; its foundation remains on the floor.
        <group position={[0, -1.4 * (1 - 0.58), -2.6]} scale={0.58}>
          <HouseModel />
        </group>
      )}
      <group position={[0, 0, -1.25]}>
        <WorkDesk width={1.7} depth={1.2} />
        <group position={[-0.55, -0.38, -0.15]} scale={0.55}>
          <DeskTool variant="draft" color={S.accent} />
        </group>
      </group>
      {pose.desks.map((position, index) => (
        <group key={position[0]} position={position}>
          <WorkDesk />
          <group
            position={[-0.48, -0.4, -0.25]}
            rotation={[pose.toolAngle, 0, pose.toolAngle]}
            scale={0.7}
          >
            <DeskTool
              variant={
                pose.preset === 'contractor-crew'
                  ? index === 0
                    ? 'hammer'
                    : index === 1
                      ? 'draft'
                      : 'roller'
                  : 'draft'
              }
              color={colors[index]}
            />
          </group>
        </group>
      ))}
      {pose.papers.map((paper, index) => (
        <Paper
          key={pose.desks[index][0]}
          pose={paper}
          color={colors[index]}
          mark={pose.preset === 'contractor-crew' ? 'plan' : 'lines'}
          ink={0.3 + pose.work * 0.7}
          scale={0.65}
        />
      ))}
    </group>
  );
}

/** Length is authored; reveal scales the group rather than allocating geometry per frame. */
function PathBar({
  from,
  to,
  progress = 1,
  color,
}: {
  from: CognitionPoint;
  to: CognitionPoint;
  progress?: number;
  color: string;
}): React.ReactElement | null {
  if (progress <= 0) return null;
  const dx = to[0] - from[0];
  const dz = to[2] - from[2];
  const length = Math.hypot(dx, dz);
  return (
    <group position={[from[0], -0.335, from[2]]} rotation={[0, Math.atan2(dx, dz), 0]}>
      <group scale={[1, 1, progress]}>
        <ClayBlock
          size={[0.055, 0.035, length]}
          position={[0, 0, length / 2]}
          color={color}
          radius={0.012}
        />
      </group>
    </group>
  );
}

function Plan({ pose }: { pose: PlanPose }): React.ReactElement {
  const S = useStage();
  const lanes = pose.fixedX === null ? [pose.adaptiveX] : [pose.fixedX, pose.adaptiveX];
  const route = revisedPlanPath(pose.adaptiveX);
  return (
    <group>
      {lanes.map((x) => (
        <group key={x} position={[x, 0, 0]}>
          <WorkDesk width={2.75} depth={3.35} />
          <PlanSheet />
          {[-1.12, -0.8, -0.48, -0.16, 0.16, 0.48, 0.8, 1.12].map((z) => (
            <ClayBlock
              key={z}
              size={[0.045, 0.02, 0.16]}
              position={[0, -0.342, z]}
              color={shade(S.text, -0.5)}
              radius={0.009}
            />
          ))}
          {pose.information > 0 && (
            <group position={[0, -0.33, 0.04]} scale={[0.62, 0.62 * pose.information, 0.62]}>
              <group position={[0, 0.63, 0]}>
                <FoldedDocument color={S.text} mark="edit" />
              </group>
            </group>
          )}
        </group>
      ))}
      {route.slice(1).map((to, index) => (
        <PathBar
          key={`${to[0]}:${to[2]}`}
          from={route[index]}
          to={to}
          progress={Math.max(0, Math.min(1, pose.revision * 4 - index))}
          color={S.accent}
        />
      ))}
      <Paper
        pose={{ position: pose.adaptive, tilt: -Math.PI / 2, visible: true }}
        color={S.accent}
        scale={0.34}
        mark="plan"
      />
      {pose.fixed && (
        <Paper
          pose={{ position: pose.fixed, tilt: -Math.PI / 2, visible: true }}
          color={S.text}
          scale={0.34}
          mark="plan"
        />
      )}
    </group>
  );
}

function Budget({ pose }: { pose: BudgetPose }): React.ReactElement {
  const S = useStage();
  return (
    <group>
      <WorkDesk width={5.7} depth={2.1} />
      <group position={[-2.08, 0, 0]}>
        <AllowanceMagazine remaining={pose.remaining} />
      </group>
      <ClayBlock
        size={[0.94, 0.07, 0.24]}
        position={[-1.14, -0.35, 0.2]}
        color={shade(S.text, -0.5)}
      />
      <WorkPress press={pose.press} gate={pose.gate} />
      <Paper
        pose={{ position: pose.workPaper, tilt: -Math.PI / 2, visible: true }}
        color={S.accent}
        scale={0.57}
      />
      <group position={[1.76, -0.4, -0.3]} scale={0.6}>
        <DeskTool variant="draft" color={S.text} />
      </group>
      {pose.preset === 'request-more' && (
        <group>
          {/* An outbound letter holder, never a replenishment or a granted request. */}
          <ClayBlock size={[0.88, 0.13, 0.68]} position={[0, 0.27, -1.4]} color={S.cardRaised} />
          <ClayBlock
            size={[0.15, 1.6, 0.18]}
            position={[0, -0.58, -1.6]}
            color={shade(S.text, -0.5)}
          />
          <ClayBlock size={[0.78, 0.62, 0.09]} position={[0, 0.55, -1.66]} color={S.card} />
          <Paper
            pose={{ position: pose.requestPaper, tilt: -0.1, visible: pose.request > 0 }}
            color={S.text}
            scale={0.52}
          />
        </group>
      )}
    </group>
  );
}

function Training({ pose }: { pose: TrainingPose }): React.ReactElement {
  const S = useStage();
  return (
    <group>
      <ModelHousing
        change={pose.modelChange}
        correction={pose.correctionChange}
        trainingClosed={pose.trainingClosed}
      />
      {[-2.2, 2.2].map((x) => (
        <group key={x} position={[x, 0, 0]}>
          <ClayBlock size={[0.9, 0.12, 0.86]} position={[0, -0.82, 0.18]} color={S.cardRaised} />
          <ClayBlock
            size={[0.14, 0.52, 0.16]}
            position={[0, -1.12, 0]}
            color={shade(S.text, -0.5)}
          />
          <ClayBlock size={[0.78, 0.1, 0.7]} position={[0, -1.35, 0]} color={shade(S.text, -0.5)} />
          {x < 0 && (
            <>
              <ClayBlock size={[0.9, 0.09, 0.78]} position={[0, 0, -0.03]} color={S.cardRaised} />
              <ClayBlock
                size={[0.09, 0.85, 0.09]}
                position={[-0.39, -0.4, -0.3]}
                color={shade(S.text, -0.5)}
              />
              <ClayBlock
                size={[0.09, 0.85, 0.09]}
                position={[0.39, -0.4, -0.3]}
                color={shade(S.text, -0.5)}
              />
            </>
          )}
        </group>
      ))}
      <Paper pose={pose.example} color={S.accent} scale={0.5} />
      <Paper pose={pose.correction} color={S.accent} mark="edit" scale={0.5} />
      <Paper pose={pose.input} color={S.text} scale={0.44} />
      <Paper pose={pose.output} color={S.text} scale={0.44} />
    </group>
  );
}

function Evaluation({ pose }: { pose: EvaluationPose }): React.ReactElement {
  const S = useStage();
  return (
    <group>
      <group position={[0, 0, -0.35]}>
        <WorkDesk width={5.15} depth={1.55} />
      </group>
      <ClayBlock size={[1.25, 0.1, 0.45]} position={[0, 0.06, -1.2]} color={S.cardRaised} />
      <ClayBlock size={[1.25, 0.55, 0.1]} position={[0, 0.35, -1.4]} color={shade(S.text, -0.5)} />
      {[-0.5, 0.5].map((x) => (
        <ClayBlock
          key={x}
          size={[0.09, 0.45, 0.09]}
          position={[x, -0.22, -1.3]}
          color={shade(S.text, -0.5)}
        />
      ))}
      {pose.benches.map((bench, benchIndex) => (
        <group key={bench.x}>
          <group position={[bench.x, 0.428, -0.35]} scale={0.62}>
            <ModelHousing />
          </group>
          <group position={[bench.x, 0, 1.2]}>
            <PaperTray width={1.75} />
          </group>
          {pose.separation > 0 && (
            <group position={[bench.x, -1.1, 1.2]} scale={[1, pose.separation, 1]}>
              <ClayBlock
                size={[0.06, 0.38, 0.96]}
                position={[0, 0.19, 0]}
                color={shade(S.text, -0.5)}
                radius={0.02}
              />
            </group>
          )}
          {bench.papers.map(
            (paper, index) =>
              // One common test pack fans into both benches; don't double-draw coincident masters.
              (benchIndex === 0 || pose.tests[index] > 0) && (
                <Paper
                  key={index === 0 ? 'first-criterion' : 'second-criterion'}
                  pose={paper}
                  color={index === 0 ? S.accent : S.text}
                  scale={0.48}
                />
              ),
          )}
        </group>
      ))}
    </group>
  );
}

function Conflict({ pose }: { pose: ConflictPose }): React.ReactElement {
  const S = useStage();
  return (
    <group>
      <WorkDesk width={5.65} depth={3.1} />
      {pose.preset === 'human-review' && (
        <group position={[0, 0, -1.62]}>
          <Reviewer />
        </group>
      )}
      {pose.divider > 0 && (
        <group position={[0, -0.43, 0.1]} scale={[1, pose.divider, 1]}>
          <ClayBlock
            size={[0.075, 0.75, 2.5]}
            position={[0, 0.375, 0]}
            color={shade(S.text, -0.5)}
            radius={0.025}
          />
        </group>
      )}
      {pose.papers.map((paper, index) => (
        <Paper
          key={index === 0 ? 'first-source' : 'second-source'}
          pose={paper}
          color={index === 0 ? S.accent : S.text}
          mark={index === 0 ? 'left' : 'right'}
          scale={0.74}
        />
      ))}
    </group>
  );
}

function Assembly({ pose }: { pose: CognitionPose }): React.ReactElement {
  switch (pose.kind) {
    case 'agent-team':
      return <Team pose={pose} />;
    case 'agent-plan':
      return <Plan pose={pose} />;
    case 'agent-budget':
      return <Budget pose={pose} />;
    case 'model-training':
      return <Training pose={pose} />;
    case 'model-evaluation':
      return <Evaluation pose={pose} />;
    case 'evidence-conflict':
      return <Conflict pose={pose} />;
  }
}

function railLabels(scene: CognitionScene): string[] {
  switch (scene.kind) {
    case 'agent-team':
      return scene.roles.slice(0, 3);
    case 'agent-plan':
      return [scene.obstacleLabel, scene.revisedLabel];
    case 'agent-budget':
      return [scene.resourceLabel, scene.actionLabel];
    case 'model-training':
      return [scene.exampleLabel, scene.inputLabel];
    case 'model-evaluation':
      return scene.approaches.slice(0, 2);
    case 'evidence-conflict':
      return [];
  }
}

/** A single existing studio canvas; labels and outcomes are exclusively source-backed fields. */
export function CognitionSceneView({ scene }: { scene: CognitionScene }): React.ReactElement {
  const { t } = useSceneTime();
  const S = useStage();
  const pose = cognitionPose(scene, t);
  return (
    <>
      <ExplanationStage scene={scene} labels={railLabels(scene)}>
        <Assembly pose={pose} />
      </ExplanationStage>
      <TechText x={100} y={scene.condition ? 224 : 188} width={880} size={30} align="center">
        {scene.subject}
      </TechText>
      {scene.kind === 'model-evaluation' && (
        <TechText x={100} y={scene.condition ? 264 : 230} width={880} size={28} align="center">
          {scene.criteria.slice(0, 2).join(' · ')}
        </TechText>
      )}
      {scene.kind === 'evidence-conflict' &&
        scene.sources.slice(0, 2).map((source, index) => (
          <TechText
            key={source}
            x={index === 0 ? 90 : 580}
            y={EXPLANATION_EVIDENCE_TOP}
            width={410}
            size={26}
            align="center"
          >
            <div
              style={{
                fontWeight: 750,
                borderTop: `4px solid ${index === 0 ? S.accent : S.text}`,
                paddingTop: 8,
              }}
            >
              {source}
            </div>
            <div style={{ fontSize: 24, marginTop: 8 }}>{scene.claims[index]}</div>
          </TechText>
        ))}
    </>
  );
}
