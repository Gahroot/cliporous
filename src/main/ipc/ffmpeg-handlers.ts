import { ipcMain } from 'electron'
import { tmpdir } from 'os'
import { join } from 'path'
import { Ch } from '@shared/ipc-channels'
import { getVideoMetadata, extractAudio, generateThumbnail, getWaveformPeaks } from '../ffmpeg'
import { wrapHandler } from '../ipc-error-handler'

export function registerFfmpegHandlers(): void {
  ipcMain.handle(
    Ch.Invoke.FFMPEG_GET_METADATA,
    wrapHandler(Ch.Invoke.FFMPEG_GET_METADATA, (_event, filePath: string) => {
      return getVideoMetadata(filePath)
    })
  )

  ipcMain.handle(
    Ch.Invoke.FFMPEG_EXTRACT_AUDIO,
    wrapHandler(Ch.Invoke.FFMPEG_EXTRACT_AUDIO, async (_event, videoPath: string) => {
      const outputPath = join(tmpdir(), `batchcontent-audio-${Date.now()}.wav`)
      return extractAudio(videoPath, outputPath)
    })
  )

  ipcMain.handle(
    Ch.Invoke.FFMPEG_THUMBNAIL,
    wrapHandler(Ch.Invoke.FFMPEG_THUMBNAIL, (_event, videoPath: string, timeSec?: number) => {
      return generateThumbnail(videoPath, timeSec)
    })
  )

  ipcMain.handle(
    Ch.Invoke.FFMPEG_GET_WAVEFORM,
    wrapHandler(
      Ch.Invoke.FFMPEG_GET_WAVEFORM,
      (_event, videoPath: string, startTime: number, endTime: number, numPoints: number) => {
        return getWaveformPeaks(videoPath, startTime, endTime, numPoints ?? 500)
      }
    )
  )
}
