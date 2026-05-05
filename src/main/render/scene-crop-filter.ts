/**
 * Scene-aware crop filter builder.
 *
 * When a clip has a cropTimeline (per-scene crops from face_detect.py), this
 * module emits an FFmpeg `crop` filter whose x/y are expressions that switch
 * rectangles at clip-local time boundaries.
 *
 * Reference: the crop filter's `t` variable is unreliable across FFmpeg
 * versions; `n/FPS` is the stable alternative. See:
 *   https://github.com/anxiong2025/zureshot/blob/main/src-tauri/src/platform/macos/editor.rs#L665
 */

export interface CropTimelineEntry {
  /** Source-video absolute start time (seconds). */
  startTime: number
  /** Source-video absolute end time (seconds). */
  endTime: number
  x: number
  y: number
  width: number
  height: number
  faceDetected: boolean
}

/**
 * Convert a source-time timeline into a local-time timeline [clip-local seconds].
 * Entries outside [localStart, localEnd] are dropped. Clamping to the window
 * ensures no gap/overlap at boundaries.
 */
export function sliceTimelineToWindow(
  timeline: CropTimelineEntry[],
  clipStart: number,
  localStart = 0,
  localEnd = Infinity
): Array<{ startLocal: number; endLocal: number; x: number; y: number; width: number; height: number }> {
  const out: Array<{ startLocal: number; endLocal: number; x: number; y: number; width: number; height: number }> = []

  for (const entry of timeline) {
    const sLocal = entry.startTime - clipStart
    const eLocal = entry.endTime - clipStart
    const s = Math.max(sLocal, localStart)
    const e = Math.min(eLocal, localEnd)
    if (e - s < 0.05) continue
    out.push({ startLocal: s, endLocal: e, x: entry.x, y: entry.y, width: entry.width, height: entry.height })
  }

  if (out.length === 0) return out
  out.sort((a, b) => a.startLocal - b.startLocal)
  out[0].startLocal = localStart === -Infinity ? out[0].startLocal : Math.max(localStart, out[0].startLocal)
  if (localEnd !== Infinity) {
    out[out.length - 1].endLocal = Math.min(localEnd, out[out.length - 1].endLocal)
  }
  return out
}

/**
 * Build a nested `if` FFmpeg expression for a value that switches at
 * segment-local time boundaries. `fps` is needed because the `t` var is
 * unreliable inside the crop filter; we use `n/FPS` instead.
 *
 * Example with fps=30 and entries [{T=0..5, v=100}, {T=5..12, v=450}]:
 *   "if(lt(n/30,5),100,450)"
 *
 * Entries must be pre-sorted by startLocal. The final entry is the fallback
 * (used for any time >= the last boundary).
 */
function buildStepExpr(
  entries: Array<{ startLocal: number; endLocal: number; value: number }>,
  fps: number
): string {
  if (entries.length === 0) return '0'
  if (entries.length === 1) return String(entries[0].value)

  // Collapse when every entry has the same value — a constant expression saves
  // a pointless nested-if chain in the ffmpeg command.
  const first = entries[0].value
  if (entries.every((e) => e.value === first)) return String(first)

  // Build nested if(lt(n/fps, T_next), v_cur, <rest>)
  // Iterate from first to second-to-last; the last is the outermost fallback.
  let expr = String(entries[entries.length - 1].value)
  for (let i = entries.length - 2; i >= 0; i--) {
    const boundary = entries[i].endLocal
    expr = `if(lt(n/${fps},${boundary.toFixed(3)}),${entries[i].value},${expr})`
  }
  return expr
}

/**
 * Build a `crop=w:h:x:y` filter string. When `timeline` has >1 entry, x and
 * y become step expressions that switch at scene boundaries. Otherwise we
 * emit a static crop.
 *
 * Returns null when no usable crop can be built (no timeline AND no default).
 */
export function buildSceneCropFilter(
  timeline: CropTimelineEntry[] | undefined,
  defaultCrop: { x: number; y: number; width: number; height: number } | undefined,
  clipStart: number,
  localStart: number,
  localEnd: number,
  sourceWidth: number,
  sourceHeight: number,
  fps: number
): string | null {
  const sliced = timeline ? sliceTimelineToWindow(timeline, clipStart, localStart, localEnd) : []

  if (sliced.length >= 1) {
    // Use the first entry's dims as canonical (all entries should share dims).
    const cw = Math.min(sliced[0].width, sourceWidth)
    const ch = Math.min(sliced[0].height, sourceHeight)

    const clampX = (x: number): number => Math.max(0, Math.min(x, sourceWidth - cw))
    const clampY = (y: number): number => Math.max(0, Math.min(y, sourceHeight - ch))

    // Single scene collapses to a static crop (no expression overhead).
    if (sliced.length === 1) {
      return `crop=${cw}:${ch}:${clampX(sliced[0].x)}:${clampY(sliced[0].y)}`
    }

    const xEntries = sliced.map((e) => ({
      startLocal: e.startLocal,
      endLocal: e.endLocal,
      value: clampX(e.x)
    }))
    const yEntries = sliced.map((e) => ({
      startLocal: e.startLocal,
      endLocal: e.endLocal,
      value: clampY(e.y)
    }))

    const xExpr = buildStepExpr(xEntries, Math.max(1, fps))
    const yExpr = buildStepExpr(yEntries, Math.max(1, fps))

    return `crop=${cw}:${ch}:'${xExpr}':'${yExpr}'`
  }

  if (defaultCrop) {
    const cw = Math.min(defaultCrop.width, sourceWidth)
    const ch = Math.min(defaultCrop.height, sourceHeight)
    const cx = Math.max(0, Math.min(defaultCrop.x, sourceWidth - cw))
    const cy = Math.max(0, Math.min(defaultCrop.y, sourceHeight - ch))
    return `crop=${cw}:${ch}:${cx}:${cy}`
  }

  return null
}
