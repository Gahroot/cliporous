import type React from 'react';
import { useStage } from '../stage';
import type { TechnologyPoint } from './motion';
import type { TechnologyStatus } from './types';

export function TechText({
  x,
  y,
  width = 260,
  children,
  size = 36,
  align = 'left',
  opacity = 1,
}: {
  x: number;
  y: number;
  width?: number;
  children: React.ReactNode;
  size?: number;
  align?: 'left' | 'center' | 'right';
  opacity?: number;
}): React.ReactElement {
  const S = useStage();
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width,
        fontSize: size,
        fontWeight: 650,
        lineHeight: 1.16,
        textAlign: align,
        overflowWrap: 'anywhere',
        color: S.text,
        opacity,
      }}
    >
      {children}
    </div>
  );
}

export function StatusMark({
  status,
  size = 36,
}: {
  status: TechnologyStatus;
  size?: number;
}): React.ReactElement {
  const S = useStage();
  const color = status === 'blocked' ? S.negative : status === 'passed' ? S.positive : S.text;
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      {status === 'passed' ? (
        <path
          d="M7 20 L16 29 L33 10"
          fill="none"
          stroke={color}
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : status === 'blocked' ? (
        <>
          <path
            d="M12 4 H28 L36 12 V28 L28 36 H12 L4 28 V12 Z"
            fill="none"
            stroke={color}
            strokeWidth="3"
          />
          <path d="M12 20 H28" stroke={color} strokeWidth="4" />
        </>
      ) : status === 'active' ? (
        <path d="M10 6 L32 20 L10 34 Z" fill={color} />
      ) : (
        <path d="M13 8 V32 M27 8 V32" stroke={color} strokeWidth="5" strokeLinecap="round" />
      )}
    </svg>
  );
}

/** Fold and identity stripe distinguish a persistent excerpt/change from its receptacle. */
export function DocumentCard({
  x,
  y,
  label,
  width = 196,
  height = 132,
  opacity = 1,
  rotation = 0,
  status,
}: TechnologyPoint & {
  label: string;
  width?: number;
  height?: number;
  opacity?: number;
  rotation?: number;
  status?: TechnologyStatus;
}): React.ReactElement {
  const S = useStage();
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width,
        height,
        boxSizing: 'border-box',
        borderRadius: '12px 26px 12px 12px',
        border: `3px solid ${S.text}`,
        borderLeft: `10px solid ${S.accent}`,
        background: S.cardRaised,
        boxShadow: `0 9px 0 ${S.cardBorder}`,
        transform: `rotate(${rotation}deg)`,
        opacity,
      }}
    >
      <div
        style={{
          position: 'absolute',
          right: 0,
          top: 0,
          width: 22,
          height: 22,
          borderLeft: `2px solid ${S.text}`,
          borderBottom: `2px solid ${S.text}`,
          borderRadius: '0 20px 0 4px',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 15,
          right: 15,
          top: 25,
          color: S.text,
          fontSize: 30,
          lineHeight: 1.12,
          fontWeight: 700,
          overflowWrap: 'anywhere',
        }}
      >
        {label}
      </div>
      {status && (
        <div style={{ position: 'absolute', right: 10, bottom: 8 }}>
          <StatusMark status={status} size={26} />
        </div>
      )}
    </div>
  );
}

/** A tactile ticket, not an anonymous dot; its label follows the request everywhere. */
export function RequestToken({
  x,
  y,
  label,
  opacity = 1,
  width = 204,
}: TechnologyPoint & {
  label: string;
  opacity?: number;
  width?: number;
}): React.ReactElement {
  const S = useStage();
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width,
        minHeight: 88,
        boxSizing: 'border-box',
        padding: '17px 18px 17px 30px',
        border: `3px solid ${S.text}`,
        borderRadius: 18,
        background: S.cardRaised,
        boxShadow: `0 8px 0 ${S.cardBorder}`,
        opacity,
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: 10,
          top: 14,
          bottom: 14,
          width: 6,
          borderRadius: 3,
          background: S.accent,
        }}
      />
      <div
        style={{
          fontSize: 32,
          lineHeight: 1.08,
          fontWeight: 750,
          color: S.text,
          overflowWrap: 'anywhere',
        }}
      >
        {label}
      </div>
    </div>
  );
}

export function Port({
  x,
  y,
  label,
  width = 240,
  height = 148,
  status = 'waiting',
  children,
}: TechnologyPoint & {
  label: string;
  width?: number;
  height?: number;
  status?: TechnologyStatus;
  children?: React.ReactNode;
}): React.ReactElement {
  const S = useStage();
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width,
        height,
        boxSizing: 'border-box',
        border: `3px solid ${S.cardBorder}`,
        borderBottom: `9px solid ${S.text}`,
        borderRadius: 22,
        background: S.card,
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: 18,
          top: 16,
          right: 56,
          fontSize: 32,
          lineHeight: 1.15,
          fontWeight: 700,
          overflowWrap: 'anywhere',
          color: S.text,
        }}
      >
        {label}
      </div>
      <div style={{ position: 'absolute', right: 14, top: 16 }}>
        <StatusMark status={status} size={30} />
      </div>
      {children}
    </div>
  );
}

/** A physical stop bar opens only when the caller's checked state changes. */
export function Gate({
  x,
  y,
  label,
  status,
  open = 0,
}: TechnologyPoint & {
  label: string;
  status: TechnologyStatus;
  open?: number;
}): React.ReactElement {
  const S = useStage();
  return (
    <div style={{ position: 'absolute', left: x, top: y, width: 220, height: 164 }}>
      <div
        style={{
          position: 'absolute',
          left: 12,
          top: 54,
          width: 12,
          height: 100,
          background: S.text,
          borderRadius: 6,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 196,
          top: 54,
          width: 12,
          height: 100,
          background: S.text,
          borderRadius: 6,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 18,
          top: 92,
          width: 182,
          height: 14,
          background: S.accent,
          border: `2px solid ${S.text}`,
          borderRadius: 7,
          transform: `rotate(${-80 * open}deg)`,
          transformOrigin: '0 50%',
        }}
      />
      <div
        style={{
          display: 'flex',
          gap: 10,
          alignItems: 'center',
          color: S.text,
          fontSize: 30,
          lineHeight: 1.1,
          fontWeight: 700,
        }}
      >
        <StatusMark status={status} size={30} />
        {label}
      </div>
    </div>
  );
}

/** Only authored points enter this component. No SVG/model markup crosses the parser. */
export function Connector({
  points,
  progress = 1,
  muted = false,
}: {
  points: readonly TechnologyPoint[];
  progress?: number;
  muted?: boolean;
}): React.ReactElement {
  const S = useStage();
  const d = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x} ${point.y}`)
    .join(' ');
  return (
    <svg
      width={1080}
      height={960}
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
      aria-hidden="true"
    >
      <path
        d={d}
        fill="none"
        stroke={muted ? S.cardBorder : S.text}
        strokeWidth={muted ? 3 : 5}
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={1}
        strokeDasharray="1"
        strokeDashoffset={1 - Math.max(0, Math.min(1, progress))}
      />
    </svg>
  );
}

export function Outcome({
  text,
  opacity = 1,
  status = 'passed',
}: {
  text: string;
  opacity?: number;
  status?: TechnologyStatus;
}): React.ReactElement {
  const S = useStage();
  return (
    <div
      style={{
        position: 'absolute',
        left: 64,
        top: 818,
        width: 952,
        minHeight: 72,
        boxSizing: 'border-box',
        padding: '18px 22px',
        borderTop: `3px solid ${S.text}`,
        display: 'flex',
        alignItems: 'center',
        gap: 20,
        opacity,
        color: S.text,
        fontSize: 38,
        lineHeight: 1.12,
        fontWeight: 650,
      }}
    >
      <StatusMark status={status} />
      <span>{text}</span>
    </div>
  );
}
