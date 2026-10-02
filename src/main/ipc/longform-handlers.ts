import { randomUUID } from 'node:crypto';
import { rmdir, stat, unlink } from 'node:fs/promises';
import { dirname, isAbsolute } from 'node:path';
import { Ch } from '@shared/ipc-channels';
import { findLongformPalette, validLongformPalettes } from '@shared/longform-palette';
import {
  isSceneFirstPlanEnvelope,
  type LongformGenerationRequest,
  type LongformScenePreviewRequest,
  validLongformWords,
} from '@shared/longform-scenes';
import { isStoryboardStyle } from '@shared/storyboards';
import type { LongformEditPlan, WordTimestamp } from '@shared/types';
import { type IpcMainInvokeEvent, ipcMain, type WebContents } from 'electron';
import { generateLongformEditPlan } from '../ai/longform-edit-plan';
import { validateSceneFirstLongformPlan } from '../ai/longform-scene-contract';
import { generateSceneFirstLongformPlan } from '../ai/longform-scenes';
import { getVideoMetadata } from '../ffmpeg';
import { wrapHandler } from '../ipc-error-handler';
import { log } from '../logger';
import { renderLongformScenePreview } from '../render/longform-scene-render';

interface OwnedRequest {
  id: string;
  controller: AbortController;
  finished: Promise<void>;
  finish: () => void;
  waiting: boolean;
}

function ownedRequest(id: string): OwnedRequest {
  let finish: () => void = () => undefined;
  const finished = new Promise<void>((resolve) => {
    finish = resolve;
  });
  return { id, controller: new AbortController(), finished, finish, waiting: false };
}
interface LongformOwner {
  generation?: OwnedRequest;
  preview?: OwnedRequest;
  previews: Set<string>;
}

type GenerationOptions = Pick<
  LongformGenerationRequest,
  'requestId' | 'mode' | 'storyboardStyle' | 'previousPlan' | 'preservedSceneIds' | 'sectionIds'
>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validRequestId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,120}$/.test(value);
}

function stringList(value: unknown, maximum: number, length: number): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= maximum &&
    value.every((entry) => typeof entry === 'string' && entry.length <= length)
  );
}

function assertMainFrame(event: IpcMainInvokeEvent): void {
  if (
    !event.senderFrame ||
    event.senderFrame !== event.sender.mainFrame ||
    event.sender.isDestroyed()
  ) {
    throw new Error('Long-form requests must originate from the application window.');
  }
}

async function removeOwnedPreview(owner: LongformOwner, path: string): Promise<void> {
  if (!owner.previews.has(path)) return;
  try {
    await unlink(path);
  } catch (error) {
    if (!isRecord(error) || error.code !== 'ENOENT') throw error;
  }
  // Only renderer-produced owned paths reach here; rmdir cannot remove a nonempty directory.
  try {
    await rmdir(dirname(path));
  } catch (error) {
    if (!isRecord(error) || error.code !== 'ENOENT') throw error;
  }
  owner.previews.delete(path);
}

/** Request state belongs to this registration and to the window that started the work. */
export function registerLongformHandlers(): void {
  const owners = new Map<number, LongformOwner>();
  const ownerFor = (sender: WebContents): LongformOwner => {
    const existing = owners.get(sender.id);
    if (existing) return existing;
    const owner: LongformOwner = { previews: new Set() };
    owners.set(sender.id, owner);
    sender.once('destroyed', () => {
      owner.generation?.controller.abort();
      owner.preview?.controller.abort();
      owners.delete(sender.id);
      for (const path of owner.previews) {
        void removeOwnedPreview(owner, path).catch(() =>
          log('warn', 'longform-preview', 'Owned preview cleanup failed.'),
        );
      }
    });
    return owner;
  };

  ipcMain.handle(
    Ch.Invoke.AI_GENERATE_LONGFORM_EDIT_PLAN,
    wrapHandler(
      Ch.Invoke.AI_GENERATE_LONGFORM_EDIT_PLAN,
      async (
        event: IpcMainInvokeEvent,
        apiKey: string,
        words: WordTimestamp[],
        videoDuration: number,
        feedback?: string[],
        options: GenerationOptions = {},
      ): Promise<LongformEditPlan> => {
        assertMainFrame(event);
        if (
          typeof apiKey !== 'string' ||
          apiKey.length === 0 ||
          apiKey.length > 8_192 ||
          !validLongformWords(words, videoDuration)
        )
          throw new Error('Invalid long-form generation inputs.');
        if (feedback !== undefined && !stringList(feedback, 50, 2_000))
          throw new Error('Invalid long-form feedback.');
        if (
          !isRecord(options) ||
          (options.mode !== undefined &&
            options.mode !== 'legacy' &&
            options.mode !== 'scene-first') ||
          (options.storyboardStyle !== undefined && !isStoryboardStyle(options.storyboardStyle)) ||
          (options.requestId !== undefined && !validRequestId(options.requestId)) ||
          (options.preservedSceneIds !== undefined &&
            !stringList(options.preservedSceneIds, 2_000, 160)) ||
          (options.sectionIds !== undefined && !stringList(options.sectionIds, 1_000, 160))
        )
          throw new Error('Invalid long-form generation options.');
        let previousPlan: LongformEditPlan | undefined;
        if (options.previousPlan !== undefined && !isRecord(options.previousPlan))
          throw new Error('Invalid previous plan.');
        if (options.previousPlan !== undefined && options.previousPlan.mode === 'scene-first') {
          const previous = validateSceneFirstLongformPlan(
            options.previousPlan,
            words,
            videoDuration,
          );
          if (!previous.ok) throw new Error(previous.error);
          previousPlan = previous.value.plan;
        }
        const owner = ownerFor(event.sender);
        const previous = owner.generation;
        if (previous?.waiting)
          throw new Error('Previous planning is still stopping. Retry when cancellation finishes.');
        previous?.controller.abort();
        const request = ownedRequest(options.requestId ?? randomUUID());
        request.waiting = !!previous;
        owner.generation = request;
        const started = performance.now();
        try {
          if (previous) await previous.finished;
          request.waiting = false;
          request.controller.signal.throwIfAborted();
          const onProgress = (progress: {
            window: number;
            total: number;
            sectionId?: string;
            outcome?: 'planned' | 'empty' | 'failed';
          }): void => {
            if (!request.controller.signal.aborted && !event.sender.isDestroyed())
              event.sender.send(Ch.Send.AI_LONGFORM_EDIT_PROGRESS, {
                ...progress,
                stage: 'ai-editing',
                requestId: request.id,
              });
          };
          const plan =
            options.mode === 'legacy'
              ? await generateLongformEditPlan({
                  apiKey,
                  words,
                  videoDuration,
                  feedback,
                  onProgress,
                })
              : await generateSceneFirstLongformPlan({
                  apiKey,
                  words,
                  videoDuration,
                  feedback,
                  requestId: request.id,
                  mode: 'scene-first',
                  storyboardStyle: options.storyboardStyle,
                  previousPlan,
                  preservedSceneIds: options.preservedSceneIds,
                  sectionIds: options.sectionIds,
                  signal: request.controller.signal,
                  onProgress,
                });
          request.controller.signal.throwIfAborted();
          if (owner.generation !== request)
            throw new Error('A newer plan request replaced this result.');
          log(
            'info',
            'longform-planning',
            `completed mode=${plan.mode ?? 'legacy'} words=${words.length} elapsedMs=${Math.round(performance.now() - started)}`,
          );
          return plan;
        } finally {
          request.finish();
          if (owner.generation === request) delete owner.generation;
        }
      },
    ),
  );

  ipcMain.handle(
    Ch.Invoke.AI_CANCEL_LONGFORM_EDIT_PLAN,
    wrapHandler(
      Ch.Invoke.AI_CANCEL_LONGFORM_EDIT_PLAN,
      (event: IpcMainInvokeEvent, requestId?: string): void => {
        assertMainFrame(event);
        const request = owners.get(event.sender.id)?.generation;
        if (request && (requestId === undefined || request.id === requestId))
          request.controller.abort();
      },
    ),
  );

  ipcMain.handle(
    Ch.Invoke.RENDER_LONGFORM_SCENE_PREVIEW,
    wrapHandler(
      Ch.Invoke.RENDER_LONGFORM_SCENE_PREVIEW,
      async (event: IpcMainInvokeEvent, input: unknown): Promise<string> => {
        assertMainFrame(event);
        if (
          !isRecord(input) ||
          !validRequestId(input.requestId) ||
          typeof input.sourceVideoPath !== 'string' ||
          input.sourceVideoPath.length > 4_096 ||
          !isAbsolute(input.sourceVideoPath) ||
          input.sourceVideoPath.includes('\0') ||
          typeof input.sceneId !== 'string' ||
          input.sceneId.length > 160 ||
          !isSceneFirstPlanEnvelope(input.plan) ||
          !validLongformWords(input.wordTimestamps, input.plan.sourceDuration) ||
          (input.paletteId !== undefined &&
            (typeof input.paletteId !== 'string' || input.paletteId.length > 160)) ||
          (input.customPalettes !== undefined && !validLongformPalettes(input.customPalettes)) ||
          (input.sceneSfxEnabled !== undefined && typeof input.sceneSfxEnabled !== 'boolean')
        )
          throw new Error('Invalid long-form preview request.');
        if (!findLongformPalette(input.paletteId, input.customPalettes))
          throw new Error('The saved preview palette is unavailable.');
        const validation = validateSceneFirstLongformPlan(
          input.plan,
          input.wordTimestamps,
          input.plan.sourceDuration,
        );
        if (!validation.ok) throw new Error(validation.error);
        if (!validation.value.scenes.some((scene) => scene.placement.id === input.sceneId))
          throw new Error('The selected scene is missing or omitted.');
        const owner = ownerFor(event.sender);
        const previous = owner.preview;
        if (previous?.waiting)
          throw new Error('Previous preview is still stopping. Retry when cancellation finishes.');
        previous?.controller.abort();
        const request = ownedRequest(input.requestId);
        request.waiting = !!previous;
        owner.preview = request;
        const started = performance.now();
        try {
          if (previous) await previous.finished;
          request.waiting = false;
          request.controller.signal.throwIfAborted();
          if (!(await stat(input.sourceVideoPath)).isFile())
            throw new Error('The source video is unavailable.');
          request.controller.signal.throwIfAborted();
          const metadata = await getVideoMetadata(input.sourceVideoPath, {
            localOnly: true,
            signal: request.controller.signal,
          });
          request.controller.signal.throwIfAborted();
          if (
            Math.abs(metadata.duration - input.plan.sourceDuration) > 1 / 30 ||
            metadata.width <= 0 ||
            metadata.height <= 0
          )
            throw new Error('The source video no longer matches this scene plan.');
          const preview: LongformScenePreviewRequest = {
            requestId: input.requestId,
            sourceVideoPath: input.sourceVideoPath,
            wordTimestamps: input.wordTimestamps,
            plan: validation.value.plan,
            sceneId: input.sceneId,
            ...(typeof input.paletteId === 'string' ? { paletteId: input.paletteId } : {}),
            ...(input.customPalettes ? { customPalettes: input.customPalettes } : {}),
            ...(typeof input.sceneSfxEnabled === 'boolean'
              ? { sceneSfxEnabled: input.sceneSfxEnabled }
              : {}),
          };
          const path = await renderLongformScenePreview(preview, request.controller.signal);
          owner.previews.add(path);
          if (
            request.controller.signal.aborted ||
            event.sender.isDestroyed() ||
            owner.preview !== request
          ) {
            await removeOwnedPreview(owner, path);
            throw new Error('Scene preview cancelled.');
          }
          while (owner.previews.size > 4) {
            const oldest = owner.previews.values().next().value;
            if (!oldest) break;
            await removeOwnedPreview(owner, oldest);
          }
          log(
            'info',
            'longform-preview',
            `completed scene=${input.sceneId} elapsedMs=${Math.round(performance.now() - started)}`,
          );
          return path;
        } finally {
          request.finish();
          if (owner.preview === request) delete owner.preview;
        }
      },
    ),
  );

  ipcMain.handle(
    Ch.Invoke.RENDER_CANCEL_LONGFORM_SCENE_PREVIEW,
    wrapHandler(
      Ch.Invoke.RENDER_CANCEL_LONGFORM_SCENE_PREVIEW,
      (event: IpcMainInvokeEvent, requestId: string): void => {
        assertMainFrame(event);
        const request = owners.get(event.sender.id)?.preview;
        if (request?.id === requestId) request.controller.abort();
      },
    ),
  );
  ipcMain.handle(
    Ch.Invoke.RENDER_CLEANUP_LONGFORM_SCENE_PREVIEW,
    wrapHandler(
      Ch.Invoke.RENDER_CLEANUP_LONGFORM_SCENE_PREVIEW,
      async (event: IpcMainInvokeEvent, path: string): Promise<void> => {
        assertMainFrame(event);
        const owner = owners.get(event.sender.id);
        if (owner && typeof path === 'string') await removeOwnedPreview(owner, path);
      },
    ),
  );
}
