import { ipcMain } from 'electron'
import { Ch } from '@shared/ipc-channels'
import { wrapHandler } from '../ipc-error-handler'
import { generateLongformEditPlan } from '../ai/longform-edit-plan'
import type { WordTimestamp, LongformEditPlan } from '@shared/types'

/**
 * IPC handlers for the Hormozi long-form (16:9) pipeline.
 */
export function registerLongformHandlers(): void {
  // AI — generate a Hormozi-style long-form edit plan from a full transcript.
  ipcMain.handle(
    Ch.Invoke.AI_GENERATE_LONGFORM_EDIT_PLAN,
    wrapHandler(
      Ch.Invoke.AI_GENERATE_LONGFORM_EDIT_PLAN,
      async (
        _event,
        apiKey: string,
        words: WordTimestamp[],
        videoDuration: number
      ): Promise<LongformEditPlan> => {
        return generateLongformEditPlan({ apiKey, words, videoDuration })
      }
    )
  )
}
