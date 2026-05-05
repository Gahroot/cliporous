import { app } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync } from 'fs'
import { execSync, spawnSync, spawn, ChildProcess } from 'child_process'
import { tmpdir } from 'os'
import { EventEmitter } from 'events'

function findOnSystemPath(name: string): string | null {
  try {
    const cmd = process.platform === 'win32' ? `where ${name}` : `which ${name}`
    const result = execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim()
    const first = result.split('\n')[0].trim()
    if (first && existsSync(first)) return first
  } catch {
    // not on PATH
  }
  return null
}

function resolveBinaryPath(name: string): string | null {
  const ext = process.platform === 'win32' ? '.exe' : ''
  const binary = `${name}${ext}`
  const searchedPaths: string[] = []

  // Production: check extraResources/bin
  if (app.isPackaged) {
    const resourceBin = join(process.resourcesPath, 'bin', binary)
    searchedPaths.push(`resources/bin: ${resourceBin} (exists: ${existsSync(resourceBin)})`)
    if (existsSync(resourceBin)) {
      console.log(`[FFmpeg] Found ${name} at: ${resourceBin}`)
      return resourceBin
    }

    // Also check asar-unpacked node_modules (legacy)
    const unpackedPath = join(
      process.resourcesPath,
      'app.asar.unpacked',
      'node_modules',
      name === 'ffmpeg' ? 'ffmpeg-static' : '@ffprobe-installer',
      binary
    )
    searchedPaths.push(`unpacked: ${unpackedPath} (exists: ${existsSync(unpackedPath)})`)
    if (existsSync(unpackedPath)) {
      console.log(`[FFmpeg] Found ${name} at: ${unpackedPath}`)
      return unpackedPath
    }
  }

  // Dev: use npm packages
  try {
    if (name === 'ffmpeg') {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const p = require('ffmpeg-static') as string | null
      searchedPaths.push(`npm ffmpeg-static: ${p} (exists: ${p ? existsSync(p) : false})`)
      if (p && existsSync(p)) {
        console.log(`[FFmpeg] Found ${name} via npm at: ${p}`)
        return p
      }
    } else {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const ffprobeInstaller = require('@ffprobe-installer/ffprobe') as { path: string; version: string; url: string }
      const p = ffprobeInstaller.path
      searchedPaths.push(`npm @ffprobe-installer: ${p} (version: ${ffprobeInstaller.version}, exists: ${existsSync(p)})`)
      if (p && existsSync(p)) {
        console.log(`[FFmpeg] Found ${name} via npm at: ${p}`)
        return p
      }
    }
  } catch (err) {
    console.log(`[FFmpeg] npm require failed for ${name}:`, err instanceof Error ? err.message : String(err))
    if (err instanceof Error) {
      console.log(`[FFmpeg] Error stack:`, err.stack)
    }
  }

  // Last resort: system PATH (e.g. /usr/bin/ffmpeg, /usr/bin/ffprobe)
  const systemPath = findOnSystemPath(name)
  searchedPaths.push(`system PATH: ${systemPath ?? 'not found'}`)
  if (systemPath) {
    console.log(`[FFmpeg] Found ${name} on system PATH: ${systemPath}`)
    return systemPath
  }

  console.warn(`[FFmpeg] Could not find ${name}. Searched paths:`)
  for (const p of searchedPaths) {
    console.warn(`  - ${p}`)
  }
  return null
}

let ffmpegReady = false
let resolvedFfmpegPath: string | null = null
let resolvedFfprobePath: string | null = null

export function setupFFmpeg(): void {
  const ffmpegBin = resolveBinaryPath('ffmpeg')
  const ffprobeBin = resolveBinaryPath('ffprobe')

  if (ffmpegBin) {
    resolvedFfmpegPath = ffmpegBin
  }
  if (ffprobeBin) {
    resolvedFfprobePath = ffprobeBin
  }

  ffmpegReady = !!(ffmpegBin && ffprobeBin)

  // Probe available hardware encoders at startup
  detectHardwareEncoder()

  // Probe CUDA filter availability
  hasScaleCuda()

  console.log(`[FFmpeg] Ready: ${ffmpegReady}, ffmpeg: ${ffmpegBin}, ffprobe: ${ffprobeBin}`)
}

// --- Hardware encoder detection ---

export interface EncoderConfig {
  encoder: string
  presetFlag: string[]
}

// h264_vaapi excluded: requires -vaapi_device and hwupload filter chain changes
// that are not currently implemented. VAAPI detection would report success but
// encoding would fail at runtime.
const hwEncoderPriority = ['h264_nvenc', 'h264_qsv'] as const
type HwEncoder = (typeof hwEncoderPriority)[number] | 'libx264'

let cachedEncoder: HwEncoder | null = null

function detectHardwareEncoder(): HwEncoder {
  if (cachedEncoder !== null) return cachedEncoder

  const bin = resolvedFfmpegPath ?? 'ffmpeg'
  try {
    const output = execSync(`"${bin}" -encoders -hide_banner`, {
      encoding: 'utf-8',
      timeout: 10_000,
      stdio: ['pipe', 'pipe', 'pipe']
    })
    for (const enc of hwEncoderPriority) {
      if (output.includes(enc)) {
        cachedEncoder = enc
        console.log(`[FFmpeg] Hardware encoder detected: ${enc}`)
        return enc
      }
    }
  } catch {
    // If detection fails, fall back to software
  }

  cachedEncoder = 'libx264'
  console.log('[FFmpeg] No hardware encoder found, using libx264')
  return cachedEncoder
}

// --- NVENC capability detection (b_ref_mode is Turing+) ---

let cachedNvencSupportsBRefMode: boolean | null = null

/**
 * Detect if the installed NVENC encoder supports `-b_ref_mode middle`.
 * Probing `ffmpeg -h encoder=h264_nvenc` lists the option when the build
 * exposes it; actual runtime support requires Turing or newer, which the
 * NVENC driver reports via a capability check. We err on the side of safety:
 * only claim support when the option is listed AND the probe encode succeeds.
 */
function nvencSupportsBRefMode(): boolean {
  if (cachedNvencSupportsBRefMode !== null) return cachedNvencSupportsBRefMode
  const bin = resolvedFfmpegPath ?? 'ffmpeg'
  try {
    const helpOut = execSync(`"${bin}" -hide_banner -h encoder=h264_nvenc`, {
      encoding: 'utf-8',
      timeout: 5_000,
      stdio: ['pipe', 'pipe', 'pipe']
    })
    if (!helpOut.includes('b_ref_mode')) {
      cachedNvencSupportsBRefMode = false
      return false
    }
    // Runtime probe: tiny synthetic encode to verify the driver accepts it.
    execSync(
      `"${bin}" -hide_banner -f lavfi -i "testsrc=size=64x64:rate=5:duration=0.2" ` +
      `-c:v h264_nvenc -preset p1 -b_ref_mode middle -f null -`,
      { timeout: 5_000, stdio: ['pipe', 'pipe', 'pipe'] }
    )
    cachedNvencSupportsBRefMode = true
    console.log('[FFmpeg] NVENC b_ref_mode=middle supported (Turing+)')
  } catch {
    cachedNvencSupportsBRefMode = false
    console.log('[FFmpeg] NVENC b_ref_mode=middle not supported — using default')
  }
  return cachedNvencSupportsBRefMode
}

// --- CUDA scale filter detection ---

let cachedHasScaleCuda: boolean | null = null

/**
 * Detect if FFmpeg supports the scale_cuda filter.
 * This requires an NVIDIA GPU with CUDA support and an FFmpeg build
 * that includes the CUDA filters.
 */
export function hasScaleCuda(): boolean {
  if (cachedHasScaleCuda !== null) return cachedHasScaleCuda

  const bin = resolvedFfmpegPath ?? 'ffmpeg'
  try {
    const output = execSync(`"${bin}" -filters -hide_banner`, {
      encoding: 'utf-8',
      timeout: 10_000,
      stdio: ['pipe', 'pipe', 'pipe']
    })
    cachedHasScaleCuda = output.includes('scale_cuda')
    console.log(`[FFmpeg] scale_cuda available: ${cachedHasScaleCuda}`)
  } catch {
    cachedHasScaleCuda = false
  }
  return cachedHasScaleCuda
}

export interface QualityParams {
  /** CRF value (15–35). Lower = better quality. Default: 23. */
  crf?: number
  /** x264 encoding speed preset. Default: 'veryfast'. */
  preset?: 'ultrafast' | 'veryfast' | 'medium' | 'slow'
}

export function getEncoder(quality?: QualityParams): EncoderConfig {
  const encoder = cachedEncoder ?? detectHardwareEncoder()
  const crf = quality?.crf ?? 23
  const preset = quality?.preset ?? 'veryfast'

  switch (encoder) {
    case 'h264_nvenc': {
      // Map x264 preset to nvenc preset (p1=fastest, p7=slowest)
      // ultrafast→p1, veryfast→p2, medium→p4, slow→p6
      // CRF maps to cq for NVENC.
      // `-spatial_aq 1` + `-rc-lookahead 8` improve perceptual quality at
      // negligible speed cost on Maxwell+ cards. `-b_ref_mode middle` is
      // Turing+ only, so we gate it on a runtime probe.
      const flags = [
        '-preset', nvencPreset(preset),
        '-rc', 'vbr',
        '-cq', String(crf),
        '-b:v', '0',
        '-spatial_aq', '1',
        '-rc-lookahead', '8',
        '-bf', '2'
      ]
      if (nvencSupportsBRefMode()) {
        flags.push('-b_ref_mode', 'middle')
      }
      return { encoder, presetFlag: flags }
    }
    case 'h264_qsv':
      // QSV quality: global_quality ~ CRF (higher = worse, so scale proportionally)
      return { encoder, presetFlag: ['-preset', 'fast', '-global_quality', String(crf), '-look_ahead', '1'] }
    default:
      return { encoder: 'libx264', presetFlag: ['-preset', preset, '-crf', String(crf), '-threads', '0'] }
  }
}

function nvencPreset(x264Preset: 'ultrafast' | 'veryfast' | 'medium' | 'slow'): string {
  switch (x264Preset) {
    case 'ultrafast': return 'p1'
    case 'veryfast':  return 'p2'
    case 'medium':    return 'p4'
    case 'slow':      return 'p6'
  }
}

/** Software-only fallback encoder (always libx264, never GPU) */
export function getSoftwareEncoder(quality?: QualityParams): EncoderConfig {
  const crf = quality?.crf ?? 23
  const preset = quality?.preset ?? 'veryfast'
  return { encoder: 'libx264', presetFlag: ['-preset', preset, '-crf', String(crf), '-threads', '0'] }
}

/** Check if an FFmpeg error is a GPU/NVENC/CUDA failure that should trigger software fallback.
 *
 * Must be narrow: FFmpeg's build-config banner ("--enable-nvenc --enable-cuda-llvm ...")
 * prints on every invocation, so matching on bare "nvenc" or "cuda" fires on
 * every error — including filter-graph syntax errors — and spuriously disables
 * the GPU encoder for the whole session.  Match on actual error markers only.
 */
export function isGpuSessionError(errorMessage: string): boolean {
  // Specific GPU failure strings
  const specificErrors = [
    'OpenEncodeSessionEx failed',
    'No capable devices found',
    'Cannot load nvcuda.dll',
    'hwupload_cuda failed',
    'CUDA_ERROR_',
    'Error initializing',
    // Windows ACCESS_VIOLATION (0xC0000005 = 3221225477) — NVENC driver crash
    '3221225477',
  ]
  if (specificErrors.some((s) => errorMessage.includes(s))) return true

  // FFmpeg tag-style error lines, e.g. "[h264_nvenc @ 0x...] ...failed" or
  // "[h264_qsv @ 0x...] Error...".  These only appear inside actual error
  // contexts, not in the configuration banner.
  const tagPattern = /\[(h264_nvenc|h264_qsv|hevc_nvenc|hevc_qsv|cuda|scale_cuda|hwupload|hwdownload)\s*@\s*[0-9a-fx]+\]/i
  if (tagPattern.test(errorMessage)) return true

  // Contextual matches — "X failed" / "error X"
  const failurePattern = /(nvenc|h264_qsv|hwupload_cuda|scale_cuda|cuda)\s+(?:failed|error|aborted|not (?:available|supported))/i
  if (failurePattern.test(errorMessage)) return true

  // Generic "out of memory" only counts when paired with a GPU-ish phrase.
  if (
    /out of memory/i.test(errorMessage) &&
    /(cuda|nvenc|gpu|device)/i.test(errorMessage)
  ) {
    return true
  }

  return false
}

/**
 * Whether the GPU encoder has been disabled for this session due to a crash.
 * Once set, all subsequent encodes use software fallback without even trying GPU.
 */
let gpuEncoderDisabledForSession = false

/** Mark GPU encoder as broken for the rest of this app session. */
export function disableGpuEncoderForSession(): void {
  if (!gpuEncoderDisabledForSession) {
    gpuEncoderDisabledForSession = true
    console.warn('[FFmpeg] GPU encoder disabled for this session due to crash — all subsequent encodes will use software fallback')
  }
}

/** Check if GPU encoder was disabled by a prior crash this session. */
export function isGpuEncoderDisabled(): boolean {
  return gpuEncoderDisabledForSession
}

/**
 * Replace CUDA scale filters with CPU equivalents in a video filter string.
 * Transforms `hwupload_cuda,scale_cuda=W:H:interp_algo=lanczos,hwdownload,format=nv12`
 * into `scale=W:H` so the filter works without GPU.
 */
export function stripCudaScaleFilter(videoFilter: string): string {
  // Match the full CUDA scale pipeline and extract the dimensions
  return videoFilter.replace(
    /hwupload_cuda,scale_cuda=(\d+):(\d+)(?::interp_algo=\w+)?,hwdownload,format=nv12/g,
    'scale=$1:$2'
  )
}

export function isFFmpegAvailable(): boolean {
  return ffmpegReady
}

// ---------------------------------------------------------------------------
// FfmpegCommand — child_process.spawn replacement for fluent-ffmpeg
// ---------------------------------------------------------------------------

export class FfmpegCommand extends EventEmitter {
  private inputs: Array<{ path: string; options: string[]; loop: boolean }> = []
  private outputOpts: string[] = []
  private vFilters: string[] = []
  private _outputPath: string | null = null
  private _noVideo = false
  private _audioFreq: number | null = null
  private _audioChannels: number | null = null
  private _audioFilterStr: string | null = null
  private _format: string | null = null
  private _frames: number | null = null
  private _duration: number | null = null
  private proc: ChildProcess | null = null

  constructor(inputPath?: string) {
    super()
    if (inputPath) this.inputs.push({ path: inputPath, options: [], loop: false })
  }

  input(path: string): this { this.inputs.push({ path, options: [], loop: false }); return this }

  inputOptions(opts: string[]): this {
    const cur = this.inputs[this.inputs.length - 1]
    if (cur) cur.options.push(...opts)
    return this
  }

  seekInput(t: number): this {
    const cur = this.inputs[this.inputs.length - 1]
    if (cur) cur.options.push('-ss', String(t))
    return this
  }

  loop(): this {
    const cur = this.inputs[this.inputs.length - 1]
    if (cur) cur.loop = true
    return this
  }

  setStartTime(t: number): this { return this.seekInput(t) }

  setDuration(d: number): this {
    this._duration = d
    this.outputOpts.push('-t', String(d))
    return this
  }

  duration(d: number): this { return this.setDuration(d) }

  frames(n: number): this { this._frames = n; return this }
  noVideo(): this { this._noVideo = true; return this }
  audioFrequency(freq: number): this { this._audioFreq = freq; return this }
  audioChannels(n: number): this { this._audioChannels = n; return this }
  audioFilters(filters: string[]): this { this._audioFilterStr = filters.join(','); return this }
  format(fmt: string): this { this._format = fmt; return this }

  videoFilters(filter: string): this { this.vFilters.push(filter); return this }
  videoFilter(filter: string): this { return this.videoFilters(filter) }

  outputOptions(opts: string[]): this { this.outputOpts.push(...opts); return this }
  output(path: string): this { this._outputPath = path; return this }

  save(path: string): this {
    this._outputPath = path
    this._exec()
    return this
  }

  run(): this {
    this._exec()
    return this
  }

  kill(signal: string = 'SIGTERM'): void {
    try { this.proc?.kill(signal as NodeJS.Signals) } catch { /* already dead */ }
  }

  private buildArgs(): string[] {
    const args: string[] = []

    for (const inp of this.inputs) {
      if (inp.loop) args.push('-loop', '1')
      args.push(...inp.options)
      args.push('-i', inp.path)
    }

    if (this.vFilters.length > 0) {
      args.push('-vf', this.vFilters.join(','))
    }

    if (this._noVideo) args.push('-vn')
    if (this._audioFreq !== null) args.push('-ar', String(this._audioFreq))
    if (this._audioChannels !== null) args.push('-ac', String(this._audioChannels))
    if (this._audioFilterStr) args.push('-af', this._audioFilterStr)
    if (this._format !== null) args.push('-f', this._format)
    if (this._frames !== null) args.push('-frames:v', String(this._frames))

    args.push(...this.outputOpts)
    args.push('-y')

    if (this._outputPath) args.push(this._outputPath)

    return args
  }

  private _exec(): void {
    const bin = resolvedFfmpegPath ?? 'ffmpeg'
    const args = this.buildArgs()

    this.proc = spawn(bin, args, { stdio: ['pipe', 'pipe', 'pipe'] })

    const cmdLine = `${bin} ${args.join(' ')}`
    this.emit('start', cmdLine)

    let stderrBuf = ''
    const stderrLines: string[] = []

    this.proc.stderr?.on('data', (chunk: Buffer) => {
      stderrBuf += chunk.toString()
      const lines = stderrBuf.split('\n')
      stderrBuf = lines.pop() ?? ''
      for (const line of lines) {
        stderrLines.push(line)
        this.emit('stderr', line)
        this.parseProgress(line)
      }
    })

    this.proc.on('close', (code) => {
      // Flush remaining stderr
      if (stderrBuf) {
        stderrLines.push(stderrBuf)
        this.emit('stderr', stderrBuf)
        this.parseProgress(stderrBuf)
      }

      if (code === 0) {
        this.emit('end')
      } else {
        const lastLines = stderrLines.slice(-20).join('\n')
        this.emit('error', new Error(`ffmpeg exited with code ${code}: ${lastLines}`))
      }
    })

    this.proc.on('error', (err) => {
      this.emit('error', err)
    })
  }

  private parseProgress(line: string): void {
    const timeMatch = line.match(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/)
    if (!timeMatch) return
    const hours = parseInt(timeMatch[1], 10)
    const mins = parseInt(timeMatch[2], 10)
    const secs = parseFloat(timeMatch[3])
    const timeSec = hours * 3600 + mins * 60 + secs
    const timemark = `${timeMatch[1]}:${timeMatch[2]}:${timeMatch[3]}`

    let percent = 0
    if (this._duration && this._duration > 0) {
      percent = Math.min(100, (timeSec / this._duration) * 100)
    }
    this.emit('progress', { percent, timemark })
  }
}

// ---------------------------------------------------------------------------
// ffprobe replacement
// ---------------------------------------------------------------------------

interface FfprobeStream {
  codec_type: string
  codec_name?: string
  width?: number
  height?: number
  r_frame_rate?: string
  avg_frame_rate?: string
}

interface FfprobeFormat {
  // ffprobe -print_format json returns numeric format fields as strings
  // (e.g. "123.456000"). Always parseFloat before use.
  duration?: string | number
}

interface FfprobeData {
  streams: FfprobeStream[]
  format: FfprobeFormat
}

function ffprobeRaw(filePath: string): Promise<FfprobeData> {
  return new Promise((resolve, reject) => {
    const bin = resolvedFfprobePath ?? 'ffprobe'

    // Log which binary we're using for debugging
    console.log(`[ffprobeRaw] Using binary: ${bin}`)
    console.log(`[ffprobeRaw] Resolved path: ${resolvedFfprobePath ?? 'fallback to PATH'}`)

    const args = [
      '-v', 'quiet', '-print_format', 'json',
      '-show_format', '-show_streams', filePath
    ]

    const proc = spawn(bin, args, {
      env: { ...process.env, PATH: process.env.PATH }
    })

    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', (d: Buffer) => { stdout += d.toString() })
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString() })

    proc.on('close', (code) => {
      if (code !== 0) {
        console.error(`[ffprobeRaw] Exited with code ${code}, stderr: ${stderr}`)
        return reject(new Error(`ffprobe exited ${code}: ${stderr}`))
      }
      try { resolve(JSON.parse(stdout)) }
      catch (e) { reject(e) }
    })

    proc.on('error', (err) => {
      console.error(`[ffprobeRaw] Spawn error:`, err)
      reject(err)
    })
  })
}

// ---------------------------------------------------------------------------
// Video metadata / helpers
// ---------------------------------------------------------------------------

export async function getVideoMetadata(
  filePath: string
): Promise<{ duration: number; width: number; height: number; codec: string; fps: number; audioCodec: string }> {
  const metadata = await ffprobeRaw(filePath)
  const video = metadata.streams.find((s) => s.codec_type === 'video')
  if (!video) throw new Error('No video stream found')
  const audio = metadata.streams.find((s) => s.codec_type === 'audio')
  // Parse r_frame_rate (e.g. "30/1", "30000/1001")
  let fps = 0
  const rateStr = video.r_frame_rate || video.avg_frame_rate || ''
  if (rateStr) {
    const parts = rateStr.split('/')
    if (parts.length === 2) {
      const num = parseFloat(parts[0])
      const den = parseFloat(parts[1])
      if (den > 0) fps = num / den
    } else {
      fps = parseFloat(rateStr) || 0
    }
  }
  // ffprobe JSON returns format.duration as a string — coerce to number.
  const rawDuration = metadata.format.duration
  const parsedDuration = typeof rawDuration === 'number'
    ? rawDuration
    : typeof rawDuration === 'string'
      ? parseFloat(rawDuration)
      : NaN
  const duration = Number.isFinite(parsedDuration) && parsedDuration > 0 ? parsedDuration : 0
  return {
    duration,
    width: video.width || 0,
    height: video.height || 0,
    codec: video.codec_name || 'unknown',
    fps,
    audioCodec: audio?.codec_name || 'unknown'
  }
}

export function extractAudio(videoPath: string, outputPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    new FfmpegCommand(videoPath)
      .noVideo()
      .audioFrequency(16000)
      .audioChannels(1)
      .format('wav')
      .on('end', () => resolve(outputPath))
      .on('error', reject)
      .save(outputPath)
  })
}

export function trimVideo(
  inputPath: string,
  outputPath: string,
  startTime: number,
  endTime: number
): Promise<string> {
  return new Promise((resolve, reject) => {
    new FfmpegCommand(inputPath)
      .setStartTime(startTime)
      .setDuration(endTime - startTime)
      .outputOptions(['-c', 'copy'])
      .on('end', () => resolve(outputPath))
      .on('error', () => {
        // Fallback: re-encode if stream copy fails
        const { encoder, presetFlag } = getEncoder()
        new FfmpegCommand(inputPath)
          .inputOptions(['-hwaccel', 'auto'])
          .setStartTime(startTime)
          .setDuration(endTime - startTime)
          .outputOptions(['-c:v', encoder, ...presetFlag, '-c:a', 'aac'])
          .on('end', () => resolve(outputPath))
          .on('error', reject)
          .save(outputPath)
      })
      .save(outputPath)
  })
}

export function trimVideoReencode(
  inputPath: string,
  outputPath: string,
  startTime: number,
  endTime: number
): Promise<string> {
  const { encoder, presetFlag } = getEncoder()
  return new Promise((resolve, reject) => {
    new FfmpegCommand(inputPath)
      .inputOptions(['-hwaccel', 'auto'])
      .setStartTime(startTime)
      .setDuration(endTime - startTime)
      .outputOptions(['-c:v', encoder, ...presetFlag, '-c:a', 'aac'])
      .on('end', () => resolve(outputPath))
      .on('error', reject)
      .save(outputPath)
  })
}

export interface CropRect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Crop input video to the given rectangle and scale to target resolution
 * (default 720x1280 — the locked 9:16 vertical canvas).
 * Uses hardware encoder with software fallback.
 */
export function cropAndExport(
  inputPath: string,
  outputPath: string,
  crop: CropRect,
  resolution: { width: number; height: number } = { width: 720, height: 1280 }
): Promise<string> {
  const cropFilter = `crop=${crop.width}:${crop.height}:${crop.x}:${crop.y}`
  const scaleFilter = `scale=${resolution.width}:${resolution.height}`
  const videoFilter = `${cropFilter},${scaleFilter}`

  const gpuOff = isGpuEncoderDisabled()
  const { encoder, presetFlag } = gpuOff ? getSoftwareEncoder() : getEncoder()

  return new Promise((resolve, reject) => {
    let stderrOutput = ''
    const cmd = new FfmpegCommand(inputPath)
    if (!gpuOff) {
      cmd.inputOptions(['-hwaccel', 'auto'])
    }
    cmd
      .videoFilters(videoFilter)
      .outputOptions(['-c:v', encoder, ...presetFlag, '-c:a', 'aac'])
      .on('stderr', (line: string) => { stderrOutput += line + '\n' })
      .on('end', () => resolve(outputPath))
      .on('error', (err: Error) => {
        if (isGpuSessionError(err.message + '\n' + stderrOutput)) {
          // Retry with software encoder
          disableGpuEncoderForSession()
          const sw = getSoftwareEncoder()
          new FfmpegCommand(inputPath)
            .videoFilters(videoFilter)
            .outputOptions(['-c:v', sw.encoder, ...sw.presetFlag, '-c:a', 'aac'])
            .on('end', () => resolve(outputPath))
            .on('error', reject)
            .save(outputPath)
        } else {
          reject(err)
        }
      })
      .save(outputPath)
  })
}

/**
 * Extract a single frame as a base64 PNG data URI.
 * @param videoPath  Path to the input video
 * @param timeSec    Seek position in seconds (defaults to 1s or duration/10)
 */
export function generateThumbnail(videoPath: string, timeSec?: number): Promise<string> {
  return new Promise((resolve, reject) => {
    // Determine seek time: use provided value or fall back to 1 second
    const seekSec = timeSec ?? 1

    const tmpFile = join(tmpdir(), `batchcontent-thumb-${Date.now()}.png`)

    new FfmpegCommand(videoPath)
      .seekInput(seekSec)
      .frames(1)
      .outputOptions(['-vf', 'scale=320:-1'])
      .on('end', () => {
        try {
          const buffer = readFileSync(tmpFile)
          const base64 = buffer.toString('base64')
          resolve(`data:image/png;base64,${base64}`)
        } catch (readErr) {
          reject(readErr)
        }
      })
      .on('error', reject)
      .save(tmpFile)
  })
}

// ---------------------------------------------------------------------------
// Script cue segment splitting
// ---------------------------------------------------------------------------

export interface SplitSegment {
  label: string
  startTime: number
  endTime: number
}

export interface SplitResult {
  label: string
  outputPath: string
}

function sanitizeLabel(label: string): string {
  return label.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')
}

export async function splitSegments(
  inputPath: string,
  segments: SplitSegment[],
  outputDir: string
): Promise<SplitResult[]> {
  const results: SplitResult[] = []
  for (const segment of segments) {
    const filename = `${sanitizeLabel(segment.label)}.mp4`
    const outputPath = join(outputDir, filename)
    await trimVideo(inputPath, outputPath, segment.startTime, segment.endTime)
    results.push({ label: segment.label, outputPath })
  }
  return results
}

/** Return the resolved ffmpeg binary path (or null if not yet resolved). */
export function getResolvedFfmpegPath(): string | null {
  return resolvedFfmpegPath
}

// ---------------------------------------------------------------------------
// Audio waveform peak extraction
// ---------------------------------------------------------------------------

/**
 * Extract audio amplitude peaks from a video segment.
 *
 * Uses FFmpeg to decode the audio track as raw 16-bit signed PCM (mono, 8 kHz),
 * then downsamples to `numPoints` amplitude peaks normalized to [0, 1].
 *
 * @param videoPath   Path to the source video file
 * @param startTime   Start of the range in seconds
 * @param endTime     End of the range in seconds
 * @param numPoints   Number of data points to return (default 500)
 * @returns           Array of peak amplitudes normalized to [0, 1]
 */
export function getWaveformPeaks(
  videoPath: string,
  startTime: number,
  endTime: number,
  numPoints = 500
): number[] {
  const bin = resolvedFfmpegPath ?? 'ffmpeg'
  const duration = endTime - startTime

  // Use a low sample rate to keep PCM buffer small (8 kHz mono = 8000 samples/s)
  const sampleRate = 8000

  const result = spawnSync(
    bin,
    [
      '-ss', String(startTime),
      '-t',  String(duration),
      '-i',  videoPath,
      '-vn',
      '-ac', '1',
      '-ar', String(sampleRate),
      '-f',  's16le',   // raw signed 16-bit little-endian PCM
      '-'               // pipe to stdout
    ],
    { maxBuffer: 20 * 1024 * 1024 } // 20 MB — ample for any clip
  )

  if (result.error || !result.stdout || result.stdout.length === 0) {
    // No audio stream or read failed — return flat line
    return new Array(numPoints).fill(0)
  }

  const pcm = result.stdout as Buffer
  const totalSamples = Math.floor(pcm.length / 2) // 2 bytes per int16 sample

  if (totalSamples === 0) {
    return new Array(numPoints).fill(0)
  }

  // Bucket samples into `numPoints` groups, take peak amplitude of each bucket
  const samplesPerBucket = Math.max(1, Math.floor(totalSamples / numPoints))
  const peaks: number[] = []

  for (let i = 0; i < numPoints; i++) {
    const bucketStart = i * samplesPerBucket
    const bucketEnd = Math.min(bucketStart + samplesPerBucket, totalSamples)
    let peak = 0
    for (let j = bucketStart; j < bucketEnd; j++) {
      const byteOffset = j * 2
      // Read as signed 16-bit little-endian
      const lo = pcm[byteOffset]
      const hi = pcm[byteOffset + 1]
      let sample = ((hi << 8) | lo)
      if (sample >= 0x8000) sample -= 0x10000  // sign-extend
      const abs = Math.abs(sample)
      if (abs > peak) peak = abs
    }
    // Normalize to [0, 1] (int16 max is 32767)
    peaks.push(peak / 32767)
  }

  return peaks
}

// ---------------------------------------------------------------------------
// Factory export — drop-in replacement for `ffmpeg(path)` call sites
// ---------------------------------------------------------------------------

export function ffmpeg(inputPath?: string): FfmpegCommand {
  return new FfmpegCommand(inputPath)
}
