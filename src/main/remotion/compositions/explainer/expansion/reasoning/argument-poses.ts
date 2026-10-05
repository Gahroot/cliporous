import { diagramPose } from '../../diagrams/motion';
import { EXPLANATION_CAMERA } from '../../explanation-layout';
import { cameraRig, projectToStage } from '../../three-helpers';
import type { ExpansionKitPose } from '../scene-types';
import type { ExpansionReasoningArgumentScene } from './argument-types';

export interface ArgumentStationPose {
  readonly id: string;
  readonly actorId: string;
  readonly x: number;
  readonly y: number;
  readonly reveal: number;
}
export interface ArgumentPose extends ExpansionKitPose {
  readonly stations: readonly ArgumentStationPose[];
  readonly conditionHighlight: number;
  readonly detailIndex: number;
}

export interface ArgumentTextRun {
  readonly id: string;
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly columns: number;
  readonly opacity: number;
}

/** Breaks only for presentation: concatenating lines recovers every source character. */
export function argumentLines(text: string, columns: number): string[] {
  const chars = Array.from(text);
  const lines: string[] = [];
  for (let i = 0; i < chars.length; i += columns) lines.push(chars.slice(i, i + columns).join(''));
  return lines.length ? lines : [''];
}

export function argumentModelPosition(index: number): [number, number, number] {
  return [index % 2 === 0 ? -1.9 : 1.9, index < 2 ? 1.25 : -0.15, 0];
}

/** Same static camera and authored y-turn as the actual HybridStage, including native viewport. */
export function argumentModelAnchor(
  scene: ExpansionReasoningArgumentScene,
  t: number,
  index: number,
  viewport = { x: 0, y: 0, width: 1080, height: 960 },
): { x: number; y: number } {
  const time = Number.isFinite(t) ? t : 0;
  const turn = diagramPose(time, scene, 'action').modelTurn;
  const [x, y, z] = argumentModelPosition(index);
  const rotated: [number, number, number] = [
    x * Math.cos(turn) + z * Math.sin(turn),
    y,
    z * Math.cos(turn) - x * Math.sin(turn),
  ];
  const camera = cameraRig(EXPLANATION_CAMERA, time, { driftDeg: 0, pushAmount: 0, bobAmount: 0 });
  const point = projectToStage(camera, rotated, viewport.width, viewport.height);
  return { x: viewport.x + point.x, y: viewport.y + point.y };
}

/** The approved five-clause parser admits at most four proposition clauses plus resolution.
 * Persistent tree context stays above an authored, beat-selected quotation lens. */
export function argumentTextRuns(
  scene: ExpansionReasoningArgumentScene,
  pose: ArgumentPose,
): ArgumentTextRun[] {
  const entity = (id: string): string =>
    scene.entities.find((entry) => entry.id === id)?.label ?? id;
  const runs: ArgumentTextRun[] = [];
  const add = (
    id: string,
    text: string,
    x: number,
    y: number,
    size: number,
    columns: number,
    opacity: number,
  ): void => {
    runs.push({ id, text, x, y, size, columns, opacity });
  };
  for (const [index, station] of pose.stations.entries()) {
    const x = station.x + 12;
    if (scene.kind === 'argument-map') {
      const edge = scene.edges.find((entry) => entry.fromId === station.id);
      add(`${station.id}-id`, station.id, x, station.y + 22, 20, 21, station.reveal);
      add(
        `${station.id}-relation`,
        edge ? `${edge.role} → ${edge.toId}` : 'claim',
        x,
        station.y + 48,
        18,
        23,
        station.reveal,
      );
      add(
        `${station.id}-state`,
        edge ? `${edge.state}${edge.qualifier ? ` · ${edge.qualifier}` : ''}` : scene.resolution,
        x,
        station.y + 102,
        20,
        21,
        station.reveal,
      );
    } else {
      add(`${station.id}-id`, station.id, x, 26, 20, 21, station.reveal);
      add(`${station.id}-actor-id`, station.actorId, x, 52, 20, 21, station.reveal);
      add(
        `${station.id}-labels`,
        `${entity(station.id)} · ${entity(station.actorId)}`,
        x,
        88,
        22,
        19,
        station.reveal,
      );
      add(`${station.id}-quote`, scene.effects[index].text, x, 210, 24, 17, station.reveal);
      add(`${station.id}-resolution`, scene.resolution, x, 440, 24, 17, pose.resolve);
    }
  }
  if (scene.kind === 'argument-map') {
    const node = scene.nodes[pose.detailIndex];
    const station = pose.stations[pose.detailIndex];
    add(
      `${node.entityId}-lens-label`,
      `${entity(node.entityId)} · ${entity(node.actorId)}`,
      28,
      266,
      22,
      40,
      station.reveal,
    );
    add(`${node.entityId}-lens-quote`, node.statement, 28, 338, 26, 34, station.reveal);
    add(`${node.entityId}-lens-id`, `actor: ${node.actorId}`, 28, 464, 20, 44, station.reveal);
  }
  return runs;
}

/** Fixed two-column source ledger; positions never depend on source string geometry. */
export function argumentPose(scene: ExpansionReasoningArgumentScene, t: number): ArgumentPose {
  const time = Number.isFinite(t) ? t : 0;
  const ramp = (at: number): number => {
    const u = Math.max(0, Math.min(1, (time - at) / 0.24));
    return u * u * (3 - 2 * u);
  };
  const setup = ramp(scene.setupAt);
  const action = ramp(scene.actionAt);
  const response = ramp(scene.responseAt);
  const check = ramp(scene.checkAt);
  const resolve = ramp(scene.resolveAt);
  const records =
    scene.kind === 'argument-map'
      ? scene.nodes.map((node) => ({ id: node.entityId, actorId: node.actorId }))
      : scene.effects.map((effect) => ({ id: effect.alternativeId, actorId: effect.actorId }));
  return {
    reveal: setup,
    action,
    response,
    check,
    resolve,
    conditionHighlight: action * (1 - resolve),
    detailIndex:
      scene.kind === 'argument-map' && time < scene.resolveAt
        ? Math.min(
            records.length - 1,
            time >= scene.checkAt
              ? 3
              : time >= scene.responseAt
                ? 2
                : time >= scene.actionAt
                  ? 1
                  : 0,
          )
        : 0,
    stations: records.map((record, index) => ({
      ...record,
      x: index % 2 === 0 ? 16 : 492,
      y: Math.floor(index / 2) * 116 + 4,
      reveal:
        scene.kind === 'conditional-comparison'
          ? action
          : index === 0
            ? setup
            : index === 1
              ? action
              : index === 2
                ? response
                : check,
    })),
  };
}
