import type { ReactElement } from 'react';
import { useWideStage } from '../../stage';
import { type CameraSpec, worldUnitsPerPixel } from '../../three-helpers';
import { EvidenceDocumentClay } from '../kits/evidence';
import { TemporalTaskClay } from '../kits/temporal';
import type { ExpansionKitColors } from '../scene-types';
import { type RankingCalendarPose, rankingCalendarRecords } from './ranking-calendar-poses';
import type { ExpansionRankingCalendarScene } from './ranking-calendar-types';

export const RANKING_CALENDAR_CAMERA: CameraSpec = { position: [0, 0, 10], fov: 48 };
export function rankingCalendarModelPlacement(
  index: number,
  wide?: { width: number; height: number },
) {
  const width = wide?.width ?? 1080;
  const height = wide?.height ?? 960;
  const meet = wide ? Math.min(width / 952, height / 478) : 1;
  const x = wide ? (width - 952 * meet) / 2 + (140 + index * 240) * meet : 204 + index * 240;
  const y = wide ? (height - 478 * meet) / 2 + 424 * meet : 686;
  const units = worldUnitsPerPixel(RANKING_CALENDAR_CAMERA, height);
  return {
    position: [(x - width / 2) * units, (height / 2 - y) * units, 0] as [number, number, number],
    scale: 24 * units * meet,
  };
}
/** No 3D numeric text or invented winners. These are source sheets and period carriers. */
export function RankingCalendarModels({
  scene,
  pose,
  colors,
}: {
  scene: ExpansionRankingCalendarScene;
  pose: RankingCalendarPose;
  colors: ExpansionKitColors;
}): ReactElement {
  const wide = useWideStage();
  const record = rankingCalendarRecords(scene)[pose.record];
  const placement = (i: number) => rankingCalendarModelPlacement(i, wide?.model);
  const document = (id: string, index: number) => {
    const p = placement(index);
    return (
      <group key={id} position={p.position} scale={p.scale}>
        <EvidenceDocumentClay
          id={id}
          label={scene.label}
          source={scene.subject}
          pose={pose}
          state="retained"
          colors={colors}
          placement={{ position: [0, 0, 0] }}
        />
      </group>
    );
  };
  return (
    <group rotation={[0, -pose.turn, 0]} userData={{ sourceRecord: record.id }}>
      {scene.storyId === '21' ? (
        scene.states.map((s, i) => {
          const paired = s.records.find((r) => r.actorId === record.actorId);
          if (!paired) throw new Error('Missing paired identity');
          return document(paired.id, i);
        })
      ) : (
        <>
          {document(record.id, 0)}
          <group position={placement(1).position} scale={placement(1).scale}>
            <TemporalTaskClay
              interval={{
                id: record.id,
                label: 'Supplied period',
                kind: 'qualitative',
                qualifier: record.quantity.basis.period,
              }}
              domain={[
                { numerator: 0, denominator: 1 },
                { numerator: 1, denominator: 1 },
              ]}
              pose={pose}
              state="retained"
              colors={colors}
              position={[0, 0, 0]}
            />
          </group>
        </>
      )}
    </group>
  );
}
