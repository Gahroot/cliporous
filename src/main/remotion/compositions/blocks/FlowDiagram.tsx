import React from 'react'
import { AbsoluteFill, useCurrentFrame, interpolate } from 'remotion'
import { BRAND_ACCENT } from '../../../edit-styles/shared/brand'
import { EASE } from '../../shared/easing'
import { DarkCard } from '../../shared/primitives'
import { PrestyjFonts } from '../../shared/fonts'
import type { FlowDiagramProps } from './types'

/* ------------------------------------------------------------------ */
/*  FlowDiagram — horizontal connected-node pipeline                    */
/* ------------------------------------------------------------------ */

const NODE_WIDTH = 130
const NODE_HEIGHT = 80
const CONNECTOR_WIDTH = 48

export const FlowDiagram: React.FC<FlowDiagramProps> = ({
  title,
  nodes,
  accentColor = BRAND_ACCENT
}) => {
  const frame = useCurrentFrame()

  // Card entrance.
  const entranceOpacity = interpolate(frame, [0, 15], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp'
  })
  const entranceY = interpolate(frame, [0, 15], [20, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: EASE.outExpo
  })

  const totalWidth = nodes.length * NODE_WIDTH + (nodes.length - 1) * CONNECTOR_WIDTH

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
      <PrestyjFonts />
      <div style={{ opacity: entranceOpacity, transform: `translateY(${entranceY}px)` }}>
        <DarkCard accentColor={accentColor} width={Math.max(640, totalWidth + 96)} padding={48}>
          {/* Title */}
          <div
            style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 20,
              letterSpacing: 3,
              color: accentColor,
              textTransform: 'uppercase' as const,
              marginBottom: 32,
              textAlign: 'center' as const
            }}
          >
            {title}
          </div>

          {/* Nodes + connectors */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            {nodes.map((node, i) => {
              // Staggered node entrance.
              const nodeOpacity = interpolate(
                frame,
                [10 + i * 8, 22 + i * 8],
                [0, 1],
                { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
              )
              const nodeScale = interpolate(
                frame,
                [10 + i * 8, 22 + i * 8],
                [0.8, 1],
                {
                  extrapolateLeft: 'clamp',
                  extrapolateRight: 'clamp',
                  easing: EASE.outExpo
                }
              )

              return (
                <React.Fragment key={`${node.label}-${i}`}>
                  <div
                    style={{
                      width: NODE_WIDTH,
                      height: NODE_HEIGHT,
                      backgroundColor: node.active ? `${accentColor}18` : '#111111',
                      border: `1px solid ${node.active ? accentColor : '#333333'}`,
                      borderRadius: 8,
                      display: 'flex',
                      flexDirection: 'column' as const,
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      opacity: nodeOpacity,
                      transform: `scale(${nodeScale})`,
                      boxShadow: node.active ? `0 0 16px ${accentColor}33` : 'none'
                    }}
                  >
                    {node.icon && <span style={{ fontSize: 20 }}>{node.icon}</span>}
                    <span
                      style={{
                        fontFamily: 'JetBrains Mono, monospace',
                        fontSize: 12,
                        letterSpacing: 1.5,
                        color: node.active ? accentColor : '#f6ecd9aa',
                        textTransform: 'uppercase' as const,
                        textAlign: 'center' as const
                      }}
                    >
                      {node.label}
                    </span>
                  </div>

                  {/* Connector line between nodes */}
                  {i < nodes.length - 1 && (
                    <div
                      style={{
                        width: CONNECTOR_WIDTH,
                        height: 2,
                        backgroundColor: accentColor,
                        opacity: interpolate(
                          frame,
                          [18 + i * 8, 26 + i * 8],
                          [0, 0.5],
                          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
                        )
                      }}
                    />
                  )}
                </React.Fragment>
              )
            })}
          </div>
        </DarkCard>
      </div>
    </AbsoluteFill>
  )
}
