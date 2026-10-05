import { diagramPose } from '../../diagrams/motion';
import { EXPLANATION_CAMERA } from '../../explanation-layout';
import { cameraRig, projectToStage } from '../../three-helpers';
import type { ExpansionKitPose } from '../scene-types';
import type { ExpansionReasoningInformationScene } from './information-types';

export interface InformationPose extends ExpansionKitPose {
  readonly entities: readonly { readonly id: string; readonly reveal: number }[];
  readonly records: readonly { readonly id: string; readonly reveal: number }[];
  readonly time: number;
  readonly detailIndex: number;
}

/** Beat-local, bounded and stateless. Earlier context never disappears. */
export function informationPose(
  scene: ExpansionReasoningInformationScene,
  t: number,
): InformationPose {
  const time = Number.isFinite(t) ? t : 0;
  const progress = (at: number): number =>
    time >= at + 0.2 ? 1 : Math.max(0, Math.min(1, (time - at) / 0.2));
  const reveal = progress(scene.setupAt);
  const action = progress(scene.actionAt);
  const response = progress(scene.responseAt);
  const check = progress(scene.checkAt);
  const resolve = progress(scene.resolveAt);
  let detailIndex = 0;
  if (scene.storyId === '06') {
    const known = scene.records
      .map((record, index) => ({ record, index }))
      .filter(({ record }) => record.state === 'known');
    if (time >= scene.resolveAt)
      detailIndex = scene.records.findIndex((record) => record.id === scene.focusRecordId);
    else if (time >= scene.responseAt)
      detailIndex = Math.min(
        scene.records.length - 1,
        Math.floor(
          Math.max(0, (time - scene.responseAt) / (scene.resolveAt - scene.responseAt)) *
            scene.records.length,
        ),
      );
    else
      detailIndex =
        known[
          Math.min(
            known.length - 1,
            Math.floor(
              Math.max(0, (time - scene.actionAt) / (scene.responseAt - scene.actionAt)) *
                known.length,
            ),
          )
        ].index;
  }
  return {
    reveal,
    action,
    response,
    check,
    resolve,
    time: Math.min(time, scene.resolveAt + 0.2),
    detailIndex,
    entities: scene.entities.map((entity) => ({
      id: entity.id,
      reveal: scene.storyId === '05' && entity.id === scene.factor.entityId ? response : reveal,
    })),
    records:
      scene.storyId === '06'
        ? scene.records.map((record) => ({
            id: record.id,
            reveal: record.state === 'known' ? action : response,
          }))
        : [],
  };
}

export function informationModelPosition(
  scene: ExpansionReasoningInformationScene,
  index: number,
): [number, number, number] {
  return scene.storyId === '05'
    ? [(index - 1) * 2, 0, 0]
    : [((index % 4) - 1.5) * 1.65, 1.2 - Math.floor(index / 4) * 0.95, 0];
}

/** Mirrors HybridStage's authored Y rotation and Stage3D's static rig; viewport is the actual model rectangle. */
export function informationModelProjection(
  scene: ExpansionReasoningInformationScene,
  t: number,
  index: number,
  width = 1080,
  height = 960,
): { x: number; y: number } {
  const angle = diagramPose(t, scene, 'action').modelTurn;
  const [x, y, z] = informationModelPosition(scene, index);
  const camera = cameraRig(EXPLANATION_CAMERA, t, {
    focusAt: scene.actionAt,
    driftDeg: 0,
    pushAmount: 0,
    bobAmount: 0,
  });
  return projectToStage(
    camera,
    [x * Math.cos(angle) + z * Math.sin(angle), y, z * Math.cos(angle) - x * Math.sin(angle)],
    width,
    height,
  );
}

/** Fixed planar stations; labels do not move semantic identities. */
export function informationStation(index: number): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  if (!Number.isInteger(index) || index < 0 || index >= 12)
    throw new RangeError('Information station index');
  return { x: 8 + (index % 4) * 236, y: 42 + Math.floor(index / 4) * 132, width: 228, height: 128 };
}

export const INFORMATION_VARIABLE_POINTS = [
  { x: 180, y: 120 },
  { x: 772, y: 120 },
  { x: 476, y: 260 },
] as const;
