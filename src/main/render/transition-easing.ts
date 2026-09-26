// ---------------------------------------------------------------------------
// Transition easing — pure curve math + FFmpeg expression builders.
// ---------------------------------------------------------------------------
//
// Every transition in the app used to run on a LINEAR ramp (xfade `fade`,
// `fade=alpha=1`, linear overlay swipes, triangle zoom curves). Linear motion
// starts and stops abruptly, which reads as "mechanical". This module is the
// single source for eased curves, in two forms that must agree:
//
//   - `ease(name, q)`      — JS evaluation (tests, per-frame step tables)
//   - `easeExpr(name, q)`  — the same curve as an FFmpeg expression string
//
// Curve choices follow what mature editors ship: smoothstep for dissolves
// (hyperframes' shader transitions), cubic in/out for motion across the frame
// (Remotion `Easing.inOut(Easing.cubic)`, cartcut's transition geometry).
//
// FFmpeg notes (bundled ffmpeg-static is 6.0):
//   - xfade has no `easing` option before 7.1, so eased transitions are built
//     with `transition=custom:expr=...`. In xfade, P runs 1 → 0 across the
//     transition, so forward progress is `(1-P)`.
//   - xfade only negotiates non-subsampled formats (yuv444p, gbrp, …), so every
//     plane has the full W×H and `a0..a3(x,y)` / `b0..b3(x,y)` sample planes
//     at identical coordinates regardless of the negotiated format.
//   - Returned expressions contain commas. Callers must wrap them in single
//     quotes (xfade / overlay) or pass them through `escapeExprCommas` when the
//     surrounding filter string escapes commas.
// ---------------------------------------------------------------------------

export type EaseName = 'linear' | 'smoothstep' | 'easeInCubic' | 'easeOutCubic' | 'easeInOutCubic';

function clamp01(q: number): number {
  if (Number.isNaN(q)) return 0;
  return q < 0 ? 0 : q > 1 ? 1 : q;
}

/** Evaluate an easing curve at progress `q` (clamped to [0, 1]). */
export function ease(name: EaseName, q: number): number {
  const x = clamp01(q);
  switch (name) {
    case 'linear':
      return x;
    case 'smoothstep':
      return x * x * (3 - 2 * x);
    case 'easeInCubic':
      return x * x * x;
    case 'easeOutCubic':
      return 1 - (1 - x) ** 3;
    case 'easeInOutCubic':
      return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
  }
}

/**
 * The same curve as `ease()`, as an FFmpeg expression over the progress
 * expression `q`. `q` is inserted verbatim (wrapped in parens) and must already
 * be clamped to [0, 1] — use `clampedProgressExpr` for time-based progress.
 */
export function easeExpr(name: EaseName, q: string): string {
  const x = `(${q})`;
  switch (name) {
    case 'linear':
      return x;
    case 'smoothstep':
      return `(${x}*${x}*(3-2*${x}))`;
    case 'easeInCubic':
      return `(${x}*${x}*${x})`;
    case 'easeOutCubic':
      return `(1-pow(1-${x},3))`;
    case 'easeInOutCubic':
      return `if(lt(${x},0.5),4*${x}*${x}*${x},1-pow(2-2*${x},3)/2)`;
  }
}

/** Progress of `t` through [start, start+duration], clamped to [0, 1]. */
export function clampedProgressExpr(start: number, duration: number, timeVar = 't'): string {
  const d = Math.max(duration, 1e-3);
  return `clip((${timeVar}-${start.toFixed(3)})/${d.toFixed(3)},0,1)`;
}

/** Escape commas for filter strings that are not protected by single quotes. */
export function escapeExprCommas(expr: string): string {
  return expr.replace(/,/g, '\\,');
}

/** Round a duration to a whole number of frames (minimum one frame). */
export function quantizeToFrames(seconds: number, fps: number): number {
  const safeFps = Math.max(1, fps);
  return Math.max(1, Math.round(seconds * safeFps)) / safeFps;
}

// ---------------------------------------------------------------------------
// xfade custom expressions
// ---------------------------------------------------------------------------

/** Eased forward progress (0 → 1) inside an xfade custom expression. */
function xfadeEased(name: EaseName): string {
  return easeExpr(name, '1-P');
}

/** Sample input `src` at (x, y) on the plane currently being evaluated. */
function samplePlane(src: 'a' | 'b', x: string, y: string): string {
  return (
    `if(eq(PLANE,0),${src}0(${x},${y}),` +
    `if(eq(PLANE,1),${src}1(${x},${y}),` +
    `if(eq(PLANE,2),${src}2(${x},${y}),${src}3(${x},${y}))))`
  );
}

/**
 * Eased dissolve: a crossfade whose opacity follows smoothstep instead of a
 * straight line, so the blend eases out of the old shot and settles into the
 * new one. Per-pixel cost is a single multiply-add.
 */
export function buildSmoothDissolveExpr(): string {
  const e = xfadeEased('smoothstep');
  return `A+(B-A)*${e}`;
}

/**
 * Panel-in: full-frame shot → split layout whose media panel occupies the TOP
 * `seamFraction` of the frame (split-image is 0.5).
 *
 *   - The incoming media panel slides DOWN from above the frame, eased.
 *   - Rows above the seam not yet covered keep showing the outgoing shot.
 *   - Rows below the seam dissolve from the full-frame shot into the incoming
 *     speaker panel, so the face region settles in place rather than jumping.
 */
export function buildPanelInExpr(seamFraction = 0.5): string {
  const e = xfadeEased('easeInOutCubic');
  const seam = `(H*${seamFraction.toFixed(4)})`;
  const panelBottom = `(${seam}*${e})`;
  const srcY = `(Y+${seam}-${panelBottom})`;
  return (
    `if(lt(Y,${panelBottom}),${samplePlane('b', 'X', srcY)},` + `if(lt(Y,${seam}),A,A+(B-A)*${e}))`
  );
}

/**
 * Panel-out: split layout (media panel on top) → full-frame shot. Mirror of
 * `buildPanelInExpr`: the media panel slides UP out of frame, revealing the
 * incoming full-frame shot behind it, while the speaker panel dissolves into
 * the incoming frame.
 */
export function buildPanelOutExpr(seamFraction = 0.5): string {
  const e = xfadeEased('easeInOutCubic');
  const seam = `(H*${seamFraction.toFixed(4)})`;
  const panelBottom = `(${seam}*(1-${e}))`;
  const srcY = `(Y+${seam}-${panelBottom})`;
  return (
    `if(lt(Y,${panelBottom}),${samplePlane('a', 'X', srcY)},` + `if(lt(Y,${seam}),B,A+(B-A)*${e}))`
  );
}

/** Wrap a custom expression as an xfade `transition=` value. */
export function xfadeCustomTransition(expr: string): string {
  return `custom:expr='${expr}'`;
}

// ---------------------------------------------------------------------------
// Overlay helpers (b-roll / cards composited with `overlay`)
// ---------------------------------------------------------------------------

/**
 * Per-frame eased opacity envelope for an RGBA stream, as a chain of
 * `colorchannelmixer=aa=…` steps each enabled for exactly one frame.
 *
 * The `fade` filter only ramps linearly and there is no cheap per-pixel eased
 * alternative (`geq` evaluates every pixel of every frame). A one-frame
 * `colorchannelmixer` per ramp frame costs a few table lookups, and outside
 * the ramp windows every step is disabled (pass-through).
 *
 * `start`/`end` are the stream's visible window on the output timeline;
 * frames are assumed to land on `start + n/fps`.
 */
export function buildEasedAlphaEnvelope(
  start: number,
  end: number,
  rampSeconds: number,
  fps: number,
  curve: EaseName = 'smoothstep',
): string {
  const safeFps = Math.max(1, fps);
  const span = Math.max(0, end - start);
  const rampFrames = Math.min(Math.round(rampSeconds * safeFps), Math.floor((span * safeFps) / 2));
  if (rampFrames < 1) return 'null';

  const half = 0.5 / safeFps;
  const steps: string[] = [];
  const pushStep = (frameTime: number, alpha: number): void => {
    steps.push(
      `colorchannelmixer=aa=${alpha.toFixed(4)}:` +
        `enable='gte(t,${(frameTime - half).toFixed(4)})*lt(t,${(frameTime + half).toFixed(4)})'`,
    );
  };

  // Entry: frame k of rampFrames+1 → eased k/(rampFrames+1). Never fully 0 on
  // the first visible frame (that frame would be wasted) nor 1 inside the ramp.
  for (let k = 0; k < rampFrames; k++) {
    pushStep(start + k / safeFps, ease(curve, (k + 1) / (rampFrames + 1)));
  }
  // Exit: mirror of entry, ending on the last visible frame.
  const lastFrame = start + (Math.ceil(span * safeFps) - 1) / safeFps;
  for (let k = 0; k < rampFrames; k++) {
    pushStep(lastFrame - k / safeFps, ease(curve, (k + 1) / (rampFrames + 1)));
  }
  return steps.join(',');
}

/**
 * Eased enter/exit offset for an overlay coordinate. Returns an expression
 * (unescaped commas; wrap in single quotes) that is `from` at `start`, eases
 * to `rest` by `start+dur`, holds, then eases to `to` over the final `dur`.
 */
export function buildEasedMotionExpr(opts: {
  start: number;
  end: number;
  dur: number;
  from: number;
  rest: number;
  to: number;
  enterCurve?: EaseName;
  exitCurve?: EaseName;
}): string {
  const { start, end, dur, from, rest, to } = opts;
  const enter = easeExpr(opts.enterCurve ?? 'easeOutCubic', clampedProgressExpr(start, dur));
  const exitStart = end - dur;
  const exit = easeExpr(opts.exitCurve ?? 'easeInCubic', clampedProgressExpr(exitStart, dur));
  const inPart = `(${from})+(${rest - from})*${enter}`;
  const outPart = `(${rest})+(${to - rest})*${exit}`;
  return `if(lt(t,${exitStart.toFixed(3)}),${inPart},${outPart})`;
}
