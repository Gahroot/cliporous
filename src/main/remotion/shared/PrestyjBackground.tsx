import React from 'react'
import { AbsoluteFill, useCurrentFrame, interpolate } from 'remotion'
import { BRAND_BG } from '../../edit-styles/shared/brand'

interface Props {
  /** PRESTYJ accent (BRAND_ACCENT). Drives the gradient warmth. */
  accentColor: string
}

/**
 * Premium dark background: deep gradient + subtle radial vignette + film grain.
 * Three signals working together is what reads as "expensive" vs flat black.
 *
 * The base hue is BRAND_BG (#23100c — deep warm brown), so the brand identity
 * carries through every Remotion segment and matches the rest of the app's
 * surface treatment.
 *
 * Grain intensity is ~3% — visible at 100% playback, invisible if you stare
 * at a single frame. That's the trick.
 */
export const PrestyjBackground: React.FC<Props> = ({ accentColor }) => {
  const frame = useCurrentFrame()

  // Slow ambient drift on the gradient origin so the bg breathes (not static).
  const driftX = interpolate(frame, [0, 300], [50, 55])
  const driftY = interpolate(frame, [0, 300], [40, 45])

  return (
    <AbsoluteFill style={{ overflow: 'hidden', backgroundColor: BRAND_BG }}>
      {/* Base brand gradient — accent halo melting into BRAND_BG. */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse at ${driftX}% ${driftY}%, ${accentColor}26 0%, ${BRAND_BG} 55%, #140804 100%)`
        }}
      />
      {/* Vignette — pulls focus to center without being obvious. */}
      <AbsoluteFill
        style={{
          background:
            'radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.55) 100%)'
        }}
      />
      {/* Film grain via SVG turbulence — purely decorative, ~3% opacity. */}
      <AbsoluteFill style={{ opacity: 0.04, mixBlendMode: 'overlay' }}>
        <svg width="100%" height="100%" preserveAspectRatio="none">
          <filter id="grain">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
            <feColorMatrix type="saturate" values="0" />
          </filter>
          <rect width="100%" height="100%" filter="url(#grain)" />
        </svg>
      </AbsoluteFill>
    </AbsoluteFill>
  )
}
