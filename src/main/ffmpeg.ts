import { type ChildProcess, execSync, spawn, spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { existsSync, readFileSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, dirname, isAbsolute, join } from 'node:path';
import { app } from 'electron';
import { OUTPUT_HEIGHT, OUTPUT_WIDTH } from './aspect-ratios';

function findOnSystemPath(name: string): string | null {
  try {
    const cmd = process.platform === 'win32' ? `where ${name}` : `which ${name}`;
    const result = execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    const first = result.split('\n')[0].trim();
    if (first && existsSync(first)) return first;
  } catch {
    // not on PATH
  }
  return null;
}

function resolveDevFfmpegStatic(): string | null {
  try {
    const p = require('ffmpeg-static') as string | null;
    return p && existsSync(p) ? p : null;
  } catch {
    return null;
  }
}

function resolveDevFfprobeStatic(): string | null {
  try {
    const installer = require('@ffprobe-installer/ffprobe') as { path?: string };
    return installer.path && existsSync(installer.path) ? installer.path : null;
  } catch {
    return null;
  }
}

function resolveBinaryPath(name: string): string | null {
  const ext = process.platform === 'win32' ? '.exe' : '';
  const binary = `${name}${ext}`;
  const searchedPaths: string[] = [];

  // Production: prefer the audited platform binaries copied into extraResources/bin.
  if (app.isPackaged) {
    const resourceBin = join(process.resourcesPath, 'bin', binary);
    searchedPaths.push(`resources/bin: ${resourceBin} (exists: ${existsSync(resourceBin)})`);
    if (existsSync(resourceBin)) {
      console.log(`[FFmpeg] Found ${name} at: ${resourceBin}`);
      return resourceBin;
    }

    if (process.platform === 'darwin' && process.arch === 'arm64') {
      // ffmpeg-static is a self-contained full build with libass and the filters
      // used by BatchClip. Remotion's FFmpeg build intentionally omits many of them.
      if (name === 'ffmpeg') {
        const staticFfmpeg = join(
          process.resourcesPath,
          'app.asar.unpacked',
          'node_modules',
          'ffmpeg-static',
          'ffmpeg',
        );
        searchedPaths.push(`ffmpeg-static: ${staticFfmpeg} (exists: ${existsSync(staticFfmpeg)})`);
        if (existsSync(staticFfmpeg)) {
          console.log(`[FFmpeg] Found packaged ffmpeg-static binary: ${staticFfmpeg}`);
          return staticFfmpeg;
        }
      }

      // ffprobe-installer supplies a self-contained binary. Unlike Remotion's
      // ffprobe, it has no adjacent dylibs that Finder-launched apps must resolve.
      if (name === 'ffprobe') {
        const staticFfprobe = join(
          process.resourcesPath,
          'app.asar.unpacked',
          'node_modules',
          '@ffprobe-installer',
          'darwin-arm64',
          'ffprobe',
        );
        searchedPaths.push(
          `ffprobe-installer: ${staticFfprobe} (exists: ${existsSync(staticFfprobe)})`,
        );
        if (existsSync(staticFfprobe)) {
          console.log(`[FFmpeg] Found packaged ffprobe binary: ${staticFfprobe}`);
          return staticFfprobe;
        }
      }
    }
  }

  // Development ffmpeg: prefer the npm ffmpeg-static build — the same binary
  // macOS releases ship, with libass for burned-in captions. Homebrew's ffmpeg
  // formula no longer links libass, so a PATH ffmpeg silently drops captions
  // and hook titles.
  if (!app.isPackaged && name === 'ffmpeg') {
    const devStatic = resolveDevFfmpegStatic();
    searchedPaths.push(`npm ffmpeg-static: ${devStatic ?? 'not found'}`);
    if (devStatic) {
      console.log(`[FFmpeg] Found ffmpeg via npm ffmpeg-static: ${devStatic}`);
      return devStatic;
    }
  }

  // Development ffprobe: use the npm @ffprobe-installer build so dev works
  // without a system FFmpeg install (notably on Windows).
  if (!app.isPackaged && name === 'ffprobe') {
    const devStatic = resolveDevFfprobeStatic();
    searchedPaths.push(`npm @ffprobe-installer: ${devStatic ?? 'not found'}`);
    if (devStatic) {
      console.log(`[FFmpeg] Found ffprobe via npm @ffprobe-installer: ${devStatic}`);
      return devStatic;
    }
  }

  // Otherwise use the operator-installed FFmpeg toolchain on PATH.
  // Release builds bundle an audited matching ffmpeg/ffprobe pair in resources/bin.
  const systemPath = findOnSystemPath(name);
  searchedPaths.push(`system PATH: ${systemPath ?? 'not found'}`);
  if (systemPath) {
    console.log(`[FFmpeg] Found ${name} on system PATH: ${systemPath}`);
    return systemPath;
  }

  console.warn(`[FFmpeg] Could not find ${name}. Searched paths:`);
  for (const p of searchedPaths) {
    console.warn(`  - ${p}`);
  }
  return null;
}

/** Environment required by packaged media binaries.
 *
 * Remotion's macOS ffprobe links dylibs by filename rather than @rpath, so dyld
 * must be pointed at the directory where the package keeps those libraries.
 */
export function buildMediaProcessEnv(
  binaryPath: string,
  platform = process.platform,
  baseEnv: NodeJS.ProcessEnv = process.env,
  pathDelimiter = delimiter,
): NodeJS.ProcessEnv {
  const env = { ...baseEnv };
  if (platform !== 'darwin' || !binaryPath.includes('/@remotion/compositor-darwin-arm64/')) {
    return env;
  }

  const libraryDir = dirname(binaryPath);
  env.DYLD_LIBRARY_PATH = [libraryDir, baseEnv.DYLD_LIBRARY_PATH]
    .filter(Boolean)
    .join(pathDelimiter);
  return env;
}

let ffmpegReady = false;
let resolvedFfmpegPath: string | null = null;
let resolvedFfprobePath: string | null = null;

export function setupFFmpeg(): void {
  const ffmpegBin = resolveBinaryPath('ffmpeg');
  const ffprobeBin = resolveBinaryPath('ffprobe');

  if (ffmpegBin) {
    resolvedFfmpegPath = ffmpegBin;
  }
  if (ffprobeBin) {
    resolvedFfprobePath = ffprobeBin;
  }

  ffmpegReady = !!(ffmpegBin && ffprobeBin);

  // Probe available hardware encoders at startup
  detectHardwareEncoder();

  // Probe CUDA filter availability
  hasScaleCuda();

  console.log(`[FFmpeg] Ready: ${ffmpegReady}, ffmpeg: ${ffmpegBin}, ffprobe: ${ffprobeBin}`);
}

// --- Hardware encoder detection ---

export interface EncoderConfig {
  encoder: string;
  presetFlag: string[];
}

// h264_vaapi excluded: requires -vaapi_device and hwupload filter chain changes
// that are not currently implemented. VAAPI detection would report success but
// encoding would fail at runtime.
//
// h264_videotoolbox is Apple's hardware encoder (Apple Silicon + Intel Macs).
// On an M1/M2/M3 it offloads encoding to the dedicated media engine, cutting
// per-clip CPU by ~90% and wall-clock by ~3× vs libx264 — without it, every
// render on a Mac silently falls back to slow software encoding.
const hwEncoderPriority = ['h264_nvenc', 'h264_qsv', 'h264_videotoolbox'] as const;
type HwEncoder = (typeof hwEncoderPriority)[number] | 'libx264';

/**
 * Whether an encoder string is a hardware (GPU / media-engine) encoder.
 * Centralized so every concurrency / UI check stays in sync when new
 * hardware encoders are added.
 */
export function isHardwareEncoder(encoder: string): boolean {
  return encoder === 'h264_nvenc' || encoder === 'h264_qsv' || encoder === 'h264_videotoolbox';
}

let cachedEncoder: HwEncoder | null = null;

function detectHardwareEncoder(): HwEncoder {
  if (cachedEncoder !== null) return cachedEncoder;

  const bin = resolvedFfmpegPath ?? 'ffmpeg';
  try {
    const output = execSync(`"${bin}" -encoders -hide_banner`, {
      encoding: 'utf-8',
      timeout: 10_000,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: buildMediaProcessEnv(bin),
    });
    for (const enc of hwEncoderPriority) {
      if (output.includes(enc)) {
        cachedEncoder = enc;
        console.log(`[FFmpeg] Hardware encoder detected: ${enc}`);
        return enc;
      }
    }
  } catch {
    // If detection fails, fall back to software
  }

  cachedEncoder = 'libx264';
  console.log('[FFmpeg] No hardware encoder found, using libx264');
  return cachedEncoder;
}

// --- NVENC capability detection (b_ref_mode is Turing+) ---

let cachedNvencSupportsBRefMode: boolean | null = null;

/**
 * Detect if the installed NVENC encoder supports `-b_ref_mode middle`.
 * Probing `ffmpeg -h encoder=h264_nvenc` lists the option when the build
 * exposes it; actual runtime support requires Turing or newer, which the
 * NVENC driver reports via a capability check. We err on the side of safety:
 * only claim support when the option is listed AND the probe encode succeeds.
 */
function nvencSupportsBRefMode(): boolean {
  if (cachedNvencSupportsBRefMode !== null) return cachedNvencSupportsBRefMode;
  const bin = resolvedFfmpegPath ?? 'ffmpeg';
  try {
    const helpOut = execSync(`"${bin}" -hide_banner -h encoder=h264_nvenc`, {
      encoding: 'utf-8',
      timeout: 5_000,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: buildMediaProcessEnv(bin),
    });
    if (!helpOut.includes('b_ref_mode')) {
      cachedNvencSupportsBRefMode = false;
      return false;
    }
    // Runtime probe: tiny synthetic encode to verify the driver accepts it.
    execSync(
      `"${bin}" -hide_banner -f lavfi -i "testsrc=size=64x64:rate=5:duration=0.2" ` +
        `-c:v h264_nvenc -preset p1 -b_ref_mode middle -f null -`,
      {
        timeout: 5_000,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: buildMediaProcessEnv(bin),
      },
    );
    cachedNvencSupportsBRefMode = true;
    console.log('[FFmpeg] NVENC b_ref_mode=middle supported (Turing+)');
  } catch {
    cachedNvencSupportsBRefMode = false;
    console.log('[FFmpeg] NVENC b_ref_mode=middle not supported — using default');
  }
  return cachedNvencSupportsBRefMode;
}

// --- CUDA scale filter detection ---

let cachedHasScaleCuda: boolean | null = null;

/**
 * Detect if FFmpeg supports the scale_cuda filter.
 * This requires an NVIDIA GPU with CUDA support and an FFmpeg build
 * that includes the CUDA filters.
 */
export function hasScaleCuda(): boolean {
  if (cachedHasScaleCuda !== null) return cachedHasScaleCuda;

  const bin = resolvedFfmpegPath ?? 'ffmpeg';
  try {
    const output = execSync(`"${bin}" -filters -hide_banner`, {
      encoding: 'utf-8',
      timeout: 10_000,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: buildMediaProcessEnv(bin),
    });
    cachedHasScaleCuda = output.includes('scale_cuda');
    console.log(`[FFmpeg] scale_cuda available: ${cachedHasScaleCuda}`);
  } catch {
    cachedHasScaleCuda = false;
  }
  return cachedHasScaleCuda;
}

export interface QualityParams {
  /** CRF value (15–35). Lower = better quality. Default: 20. */
  crf?: number;
  /** x264 encoding speed preset. Default: 'medium'. */
  preset?: 'ultrafast' | 'veryfast' | 'medium' | 'slow';
}

// VBV (Video Buffering Verifier) constraints — the rolling-average bitrate
// ceiling and the maximum buffer size. Pinning these ensures social platforms
// (TikTok, Reels, Shorts) accept the file without a punishing re-transcode at
// upload time and that no single GOP spikes into a bitrate they can't decode.
//
// 1080×1920 @ 30fps h.264 high profile peaks comfortably around 10–12 Mb/s
// even on noisy content; 14M / 28M leaves headroom for fast-motion bursts.
const VBV_MAXRATE = '14M';
const VBV_BUFSIZE = '28M';

export function getEncoder(quality?: QualityParams): EncoderConfig {
  const encoder = cachedEncoder ?? detectHardwareEncoder();
  const crf = quality?.crf ?? 20;
  const preset = quality?.preset ?? 'medium';

  switch (encoder) {
    case 'h264_nvenc': {
      // Map x264 preset to nvenc preset (p1=fastest, p7=slowest)
      // ultrafast→p1, veryfast→p2, medium→p5, slow→p6
      //
      // CRF maps to cq for NVENC, but NVENC's CQ scale is NOT equivalent to
      // libx264's CRF scale at the same numeric value. NVENC at CQ=N typically
      // produces output roughly 2 quality points worse than libx264 at CRF=N
      // (well-documented in NVIDIA's encoder guide and the FFmpeg wiki). To
      // give users on NVIDIA hardware visual parity with the software path,
      // we shift the cq value down by 2, floored at 10 so the segmented
      // render path (which encodes intermediates at CRF 12 for near-lossless
      // hand-off) can actually achieve transparency on the GPU path. For
      // normal user CRFs (17, 20, 23, 28) the floor never activates so this
      // doesn't change anything user-visible at the final-encode layer.
      const nvencCq = Math.max(10, crf - 2);
      //
      // Quality flags follow NVIDIA's documented "latency-tolerant
      // high-quality transcoding" preset (see Immich's NvencSwDecodeConfig and
      // NVIDIA Video Codec SDK 12.0 docs):
      //   -tune hq             optimise for quality, not low-latency
      //   -qmin 0              don't clamp the quantizer floor
      //   -rc-lookahead 20     enough frames to make smart bit allocation
      //   -spatial_aq 1        adaptive quantization across the frame
      //   -temporal-aq 1       adaptive quantization across time
      //   -i_qfactor 0.75      better-quality I-frames
      //   -b_ref_mode middle   (Turing+) pyramid B-frames, big quality win
      //   -b_qfactor 1.1       allow B-frames to use slightly more bits
      const flags = [
        '-preset',
        nvencPreset(preset),
        '-tune',
        'hq',
        '-rc',
        'vbr',
        '-cq',
        String(nvencCq),
        '-b:v',
        '0',
        '-maxrate',
        VBV_MAXRATE,
        '-bufsize',
        VBV_BUFSIZE,
        '-qmin',
        '0',
        '-rc-lookahead',
        '20',
        '-spatial_aq',
        '1',
        '-temporal-aq',
        '1',
        '-i_qfactor',
        '0.75',
        '-bf',
        '3',
      ];
      if (nvencSupportsBRefMode()) {
        flags.push('-b_ref_mode', 'middle', '-b_qfactor', '1.1');
      }
      return { encoder, presetFlag: flags };
    }
    case 'h264_qsv':
      // QSV quality: global_quality ~ CRF (higher = worse, so scale proportionally)
      return {
        encoder,
        presetFlag: [
          '-preset',
          'medium',
          '-global_quality',
          String(crf),
          '-look_ahead',
          '1',
          '-maxrate',
          VBV_MAXRATE,
          '-bufsize',
          VBV_BUFSIZE,
        ],
      };
    case 'h264_videotoolbox': {
      // Apple VideoToolbox constant-quality mode. Unlike libx264's CRF
      // (lower = better, 0–51), VideoToolbox's -q:v is an inverted 1–100
      // quality scale (higher = better). Map CRF onto it so the existing
      // quality presets (draft/normal/high) and near-lossless intermediates
      // (CRF 12) all translate sensibly:
      //   CRF 12 → ~77 (near-transparent intermediates)
      //   CRF 17 → ~68 (high preset)
      //   CRF 20 → ~62 (normal preset)
      //   CRF 28 → ~47 (draft preset)
      const vtQuality = Math.round(Math.min(85, Math.max(35, 100 - crf * 1.9)));
      // -allow_sw 1 lets VideoToolbox fall back to its own software encoder on
      // the rare Mac without a hardware H.264 engine instead of hard-failing.
      // VBV caps keep the file inside social-platform decode limits. There is
      // no x264-style speed preset — the media engine governs quality entirely
      // via -q:v — so the `preset` field is intentionally ignored here.
      return {
        encoder,
        presetFlag: [
          '-q:v',
          String(vtQuality),
          '-maxrate',
          VBV_MAXRATE,
          '-bufsize',
          VBV_BUFSIZE,
          '-allow_sw',
          '1',
          '-realtime',
          '0',
          '-profile:v',
          'high',
        ],
      };
    }
    default:
      return {
        encoder: 'libx264',
        presetFlag: [
          '-preset',
          preset,
          '-crf',
          String(crf),
          '-maxrate',
          VBV_MAXRATE,
          '-bufsize',
          VBV_BUFSIZE,
          '-profile:v',
          'high',
          '-level',
          '4.2',
          '-threads',
          '0',
        ],
      };
  }
}

function nvencPreset(x264Preset: 'ultrafast' | 'veryfast' | 'medium' | 'slow'): string {
  switch (x264Preset) {
    case 'ultrafast':
      return 'p1';
    case 'veryfast':
      return 'p2';
    // NVENC's quality preset curve flattens above p5 — p5 gives ~95% of p7's
    // quality at materially better speed, so we map 'medium' → p5 rather than
    // the older p4. 'slow' stays at p6.
    case 'medium':
      return 'p5';
    case 'slow':
      return 'p6';
  }
}

/** Software-only fallback encoder (always libx264, never GPU) */
export function getSoftwareEncoder(quality?: QualityParams): EncoderConfig {
  const crf = quality?.crf ?? 20;
  const preset = quality?.preset ?? 'medium';
  return {
    encoder: 'libx264',
    presetFlag: [
      '-preset',
      preset,
      '-crf',
      String(crf),
      '-maxrate',
      VBV_MAXRATE,
      '-bufsize',
      VBV_BUFSIZE,
      '-profile:v',
      'high',
      '-level',
      '4.2',
      '-threads',
      '0',
    ],
  };
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
  ];
  if (specificErrors.some((s) => errorMessage.includes(s))) return true;

  // FFmpeg tag-style error lines, e.g. "[h264_nvenc @ 0x...] ...failed" or
  // "[h264_qsv @ 0x...] Error...".  These only appear inside actual error
  // contexts, not in the configuration banner.
  const tagPattern =
    /\[(h264_nvenc|h264_qsv|h264_videotoolbox|hevc_nvenc|hevc_qsv|hevc_videotoolbox|cuda|scale_cuda|hwupload|hwdownload)\s*@\s*[0-9a-fx]+\]/i;
  if (tagPattern.test(errorMessage)) return true;

  // Contextual matches — "X failed" / "error X"
  const failurePattern =
    /(nvenc|h264_qsv|videotoolbox|hwupload_cuda|scale_cuda|cuda)\s+(?:failed|error|aborted|not (?:available|supported))/i;
  if (failurePattern.test(errorMessage)) return true;

  // Generic "out of memory" only counts when paired with a GPU-ish phrase.
  if (/out of memory/i.test(errorMessage) && /(cuda|nvenc|gpu|device)/i.test(errorMessage)) {
    return true;
  }

  return false;
}

/**
 * Whether the GPU encoder has been disabled for this session due to a crash.
 * Once set, all subsequent encodes use software fallback without even trying GPU.
 */
let gpuEncoderDisabledForSession = false;

/** Mark GPU encoder as broken for the rest of this app session. */
export function disableGpuEncoderForSession(): void {
  if (!gpuEncoderDisabledForSession) {
    gpuEncoderDisabledForSession = true;
    console.warn(
      '[FFmpeg] GPU encoder disabled for this session due to crash — all subsequent encodes will use software fallback',
    );
  }
}

/** Check if GPU encoder was disabled by a prior crash this session. */
export function isGpuEncoderDisabled(): boolean {
  return gpuEncoderDisabledForSession;
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
    'scale=$1:$2',
  );
}

export function isFFmpegAvailable(): boolean {
  return ffmpegReady;
}

// ---------------------------------------------------------------------------
// FfmpegCommand — child_process.spawn replacement for fluent-ffmpeg
// ---------------------------------------------------------------------------

export class FfmpegCommand extends EventEmitter {
  private inputs: Array<{ path: string; options: string[]; loop: boolean }> = [];
  private outputOpts: string[] = [];
  private vFilters: string[] = [];
  private _outputPath: string | null = null;
  private _noVideo = false;
  private _audioFreq: number | null = null;
  private _audioChannels: number | null = null;
  private _audioFilterStr: string | null = null;
  private _format: string | null = null;
  private _frames: number | null = null;
  private _duration: number | null = null;
  private proc: ChildProcess | null = null;

  constructor(inputPath?: string) {
    super();
    if (inputPath) this.inputs.push({ path: inputPath, options: [], loop: false });
  }

  input(path: string): this {
    this.inputs.push({ path, options: [], loop: false });
    return this;
  }

  inputOptions(opts: string[]): this {
    const cur = this.inputs[this.inputs.length - 1];
    if (cur) cur.options.push(...opts);
    return this;
  }

  seekInput(t: number): this {
    const cur = this.inputs[this.inputs.length - 1];
    if (cur) cur.options.push('-ss', String(t));
    return this;
  }

  loop(): this {
    const cur = this.inputs[this.inputs.length - 1];
    if (cur) cur.loop = true;
    return this;
  }

  setStartTime(t: number): this {
    return this.seekInput(t);
  }

  setDuration(d: number): this {
    this._duration = d;
    this.outputOpts.push('-t', String(d));
    return this;
  }

  duration(d: number): this {
    return this.setDuration(d);
  }

  frames(n: number): this {
    this._frames = n;
    return this;
  }
  noVideo(): this {
    this._noVideo = true;
    return this;
  }
  audioFrequency(freq: number): this {
    this._audioFreq = freq;
    return this;
  }
  audioChannels(n: number): this {
    this._audioChannels = n;
    return this;
  }
  audioFilters(filters: string[]): this {
    this._audioFilterStr = filters.join(',');
    return this;
  }
  format(fmt: string): this {
    this._format = fmt;
    return this;
  }

  videoFilters(filter: string): this {
    this.vFilters.push(filter);
    return this;
  }
  videoFilter(filter: string): this {
    return this.videoFilters(filter);
  }

  outputOptions(opts: string[]): this {
    this.outputOpts.push(...opts);
    return this;
  }
  output(path: string): this {
    this._outputPath = path;
    return this;
  }

  save(path: string): this {
    this._outputPath = path;
    this._exec();
    return this;
  }

  run(): this {
    this._exec();
    return this;
  }

  kill(signal: string = 'SIGTERM'): void {
    try {
      this.proc?.kill(signal as NodeJS.Signals);
    } catch {
      /* already dead */
    }
  }

  private buildArgs(): string[] {
    const args: string[] = [];

    for (const inp of this.inputs) {
      if (inp.loop) args.push('-loop', '1');
      args.push(...inp.options);
      args.push('-i', inp.path);
    }

    if (this.vFilters.length > 0) {
      args.push('-vf', this.vFilters.join(','));
    }

    if (this._noVideo) args.push('-vn');
    if (this._audioFreq !== null) args.push('-ar', String(this._audioFreq));
    if (this._audioChannels !== null) args.push('-ac', String(this._audioChannels));
    if (this._audioFilterStr) args.push('-af', this._audioFilterStr);
    if (this._format !== null) args.push('-f', this._format);
    if (this._frames !== null) args.push('-frames:v', String(this._frames));

    args.push(...this.outputOpts);
    args.push('-y');

    if (this._outputPath) args.push(this._outputPath);

    return args;
  }

  private _exec(): void {
    const bin = resolvedFfmpegPath ?? 'ffmpeg';
    const args = this.buildArgs();

    this.proc = spawn(bin, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: buildMediaProcessEnv(bin),
    });

    const cmdLine = `${bin} ${args.join(' ')}`;
    this.emit('start', cmdLine);

    let stderrBuf = '';
    const stderrLines: string[] = [];

    this.proc.stderr?.on('data', (chunk: Buffer) => {
      stderrBuf += chunk.toString();
      const lines = stderrBuf.split('\n');
      stderrBuf = lines.pop() ?? '';
      for (const line of lines) {
        stderrLines.push(line);
        this.emit('stderr', line);
        this.parseProgress(line);
      }
    });

    this.proc.on('close', (code) => {
      // Flush remaining stderr
      if (stderrBuf) {
        stderrLines.push(stderrBuf);
        this.emit('stderr', stderrBuf);
        this.parseProgress(stderrBuf);
      }

      if (code === 0) {
        this.emit('end');
      } else {
        const lastLines = stderrLines.slice(-20).join('\n');
        this.emit('error', new Error(`ffmpeg exited with code ${code}: ${lastLines}`));
      }
    });

    this.proc.on('error', (err) => {
      this.emit('error', err);
    });
  }

  private parseProgress(line: string): void {
    const timeMatch = line.match(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/);
    if (!timeMatch) return;
    const hours = parseInt(timeMatch[1], 10);
    const mins = parseInt(timeMatch[2], 10);
    const secs = parseFloat(timeMatch[3]);
    const timeSec = hours * 3600 + mins * 60 + secs;
    const timemark = `${timeMatch[1]}:${timeMatch[2]}:${timeMatch[3]}`;

    let percent = 0;
    if (this._duration && this._duration > 0) {
      percent = Math.min(100, (timeSec / this._duration) * 100);
    }
    this.emit('progress', { percent, timemark });
  }
}

// ---------------------------------------------------------------------------
// ffprobe replacement
// ---------------------------------------------------------------------------

interface FfprobeStream {
  codec_type: string;
  codec_name?: string;
  width?: number;
  height?: number;
  r_frame_rate?: string;
  avg_frame_rate?: string;
  // Video-stream duration. Often differs from format.duration when audio
  // padding makes the container longer than the video stream (or when GOP
  // rounding makes the video stream shorter than the requested duration).
  // Needed for xfade offset math — see getVideoMetadata.videoStreamDuration.
  duration?: string | number;
  nb_frames?: string | number;
}

interface FfprobeFormat {
  // ffprobe -print_format json returns numeric format fields as strings
  // (e.g. "123.456000"). Always parseFloat before use.
  duration?: string | number;
}

interface FfprobeData {
  streams: FfprobeStream[];
  format: FfprobeFormat;
}

export interface VideoMetadataOptions {
  /** Native file/pipe protocols only; authorized UNC/mounted shares may still use OS networking. */
  localOnly?: boolean;
  signal?: AbortSignal | undefined;
}

/** Opt-in guarded probe. Legacy callers below keep their existing behavior. */
async function ffprobeGuarded(
  filePath: string,
  options: VideoMetadataOptions,
): Promise<FfprobeData> {
  const { signal, localOnly } = options;
  signal?.throwIfAborted();
  if (localOnly) {
    const normalized = filePath.replace(/\\/g, '/');
    const drive = /^[a-z]:\//i.test(normalized);
    if (
      !isAbsolute(filePath) ||
      [...filePath].some((character) => character.charCodeAt(0) < 32) ||
      /^\/\/[?.](?:\/|$)/.test(normalized) ||
      normalized.slice(drive ? 2 : 0).includes(':') ||
      /^\/(?:dev|proc|sys)(?:\/|$)/.test(normalized) ||
      (process.platform === 'win32' &&
        normalized
          .split('/')
          .some((part) => /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)))
    )
      throw new Error(
        'Metadata requires an absolute native regular file, not a URL or device path.',
      );
    if (!(await stat(filePath)).isFile())
      throw new Error('Metadata source must be a regular file.');
  }
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const bin = resolvedFfprobePath ?? 'ffprobe';
    const proc = spawn(
      bin,
      [
        '-v',
        'error',
        '-print_format',
        'json',
        '-show_format',
        '-show_streams',
        ...(localOnly ? ['-protocol_whitelist', 'file,pipe'] : []),
        filePath,
      ],
      { env: buildMediaProcessEnv(bin), stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true },
    );
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let failure: unknown;
    let stopped = false;
    let settled = false;
    const cleanup = (): void => {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abort);
    };
    // A metadata-only child owns no output file to flush. Kill immediately, settle on close.
    const stop = (error: unknown): void => {
      if (stopped || settled) return;
      stopped = true;
      failure = error;
      proc.kill('SIGKILL');
    };
    const abort = (): void => stop(signal?.reason ?? new Error('Metadata probe cancelled.'));
    const timeout = setTimeout(
      () => stop(new Error('Metadata probe timed out after 30 seconds.')),
      30_000,
    );
    proc.stdout.on('data', (chunk: Buffer) => {
      if (stopped || settled) return;
      stdoutBytes += chunk.length;
      if (stdoutBytes > 4 * 1024 * 1024)
        stop(new Error('Metadata probe stdout output limit exceeded.'));
      else stdout.push(chunk);
    });
    proc.stderr.on('data', (chunk: Buffer) => {
      if (stopped || settled) return;
      stderrBytes += chunk.length;
      if (stderrBytes > 64 * 1024) stop(new Error('Metadata probe stderr output limit exceeded.'));
      else stderr.push(chunk);
    });
    proc.once('error', (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(stopped ? failure : error);
    });
    proc.once('close', (code) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (stopped) {
        reject(failure);
        return;
      }
      if (code !== 0) {
        reject(new Error(`ffprobe exited ${code}: ${Buffer.concat(stderr).toString('utf8')}`));
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(stdout).toString('utf8')));
      } catch (error) {
        reject(error);
      }
    });
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
  });
}

function ffprobeRaw(filePath: string, options?: VideoMetadataOptions): Promise<FfprobeData> {
  if (options?.localOnly || options?.signal) return ffprobeGuarded(filePath, options);
  return new Promise((resolve, reject) => {
    const bin = resolvedFfprobePath ?? 'ffprobe';

    // Log which binary we're using for debugging
    console.log(`[ffprobeRaw] Using binary: ${bin}`);
    console.log(`[ffprobeRaw] Resolved path: ${resolvedFfprobePath ?? 'fallback to PATH'}`);

    const args = [
      '-v',
      'quiet',
      '-print_format',
      'json',
      '-show_format',
      '-show_streams',
      filePath,
    ];

    const proc = spawn(bin, args, {
      env: { ...process.env, PATH: process.env.PATH },
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (d: Buffer) => {
      stdout += d.toString();
    });
    proc.stderr.on('data', (d: Buffer) => {
      stderr += d.toString();
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        console.error(`[ffprobeRaw] Exited with code ${code}, stderr: ${stderr}`);
        return reject(new Error(`ffprobe exited ${code}: ${stderr}`));
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (e) {
        reject(e);
      }
    });

    proc.on('error', (err) => {
      console.error(`[ffprobeRaw] Spawn error:`, err);
      reject(err);
    });
  });
}

// ---------------------------------------------------------------------------
// Video metadata / helpers
// ---------------------------------------------------------------------------

export async function getVideoMetadata(
  filePath: string,
  options?: VideoMetadataOptions,
): Promise<{
  duration: number;
  videoStreamDuration: number;
  width: number;
  height: number;
  codec: string;
  fps: number;
  audioCodec: string;
}> {
  const metadata = await ffprobeRaw(filePath, options);
  const video = metadata.streams.find((s) => s.codec_type === 'video');
  if (!video) throw new Error('No video stream found');
  const audio = metadata.streams.find((s) => s.codec_type === 'audio');
  // Parse r_frame_rate (e.g. "30/1", "30000/1001")
  let fps = 0;
  const rateStr = video.r_frame_rate || video.avg_frame_rate || '';
  if (rateStr) {
    const parts = rateStr.split('/');
    if (parts.length === 2) {
      const num = parseFloat(parts[0]);
      const den = parseFloat(parts[1]);
      if (den > 0) fps = num / den;
    } else {
      fps = parseFloat(rateStr) || 0;
    }
  }
  // ffprobe JSON returns format.duration as a string — coerce to number.
  const rawDuration = metadata.format.duration;
  const parsedDuration =
    typeof rawDuration === 'number'
      ? rawDuration
      : typeof rawDuration === 'string'
        ? parseFloat(rawDuration)
        : NaN;
  const duration = Number.isFinite(parsedDuration) && parsedDuration > 0 ? parsedDuration : 0;

  // Video-stream duration. This is what xfade actually sees — not the
  // container duration, which is often inflated by audio padding. Some
  // encoders/containers omit `stream.duration`; in that case derive it from
  // `nb_frames / fps` if both are available, otherwise fall back to the
  // container duration.
  const rawStreamDuration = video.duration;
  const parsedStreamDuration =
    typeof rawStreamDuration === 'number'
      ? rawStreamDuration
      : typeof rawStreamDuration === 'string'
        ? parseFloat(rawStreamDuration)
        : NaN;
  let videoStreamDuration =
    Number.isFinite(parsedStreamDuration) && parsedStreamDuration > 0 ? parsedStreamDuration : 0;
  if (videoStreamDuration === 0) {
    const rawFrames = video.nb_frames;
    const frames =
      typeof rawFrames === 'number'
        ? rawFrames
        : typeof rawFrames === 'string'
          ? parseFloat(rawFrames)
          : NaN;
    if (Number.isFinite(frames) && frames > 0 && fps > 0) {
      videoStreamDuration = frames / fps;
    } else {
      videoStreamDuration = duration;
    }
  }

  return {
    duration,
    videoStreamDuration,
    width: video.width || 0,
    height: video.height || 0,
    codec: video.codec_name || 'unknown',
    fps,
    audioCodec: audio?.codec_name || 'unknown',
  };
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
      .save(outputPath);
  });
}

export function trimVideo(
  inputPath: string,
  outputPath: string,
  startTime: number,
  endTime: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    new FfmpegCommand(inputPath)
      .setStartTime(startTime)
      .setDuration(endTime - startTime)
      .outputOptions(['-c', 'copy'])
      .on('end', () => resolve(outputPath))
      .on('error', () => {
        // Fallback: re-encode if stream copy fails
        const { encoder, presetFlag } = getEncoder();
        new FfmpegCommand(inputPath)
          .inputOptions(['-hwaccel', 'auto'])
          .setStartTime(startTime)
          .setDuration(endTime - startTime)
          .outputOptions(['-c:v', encoder, ...presetFlag, '-c:a', 'aac'])
          .on('end', () => resolve(outputPath))
          .on('error', reject)
          .save(outputPath);
      })
      .save(outputPath);
  });
}

export function trimVideoReencode(
  inputPath: string,
  outputPath: string,
  startTime: number,
  endTime: number,
): Promise<string> {
  const { encoder, presetFlag } = getEncoder();
  return new Promise((resolve, reject) => {
    new FfmpegCommand(inputPath)
      .inputOptions(['-hwaccel', 'auto'])
      .setStartTime(startTime)
      .setDuration(endTime - startTime)
      .outputOptions(['-c:v', encoder, ...presetFlag, '-c:a', 'aac'])
      .on('end', () => resolve(outputPath))
      .on('error', reject)
      .save(outputPath);
  });
}

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Crop input video to the given rectangle and scale to target resolution
 * (default 1080x1920 — the locked 9:16 vertical canvas).
 * Uses hardware encoder with software fallback.
 */
export function cropAndExport(
  inputPath: string,
  outputPath: string,
  crop: CropRect,
  resolution: { width: number; height: number } = { width: OUTPUT_WIDTH, height: OUTPUT_HEIGHT },
): Promise<string> {
  const cropFilter = `crop=${crop.width}:${crop.height}:${crop.x}:${crop.y}`;
  // Lanczos + accurate rounding + full-chroma interpolation matches the base
  // render path. Default bilinear softens detail noticeably on faces.
  const scaleFilter = `scale=${resolution.width}:${resolution.height}:flags=lanczos+accurate_rnd+full_chroma_int`;
  const videoFilter = `${cropFilter},${scaleFilter}`;

  const gpuOff = isGpuEncoderDisabled();
  const { encoder, presetFlag } = gpuOff ? getSoftwareEncoder() : getEncoder();

  return new Promise((resolve, reject) => {
    let stderrOutput = '';
    const cmd = new FfmpegCommand(inputPath);
    if (!gpuOff) {
      cmd.inputOptions(['-hwaccel', 'auto']);
    }
    cmd
      .videoFilters(videoFilter)
      .outputOptions(['-c:v', encoder, ...presetFlag, '-c:a', 'aac'])
      .on('stderr', (line: string) => {
        stderrOutput += `${line}\n`;
      })
      .on('end', () => resolve(outputPath))
      .on('error', (err: Error) => {
        if (isGpuSessionError(`${err.message}\n${stderrOutput}`)) {
          // Retry with software encoder
          disableGpuEncoderForSession();
          const sw = getSoftwareEncoder();
          new FfmpegCommand(inputPath)
            .videoFilters(videoFilter)
            .outputOptions(['-c:v', sw.encoder, ...sw.presetFlag, '-c:a', 'aac'])
            .on('end', () => resolve(outputPath))
            .on('error', reject)
            .save(outputPath);
        } else {
          reject(err);
        }
      })
      .save(outputPath);
  });
}

/**
 * Extract a single frame as a base64 PNG data URI.
 * @param videoPath  Path to the input video
 * @param timeSec    Seek position in seconds (defaults to 1s or duration/10)
 */
export function generateThumbnail(videoPath: string, timeSec?: number): Promise<string> {
  return new Promise((resolve, reject) => {
    // Determine seek time: use provided value or fall back to 1 second
    const seekSec = timeSec ?? 1;

    const tmpFile = join(tmpdir(), `batchcontent-thumb-${Date.now()}.png`);

    new FfmpegCommand(videoPath)
      .seekInput(seekSec)
      .frames(1)
      .outputOptions(['-vf', 'scale=320:-1'])
      .on('end', () => {
        try {
          const buffer = readFileSync(tmpFile);
          const base64 = buffer.toString('base64');
          resolve(`data:image/png;base64,${base64}`);
        } catch (readErr) {
          reject(readErr);
        }
      })
      .on('error', reject)
      .save(tmpFile);
  });
}

// ---------------------------------------------------------------------------
// Script cue segment splitting
// ---------------------------------------------------------------------------

export interface SplitSegment {
  label: string;
  startTime: number;
  endTime: number;
}

export interface SplitResult {
  label: string;
  outputPath: string;
}

function sanitizeLabel(label: string): string {
  return label
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

export async function splitSegments(
  inputPath: string,
  segments: SplitSegment[],
  outputDir: string,
): Promise<SplitResult[]> {
  const results: SplitResult[] = [];
  for (const segment of segments) {
    const filename = `${sanitizeLabel(segment.label)}.mp4`;
    const outputPath = join(outputDir, filename);
    await trimVideo(inputPath, outputPath, segment.startTime, segment.endTime);
    results.push({ label: segment.label, outputPath });
  }
  return results;
}

/** Return the resolved ffmpeg binary path (or null if not yet resolved). */
export function getResolvedFfmpegPath(): string | null {
  return resolvedFfmpegPath;
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
  numPoints = 500,
): number[] {
  const bin = resolvedFfmpegPath ?? 'ffmpeg';
  const duration = endTime - startTime;

  // Use a low sample rate to keep PCM buffer small (8 kHz mono = 8000 samples/s)
  const sampleRate = 8000;

  const result = spawnSync(
    bin,
    [
      '-ss',
      String(startTime),
      '-t',
      String(duration),
      '-i',
      videoPath,
      '-vn',
      '-ac',
      '1',
      '-ar',
      String(sampleRate),
      '-f',
      's16le', // raw signed 16-bit little-endian PCM
      '-', // pipe to stdout
    ],
    {
      maxBuffer: 20 * 1024 * 1024, // 20 MB — ample for any clip
      env: buildMediaProcessEnv(bin),
    },
  );

  if (result.error || !result.stdout || result.stdout.length === 0) {
    // No audio stream or read failed — return flat line
    return new Array(numPoints).fill(0);
  }

  const pcm = result.stdout as Buffer;
  const totalSamples = Math.floor(pcm.length / 2); // 2 bytes per int16 sample

  if (totalSamples === 0) {
    return new Array(numPoints).fill(0);
  }

  // Bucket samples into `numPoints` groups, take peak amplitude of each bucket
  const samplesPerBucket = Math.max(1, Math.floor(totalSamples / numPoints));
  const peaks: number[] = [];

  for (let i = 0; i < numPoints; i++) {
    const bucketStart = i * samplesPerBucket;
    const bucketEnd = Math.min(bucketStart + samplesPerBucket, totalSamples);
    let peak = 0;
    for (let j = bucketStart; j < bucketEnd; j++) {
      const byteOffset = j * 2;
      // Read as signed 16-bit little-endian
      const lo = pcm[byteOffset];
      const hi = pcm[byteOffset + 1];
      let sample = (hi << 8) | lo;
      if (sample >= 0x8000) sample -= 0x10000; // sign-extend
      const abs = Math.abs(sample);
      if (abs > peak) peak = abs;
    }
    // Normalize to [0, 1] (int16 max is 32767)
    peaks.push(peak / 32767);
  }

  return peaks;
}

// ---------------------------------------------------------------------------
// Factory export — drop-in replacement for `ffmpeg(path)` call sites
// ---------------------------------------------------------------------------

export function ffmpeg(inputPath?: string): FfmpegCommand {
  return new FfmpegCommand(inputPath);
}
