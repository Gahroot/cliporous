// ---------------------------------------------------------------------------
// Bumper concat — extracted from render-pipeline.ts
// ---------------------------------------------------------------------------

import { existsSync, writeFileSync, unlinkSync, copyFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { ffmpeg, getEncoder, getSoftwareEncoder, isGpuSessionError, isGpuEncoderDisabled, disableGpuEncoderForSession, getVideoMetadata } from '../ffmpeg'
import { toFFmpegPath } from './helpers'

/**
 * Check if all segments have matching stream parameters (codec, resolution, fps)
 * so the concat demuxer can be used with stream copy (zero re-encoding).
 */
export async function canUseConcatDemuxer(
  segmentPaths: string[]
): Promise<boolean> {
  try {
    const metadatas = await Promise.all(segmentPaths.map((p) => getVideoMetadata(p)))
    const ref = metadatas[0]
    return metadatas.every(
      (m) =>
        m.codec === ref.codec &&
        m.width === ref.width &&
        m.height === ref.height &&
        Math.round(m.fps) === Math.round(ref.fps) &&
        m.audioCodec !== 'unknown'
    )
  } catch {
    return false
  }
}

/**
 * Concatenate segments using the concat demuxer (stream copy, no re-encoding).
 * All segments must have identical codec, resolution, fps, and audio.
 */
export function concatDemuxerCopy(
  segmentPaths: string[],
  finalOutputPath: string
): Promise<void> {
  const listFile = join(tmpdir(), `batchcontent-concat-${Date.now()}.txt`)
  const listContent = segmentPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n')
  writeFileSync(listFile, listContent, 'utf-8')

  return new Promise<void>((resolve, reject) => {
    ffmpeg()
      .input(listFile)
      .inputOptions(['-f', 'concat', '-safe', '0'])
      .outputOptions(['-c', 'copy', '-movflags', '+faststart', '-y'])
      .on('end', () => {
        try { unlinkSync(listFile) } catch { /* ignore */ }
        resolve()
      })
      .on('error', (err: Error) => {
        try { unlinkSync(listFile) } catch { /* ignore */ }
        reject(err)
      })
      .save(toFFmpegPath(finalOutputPath))
  })
}

/**
 * Concatenate optional intro/outro bumpers around the main clip.
 *
 * Fast path: if all segments have identical codec/resolution/fps/audio, uses
 * the concat demuxer with stream copy (zero re-encoding).
 *
 * Slow path: scales all segments to 1080×1920 with black letterboxing and
 * re-encodes as h264/aac to ensure codec compatibility.
 * Segments without an audio stream get a generated silence track.
 */
export async function concatWithBumpers(
  mainVideoPath: string,
  finalOutputPath: string,
  introBumperPath: string | null,
  outroBumperPath: string | null
): Promise<void> {
  // Collect segments in order
  type Segment = { path: string; hasAudio: boolean }
  const segments: Segment[] = []

  if (introBumperPath && existsSync(introBumperPath)) {
    const meta = await getVideoMetadata(introBumperPath).catch(() => null)
    segments.push({ path: introBumperPath, hasAudio: !!meta && meta.audioCodec !== 'unknown' })
  }

  // Main clip is always h264/aac — it always has audio
  segments.push({ path: mainVideoPath, hasAudio: true })

  if (outroBumperPath && existsSync(outroBumperPath)) {
    const meta = await getVideoMetadata(outroBumperPath).catch(() => null)
    segments.push({ path: outroBumperPath, hasAudio: !!meta && meta.audioCodec !== 'unknown' })
  }

  if (segments.length === 1) {
    // No valid bumpers found; just move the main file to the final path
    copyFileSync(mainVideoPath, finalOutputPath)
    return
  }

  // Fast path: concat demuxer with stream copy when all segments match
  const allPaths = segments.map((s) => s.path)
  if (segments.every((s) => s.hasAudio) && await canUseConcatDemuxer(allPaths)) {
    console.log('[Bumpers] All segments match — using concat demuxer (stream copy)')
    await concatDemuxerCopy(allPaths, finalOutputPath)
    return
  }

  // Slow path: filter_complex re-encode
  console.log('[Bumpers] Segments differ — using filter_complex re-encode')
  const filterParts: string[] = []

  for (let i = 0; i < segments.length; i++) {
    // Scale to 1080×1920 with black padding to preserve aspect ratio
    filterParts.push(
      `[${i}:v]scale=1080:1920:force_original_aspect_ratio=decrease,` +
      `pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=30[sv${i}]`
    )
    if (segments[i].hasAudio) {
      filterParts.push(
        `[${i}:a]aresample=48000,` +
        `aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo[sa${i}]`
      )
    } else {
      // Generate silence — concat will trim it to the video segment's duration
      filterParts.push(
        `aevalsrc=0:channel_layout=stereo:sample_rate=48000[sa${i}]`
      )
    }
  }

  const concatInputs = segments.map((_, i) => `[sv${i}][sa${i}]`).join('')
  filterParts.push(`${concatInputs}concat=n=${segments.length}:v=1:a=1[outv][outa]`)

  const filterComplex = filterParts.join(';')

  return new Promise<void>((resolve, reject) => {
    let fallbackAttempted = false
    function runConcatWithEncoder(enc: string, flags: string[]): void {
      const cmd = ffmpeg()
      let stderrOutput = ''

      for (const seg of segments) {
        cmd.input(toFFmpegPath(seg.path))
      }

      cmd
        .outputOptions([
          '-filter_complex', filterComplex,
          '-filter_threads', '0',
          '-filter_complex_threads', '0',
          '-map', '[outv]',
          '-map', '[outa]',
          '-c:v', enc,
          ...flags,
          '-c:a', 'aac',
          '-b:a', '192k',
          '-movflags', '+faststart',
          '-y'
        ])
        .on('stderr', (line: string) => { stderrOutput += line + '\n' })
        .on('end', () => resolve())
        .on('error', (err: Error) => {
          if (!fallbackAttempted && isGpuSessionError(err.message + '\n' + stderrOutput)) {
            fallbackAttempted = true
            disableGpuEncoderForSession()
            const sw = getSoftwareEncoder()
            runConcatWithEncoder(sw.encoder, sw.presetFlag)
          } else {
            const stderrTail = stderrOutput.split('\n').slice(-10).join('\n')
            reject(new Error(`${err.message}\n[stderr tail] ${stderrTail}`))
          }
        })
        .save(toFFmpegPath(finalOutputPath))
    }

    const { encoder, presetFlag } = isGpuEncoderDisabled() ? getSoftwareEncoder() : getEncoder()
    runConcatWithEncoder(encoder, presetFlag)
  })
}
