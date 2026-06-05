// ---------------------------------------------------------------------------
// HyperFrames IPC handlers — renderer-facing overlay rendering API
// ---------------------------------------------------------------------------

import { ipcMain } from 'electron'
import { Ch } from '@shared/ipc-channels'
import { wrapHandler } from '../ipc-error-handler'
import { renderOverlay } from '../hyperframes/renderer'
import type {
  OverlayBlockName,
  OverlayRequest,
  OverlayTiming,
  BaseOverlayProps
} from '../hyperframes/types'

/** Payload the renderer sends to request a single overlay render. */
interface RenderOverlayPayload {
  block: OverlayBlockName
  props: BaseOverlayProps
  timing: OverlayTiming
}

export function registerHyperFramesHandlers(): void {
  ipcMain.handle(
    Ch.Invoke.HYPERFRAMES_RENDER_OVERLAY,
    wrapHandler(
      Ch.Invoke.HYPERFRAMES_RENDER_OVERLAY,
      async (_event, payload: RenderOverlayPayload) => {
        const request: OverlayRequest = {
          block: payload.block,
          props: payload.props,
          timing: payload.timing
        }
        return renderOverlay(request)
      }
    )
  )
}
