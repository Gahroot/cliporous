// Renderer test setup.
//
// jsdom and globals are configured declaratively in vitest.config.ts. This
// file wires up jest-dom matchers and the small set of browser APIs that
// jsdom doesn't ship but that Radix / shadcn rely on at render time.

import '@testing-library/jest-dom/vitest'

// ── ResizeObserver — Radix Slider/Select rely on it ───────────────────────
class MockResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
if (typeof globalThis.ResizeObserver === 'undefined') {
  ;(globalThis as unknown as { ResizeObserver: typeof MockResizeObserver }).ResizeObserver =
    MockResizeObserver
}

// ── scrollIntoView — Radix Select calls this when items mount ─────────────
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoView(): void {}
}

// ── PointerEvent — Radix Slider uses pointer capture which jsdom omits ────
if (typeof Element !== 'undefined') {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = (): boolean => false
  }
  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = (): void => {}
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = (): void => {}
  }
}
