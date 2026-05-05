/**
 * Face-tracking animated crop filter builder
 *
 * Generates an FFmpeg filter string that animates the crop region to follow
 * face positions over time. Returns null when the timeline is insufficient.
 */

export interface FaceTrackEntry {
  /** Time in seconds (clip-local) */
  t: number
  /** Face bounding box in source pixels */
  x: number
  y: number
  w: number
  h: number
}

/**
 * Build an FFmpeg filter string that smoothly pans/crops to follow the face
 * timeline across the clip duration.
 *
 * @returns A filter string like `crop=...,scale=...` or `null` if the
 *          timeline can't produce a meaningful animation.
 */
export function buildFaceTrackCropFilter(
  timeline: FaceTrackEntry[],
  sourceWidth: number,
  sourceHeight: number,
  outWidth: number,
  outHeight: number
): string | null {
  if (timeline.length < 2) return null

  // Compute the target crop dimensions (9:16 from source)
  const cropW = Math.min(sourceWidth, Math.round(sourceHeight * (outWidth / outHeight)))
  const cropH = Math.min(sourceHeight, Math.round(sourceWidth * (outHeight / outWidth)))

  // Simplified approach: interpolate between first and last keyframe
  const first = timeline[0]
  const last = timeline[timeline.length - 1]
  const dur = last.t - first.t
  if (dur <= 0) return null

  const cx0 = Math.round(first.x + first.w / 2)
  const cy0 = Math.round(first.y + first.h / 2)
  const cx1 = Math.round(last.x + last.w / 2)
  const cy1 = Math.round(last.y + last.h / 2)

  const x0 = Math.max(0, Math.min(sourceWidth - cropW, cx0 - Math.round(cropW / 2)))
  const y0 = Math.max(0, Math.min(sourceHeight - cropH, cy0 - Math.round(cropH / 2)))
  const x1 = Math.max(0, Math.min(sourceWidth - cropW, cx1 - Math.round(cropW / 2)))
  const y1 = Math.max(0, Math.min(sourceHeight - cropH, cy1 - Math.round(cropH / 2)))

  const progress = `(t-${first.t})/${dur}`
  const xExpr = x0 === x1 ? `${x0}` : `${x0}+(${x1}-${x0})*${progress}`
  const yExpr = y0 === y1 ? `${y0}` : `${y0}+(${y1}-${y0})*${progress}`

  return `crop=${cropW}:${cropH}:'${xExpr}':'${yExpr}',scale=${outWidth}:${outHeight}:flags=lanczos`
}
