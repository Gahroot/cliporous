import type { ReactElement } from 'react';
import { useStage } from '../../stage';
import { PopulationMarkSvg, populationGridPosition, SamplingApertureSvg } from '../kits/population';
import type { ExpansionKitColors, ExpansionKitPose } from '../scene-types';
import {
  CONDITIONING_SAMPLING_COLUMNS,
  CONDITIONING_SAMPLING_CONTEXT_COLUMNS,
  CONDITIONING_SAMPLING_FONT,
  conditioningSamplingContext,
  conditioningSamplingPage,
  conditioningSamplingPages,
  conditioningSamplingPlacement,
  conditioningSamplingView,
} from './conditioning-sampling-poses';
import type { ExpansionConditioningSamplingScene } from './conditioning-sampling-types';

function Lines({
  text,
  x,
  y,
  colors,
  columns = CONDITIONING_SAMPLING_COLUMNS,
  fieldId,
}: {
  text: string;
  x: number;
  y: number;
  colors: ExpansionKitColors;
  columns?: number;
  fieldId?: string;
}): ReactElement {
  const { font } = useStage();
  const chars = Array.from(text);
  const lines: { id: string; text: string; y: number }[] = [];
  for (let offset = 0; offset < chars.length; offset += columns) {
    lines.push({
      id: `offset-${offset}`,
      text: chars.slice(offset, offset + columns).join(''),
      y: y + (offset / columns) * 26,
    });
  }
  return (
    <text
      x={x}
      y={y}
      fontFamily={font}
      fontSize={CONDITIONING_SAMPLING_FONT}
      fill={colors.text}
      data-essential-field={fieldId}
    >
      {lines.map((line) => (
        <tspan key={line.id} x={x} y={line.y}>
          {line.text}
        </tspan>
      ))}
    </text>
  );
}
type Props = {
  scene: ExpansionConditioningSamplingScene;
  pose: ExpansionKitPose;
  colors: ExpansionKitColors;
  t: number;
};

/** A real frame-selected tray/aperture detail; all hidden geometries remain accounted. */
export function ConditioningSamplingDiagram({ scene, pose, colors, t }: Props): ReactElement {
  const rows = conditioningSamplingView(scene);
  const focus = conditioningSamplingPages(scene)[conditioningSamplingPage(t, scene)].rowIndex;
  return (
    <g data-conditioning-sampling-diagram={scene.storyId}>
      {rows.map((row, index) => {
        const p = conditioningSamplingPlacement(index, rows.length);
        const props = {
          pose,
          colors,
          state: row.state,
          placement: { position: [p.trayX, p.trayY, 0] as const, scale: p.trayScale },
        };
        return (
          <g key={row.id} data-group-id={row.groupId} opacity={index === focus ? 1 : 0}>
            <rect
              x={p.trayX - 254 * p.trayScale}
              y={p.trayY - 254 * p.trayScale}
              width={508 * p.trayScale}
              height={508 * p.trayScale}
              rx={5}
              fill={colors.surface}
              stroke={colors.muted}
              opacity={pose.reveal}
            />
            {row.population?.marks.map((member, slot) => {
              const [x, y] = populationGridPosition(slot);
              return (
                <PopulationMarkSvg
                  key={member.id}
                  {...props}
                  member={member}
                  state={member.state}
                  placement={{
                    position: [p.trayX + x * 100 * p.trayScale, p.trayY - y * 100 * p.trayScale, 0],
                    scale: p.trayScale,
                  }}
                />
              );
            })}
            <SamplingApertureSvg {...props} window="all" membership={row.groupId} />
          </g>
        );
      })}
    </g>
  );
}

/** Every essential source string is planar at 22px. No scaling or clipped text.
 * Counts/aggregation legends use exact kit data; fractional weights never become people.
 * All pages remain mounted, but only the frame-selected detail is visible. */
export function ConditioningSamplingFacts({ scene, pose, colors, t }: Props): ReactElement {
  const rows = conditioningSamplingView(scene);
  const pages = conditioningSamplingPages(scene);
  const active = conditioningSamplingPage(t, scene);
  return (
    <g data-conditioning-sampling-facts={scene.storyId}>
      {pages.map((page, pageIndex) => {
        const row = rows[page.rowIndex];
        const context = conditioningSamplingContext(scene, row);
        const contextIds = [
          'owner-frame',
          'denominator-context',
          'identity-inclusion',
          'measurement-state',
        ];
        let contextY = 26;
        const contextLines = context.map((text, index) => {
          const line = { text, id: contextIds[index], y: contextY };
          contextY +=
            Math.ceil(Array.from(text).length / CONDITIONING_SAMPLING_CONTEXT_COLUMNS) * 26;
          return line;
        });
        let y = Math.max(160, contextY);
        const fields = page.fields.map((field) => {
          const placement = { field, y };
          y += Math.ceil(Array.from(field.text).length / CONDITIONING_SAMPLING_COLUMNS) * 26;
          return placement;
        });
        return (
          <g
            key={page.id}
            data-page-id={page.id}
            data-source-identity={row.groupId}
            data-measurement-state={row.quantity?.state ?? 'not supplied'}
            data-active-page={pageIndex === active ? 'true' : 'false'}
            opacity={pageIndex === active ? pose.reveal : 0}
          >
            {contextLines.map((line) => (
              <Lines
                key={line.id}
                text={line.text}
                x={20}
                y={line.y}
                columns={CONDITIONING_SAMPLING_CONTEXT_COLUMNS}
                colors={colors}
                fieldId={line.id}
              />
            ))}
            {fields.map(({ field, y: baseline }) => (
              <Lines
                key={field.id}
                fieldId={field.sourceId}
                text={field.text}
                x={260}
                y={baseline}
                colors={colors}
              />
            ))}
            <Lines
              text={`Detail ${pageIndex + 1} / ${pages.length}`}
              x={20}
              y={458}
              columns={CONDITIONING_SAMPLING_CONTEXT_COLUMNS}
              colors={colors}
              fieldId="page-position"
            />
          </g>
        );
      })}
    </g>
  );
}
