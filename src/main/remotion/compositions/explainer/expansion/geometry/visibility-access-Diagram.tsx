import type { ReactElement } from 'react';
import { UI_FONT, useStage } from '../../stage';
import type { ExpansionKitColors } from '../scene-types';
import {
  connectionState,
  currentFact,
  relatedFact,
  type VisibilityAccessPose,
} from './visibility-access-poses';
import type { ExpansionVisibilityAccessScene } from './visibility-access-types';

function sourceLines(lines: readonly string[], sourceId: string): { id: string; text: string }[] {
  return lines.map((text, row) => ({ id: `${sourceId}:line:${row}`, text }));
}

/** Hook-free planar body: the identical facts/qualifications persist in both modes. */
export function VisibilityAccessDiagramBody({
  scene,
  pose,
  colors,
}: {
  scene: ExpansionVisibilityAccessScene;
  pose: VisibilityAccessPose;
  colors: ExpansionKitColors;
}): ReactElement {
  const page = pose.pages[pose.page];
  const f = currentFact(scene, pose);
  const text = (s: string, x: number, y: number) => (
    <text x={x} y={y} fontSize={22} fontFamily={UI_FONT} fill={colors.text}>
      {s}
    </text>
  );
  const ref = (id: string) => `Entity ${scene.entities.findIndex((e) => e.id === id) + 1}`;
  const state = (role: string) => {
    const matching = relatedFact(scene, f, role);
    return matching
      ? `${matching.state}: ${'value' in matching ? (matching.value ?? matching.state) : matching.state}`
      : 'not supplied';
  };
  return (
    <g data-page={pose.page} data-page-id={page.id} data-fact-id={f.id} data-state={f.state}>
      {scene.storyId === '61' && 'targetId' in f ? (
        <g
          data-asset="robot-target-occluder"
          data-observer-id={f.actorId}
          data-target-id={f.targetId}
        >
          {text(`${scene.viewpoint} schematic`, 12, 30)}
          {text('Target: identity reference', 12, 64)}
          <g data-carrier="wheeled-camera-robot" stroke={colors.text} strokeWidth={2} fill="none">
            <rect x={32} y={150} width={74} height={35} rx={8} />
            <circle cx={47} cy={190} r={12} />
            <circle cx={92} cy={190} r={12} />
            <path d="M70 150V130" />
            <rect x={40} y={94} width={60} height={36} rx={8} />
            <circle cx={56} cy={111} r={6} />
            <circle cx={83} cy={111} r={6} />
          </g>
          <path d="M106 112H295" stroke={colors.muted} strokeWidth={2} strokeDasharray="6 6" />
          <rect
            data-carrier="authored-occluder"
            x={205}
            y={75}
            width={scene.template === 'robot-box' ? 52 : 18}
            height={128}
            fill={colors.muted}
            fillOpacity={0.3}
            stroke={colors.text}
          />
          <g
            data-carrier="parcel-target-reference"
            stroke={colors.accent}
            strokeWidth={2}
            fill="none"
            strokeDasharray="5 4"
          >
            <rect x={335} y={108} width={66} height={62} />
            <path d="M364 108V170M335 137H401" />
          </g>
          {text(ref(f.actorId), 12, 240)}
          {text('occluderId' in f ? ref(f.occluderId) : 'Occluder ref', 184, 240)}
          {text(ref(f.targetId), 342, 240)}
          {text('Existence', 12, 292)}
          {text(state('existence'), 12, 320)}
          {text('Visibility', 12, 360)}
          {text(state('visibility'), 12, 388)}
          {text('Hidden is not absent', 12, 438)}
          {text('No computed field of view', 12, 466)}
        </g>
      ) : (
        <g data-asset="gate-courtyard-route" data-permission-evaluated="false">
          {text('Authored local route', 12, 30)}
          {text('Gate: neutral reference', 12, 64)}
          <path
            data-carrier="route"
            data-connection={connectionState(scene, f)}
            d={
              connectionState(scene, f) === 'disconnected'
                ? 'M48 156H148M236 156H400'
                : 'M48 156H400'
            }
            strokeDasharray={connectionState(scene, f) === 'reference' ? '12 12' : undefined}
            stroke={colors.muted}
            strokeWidth={12}
            fill="none"
          />
          <g data-carrier="gate" stroke={colors.text} strokeWidth={3} fill="none">
            <path d="M144 190V85H220V190M160 85V180M182 85V180M204 85V180" />
          </g>
          <path
            data-carrier="courtyard"
            d="M324 108H416V196H324Z M324 108V82H416V108"
            stroke={colors.text}
            strokeWidth={3}
            fill="none"
          />
          <g data-carrier="traveler" stroke={colors.accent} strokeWidth={3} fill="none">
            <circle cx={58} cy={95} r={12} />
            <path d="M58 108V142M42 122H74M58 142L42 165M58 142L74 165" />
          </g>
          {text('Connection', 12, 246)}
          {text(state('route'), 12, 274)}
          {text('Permission', 12, 314)}
          {text(state('permission'), 12, 342)}
          {text('Supplied reachability', 12, 382)}
          {text(state('reachability'), 12, 410)}
          {text('Connection implies neither', 12, 438)}
          {text('Unknown is not denied', 12, 466)}
        </g>
      )}
      {sourceLines(page.lines, page.id).map((line, i) => (
        <g key={line.id}>{text(line.text, 492, 38 + i * 28)}</g>
      ))}
    </g>
  );
}
export function VisibilityAccessDiagram({
  scene,
  pose,
}: {
  scene: ExpansionVisibilityAccessScene;
  pose: VisibilityAccessPose;
}): ReactElement {
  const S = useStage();
  return (
    <VisibilityAccessDiagramBody
      scene={scene}
      pose={pose}
      colors={{ surface: S.card, text: S.text, accent: S.accent, muted: S.muted }}
    />
  );
}
