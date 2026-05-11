/**
 * B-Roll Image → Video Converter
 *
 * Converts a static PNG image into a short video clip with a slow Ken Burns
 * pan/zoom effect. The output video can then be used identically to a Pexels
 * stock footage clip in the existing B-Roll overlay pipeline.
 *
 * This avoids any changes to broll.feature.ts — the existing FFmpeg filter
 * chain works unchanged because it receives a video input, not a static image.
 */

import { ffmpeg } from './ffmpeg'
import { existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { createHash } from 'crypto'
import { OUTPUT_WIDTH, OUTPUT_HEIGHT, OUTPUT_FPS } from './aspect-ratios'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const VIDEO_CACHE_DIR = join(tmpdir(), 'batchcontent-broll-image-video-cache')

function ensureVideoCacheDir(): void {
  if (!existsSync(VIDEO_CACHE_DIR)) {
    mkdirSync(VIDEO_CACHE_DIR, { recursive: true })
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Convert a static image to a short video clip with a Ken Burns pan/zoom effect.
 *
 * The resulting video is 1080×1920 (locked 9:16) at 30fps, encoded with libx264.
 * A slow zoom-in effect (1.0× → 1.08×) is applied for visual interest.
 *
 * @param imagePath   Absolute path to the source PNG image
 * @param duration    Duration of the output video in seconds (2–6)
 * @param outputPath  Optional output path; if omitted, a cached path is used
 * @returns Absolute path to the output MP4 video
 */
export async function imageToVideoClip(
  imagePath: string,
  duration: number,
  outputPath?: string
): Promise<string> {
  if (!existsSync(imagePath)) {
    throw new Error(`[B-Roll Image] Source image not found: ${imagePath}`)
  }

  ensureVideoCacheDir()

  // Determine output path (use cache if not specified)
  const dest =
    outputPath ??
    join(
      VIDEO_CACHE_DIR,
      `${createHash('md5').update(`${imagePath}-${duration}`).digest('hex').slice(0, 16)}.mp4`
    )

  // Return cached if already exists
  if (existsSync(dest)) {
    console.log(`[B-Roll Image→Video] Cache hit: ${dest}`)
    return dest
  }

  const fps = OUTPUT_FPS
  const totalFrames = Math.ceil(duration * fps)

  // Ken Burns: slow zoom from 1.0× to 1.08× centred on the image
  // zoompan: z starts at 1.0, increases linearly to 1.08 over totalFrames
  // d=1 means each zoompan frame produces 1 output frame
  const zoomFilter = [
    `zoompan=z='1+0.08*on/${totalFrames}'`,
    `d=1`,
    `x='iw/2-(iw/zoom/2)'`,
    `y='ih/2-(ih/zoom/2)'`,
    `s=${OUTPUT_WIDTH}x${OUTPUT_HEIGHT}`,
    `fps=${fps}`
  ].join(':')

  return new Promise<string>((resolve, reject) => {
    ffmpeg()
      .input(imagePath)
      .loop()
      .inputOptions([`-t ${duration}`])
      .videoFilter(zoomFilter)
      .outputOptions([
        '-c:v libx264',
        '-preset veryfast',
        '-crf 23',
        '-pix_fmt yuv420p',
        `-t ${duration}`,
        '-an' // no audio
      ])
      .output(dest)
      .on('error', (err) => {
        console.error(`[B-Roll Image→Video] FFmpeg error:`, err.message)
        reject(new Error(`Failed to convert image to video: ${err.message}`))
      })
      .on('end', () => {
        console.log(`[B-Roll Image→Video] Created ${duration}s clip: ${dest}`)
        resolve(dest)
      })
      .run()
  })
}
