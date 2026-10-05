import type { ReactElement } from 'react';
import { PopulationTrayClay, SamplingApertureClay } from '../kits/population';
import type { ExpansionKitColors, ExpansionKitPose } from '../scene-types';
import {
  type ConditioningSamplingViewport,
  conditioningSamplingModelPlacement,
  conditioningSamplingPage,
  conditioningSamplingPages,
  conditioningSamplingView,
} from './conditioning-sampling-poses';
import type { ExpansionConditioningSamplingScene } from './conditioning-sampling-types';

/** All labels, rates, denominators and qualifiers belong to the planar companion. */
export function ConditioningSamplingModels({
  scene,
  pose,
  colors,
  t,
  viewport,
  turn = 0,
}: {
  scene: ExpansionConditioningSamplingScene;
  pose: ExpansionKitPose;
  colors: ExpansionKitColors;
  t: number;
  viewport?: ConditioningSamplingViewport;
  turn?: number;
}): ReactElement {
  const rows = conditioningSamplingView(scene);
  const focus = conditioningSamplingPages(scene)[conditioningSamplingPage(t, scene)].rowIndex;
  return (
    <group name={`conditioning-sampling-${scene.storyId}`} rotation={[0, -turn, 0]}>
      {rows.map((row, index) => {
        const anchor = conditioningSamplingModelPlacement(index, rows.length, viewport);
        const placement = { position: [0, 0, 0] as const, scale: 1 };
        const props = { pose, colors, state: row.state, placement };
        return (
          <group key={row.id} {...anchor} visible={index === focus}>
            {row.population ? (
              <PopulationTrayClay
                {...props}
                {...row.population}
                aperture={{ window: 'all', membership: row.groupId }}
              />
            ) : (
              <SamplingApertureClay {...props} window="all" membership={row.groupId} />
            )}
          </group>
        );
      })}
    </group>
  );
}
