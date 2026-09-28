/**
 * Code scene — a dark editor / terminal window (traffic-light dots, title
 * tab, line-number gutter) whatever the stage theme. Each line types in on
 * its `at` with a caret and light syntax tinting (strings, keywords, numbers,
 * comments). `add` lines get a "+" and a green tint; `remove` lines appear
 * with a "−", a red tint and a strike-through that draws across.
 */

import { FileCode, SquareTerminal } from 'lucide-react';
import type React from 'react';
import { spring } from 'remotion';
import {
  floatTransform,
  Glow,
  reactionTransform,
  useFloat,
  useLivingShadow,
  useReaction,
} from './motion';
import { mixHex, withAlpha } from './palette';
import { ramp, useSceneTime, useStage } from './stage';
import type { CodeScene as CodeSceneData } from './types';

type Line = CodeSceneData['lines'][number];

const WIN_W = 960;
const WIN_LEFT = (1080 - WIN_W) / 2;
const BAR_H = 78;
const LINE_H = 78;
const BODY_PAD = 30;
const GUTTER_W = 76;
const MARK_W = 46;
const CPS = 40;
const MONO = "'SF Mono', 'JetBrains Mono', Menlo, Consolas, 'Liberation Mono', monospace";

const KEYWORDS =
  'const|let|var|function|return|if|else|for|while|in|of|import|from|export|default|def|class|async|await|new|true|false|null|None|True|False|print|npm|npx|git|pip|sudo|cd|run|install|curl|brew|yarn|docker|SELECT|FROM|WHERE';
const TOKEN_RE = new RegExp(
  [
    /("(?:[^"\\]|\\.)*"?|'(?:[^'\\]|\\.)*'?|`[^`]*`?)/.source, // 1 string
    /((?:\/\/|(?<=^|\s)#).*$)/.source, // 2 comment
    `\\b(${KEYWORDS})\\b`, // 3 keyword
    /(\b\d+(?:\.\d+)?\b)/.source, // 4 number
    /(^\s*[$>](?=\s))/.source, // 5 shell prompt
  ].join('|'),
  'g',
);

type Tone = 'plain' | 'string' | 'comment' | 'keyword' | 'number' | 'prompt';

interface Token {
  text: string;
  tone: Tone;
  /** Character offset in the line (stable React key). */
  start: number;
}

function tokenize(text: string): Token[] {
  const out: Token[] = [];
  let last = 0;
  TOKEN_RE.lastIndex = 0;
  for (let m = TOKEN_RE.exec(text); m !== null; m = TOKEN_RE.exec(text)) {
    if (m[0].length === 0) {
      TOKEN_RE.lastIndex++;
      continue;
    }
    if (m.index > last) out.push({ text: text.slice(last, m.index), tone: 'plain', start: last });
    const tone: Tone = m[1]
      ? 'string'
      : m[2]
        ? 'comment'
        : m[3]
          ? 'keyword'
          : m[4]
            ? 'number'
            : 'prompt';
    out.push({ text: m[0], tone, start: m.index });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), tone: 'plain', start: last });
  return out;
}

/** Keep the first `n` characters of a token list. */
function sliceTokens(tokens: Token[], n: number): Token[] {
  const out: Token[] = [];
  let left = n;
  for (const tk of tokens) {
    if (left <= 0) break;
    out.push(tk.text.length <= left ? tk : { ...tk, text: tk.text.slice(0, left) });
    left -= tk.text.length;
  }
  return out;
}

function codeFontSize(lines: Line[]): number {
  const longest = Math.max(0, ...lines.map((l) => l.text.length));
  if (longest <= 24) return 44;
  if (longest <= 30) return 40;
  return 37;
}

function typedCount(line: Line, t: number): number {
  if (t < line.at) return 0;
  if (line.tone === 'remove') return line.text.length;
  return Math.min(line.text.length, Math.floor((t - line.at) * CPS) + 1);
}

const CodeLine: React.FC<{
  line: Line;
  index: number;
  fontSize: number;
  caret: boolean;
  ink: string;
  dim: string;
}> = ({ line, index, fontSize, caret, ink, dim }) => {
  const S = useStage();
  const { t } = useSceneTime();
  const reaction = useReaction(index);
  const shown = t >= line.at;
  const rowIn = ramp(t, line.at, 0.25);
  const n = typedCount(line, t);
  const strike = line.tone === 'remove' ? ramp(t, line.at + 0.15, 0.4) : 0;
  const diffColor =
    line.tone === 'add' ? S.positive : line.tone === 'remove' ? S.negative : undefined;
  const colors: Record<Tone, string> = {
    plain: ink,
    string: mixHex(S.accent2, '#ffffff', 0.4),
    comment: dim,
    keyword: mixHex(S.accent, '#ffffff', 0.22),
    number: mixHex(S.accent2, '#ffffff', 0.15),
    prompt: dim,
  };
  const tokens = sliceTokens(tokenize(line.text), n);

  return (
    <div
      style={{
        position: 'relative',
        height: LINE_H,
        display: 'flex',
        alignItems: 'center',
        transform: reactionTransform(reaction),
        transformOrigin: '10% 50%',
      }}
    >
      {diffColor && shown && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 4,
            bottom: 4,
            background: `linear-gradient(90deg, ${withAlpha(diffColor, 0.26)} 0%, ${withAlpha(diffColor, 0.12)} 100%)`,
            borderLeft: `5px solid ${diffColor}`,
            opacity: rowIn,
            boxShadow:
              reaction.glow > 0.01
                ? `0 0 ${(reaction.glow * 30).toFixed(1)}px ${withAlpha(diffColor, 0.5)}`
                : undefined,
          }}
        />
      )}
      <div
        style={{
          position: 'relative',
          width: GUTTER_W,
          flexShrink: 0,
          textAlign: 'right',
          paddingRight: 22,
          boxSizing: 'border-box',
          fontFamily: MONO,
          fontSize: fontSize * 0.72,
          color: shown ? dim : withAlpha(dim, 0.35),
        }}
      >
        {index + 1}
      </div>
      <div
        style={{
          position: 'relative',
          width: MARK_W,
          flexShrink: 0,
          fontFamily: MONO,
          fontWeight: 700,
          fontSize,
          color: diffColor ?? 'transparent',
          opacity: rowIn,
        }}
      >
        {line.tone === 'add' ? '+' : line.tone === 'remove' ? '−' : ''}
      </div>
      {shown && (
        <div
          style={{
            position: 'relative',
            fontFamily: MONO,
            fontSize,
            whiteSpace: 'pre',
            opacity: line.tone === 'remove' ? rowIn * (1 - strike * 0.4) : 1,
            display: 'flex',
            alignItems: 'center',
          }}
        >
          {tokens.map((tk) => (
            <span key={tk.start} style={{ color: colors[tk.tone] }}>
              {tk.text}
            </span>
          ))}
          {caret && (
            <span
              style={{
                display: 'inline-block',
                width: fontSize * 0.55,
                height: fontSize * 1.15,
                marginLeft: 2,
                borderRadius: 3,
                background: withAlpha(S.accent, 0.85),
              }}
            />
          )}
          {strike > 0 && (
            <div
              style={{
                position: 'absolute',
                left: -4,
                top: '52%',
                width: `calc(${(strike * 100).toFixed(2)}% + 8px)`,
                height: 4,
                borderRadius: 2,
                background: S.negative,
              }}
            />
          )}
        </div>
      )}
    </div>
  );
};

export const CodeScene: React.FC<{ scene: CodeSceneData }> = ({ scene }) => {
  const S = useStage();
  const { t, frame, fps } = useSceneTime();
  const float = useFloat('code', 4, 5.8);
  const shadow = useLivingShadow('code', 1.3);
  const reaction = useReaction(undefined);
  const enter = spring({ frame, fps, config: { damping: 18, stiffness: 110 } });

  // Always a dark editor, whichever stage theme: bias the stage bg to black.
  const body = mixHex(S.bgOuter, '#000000', 0.4);
  const bar = mixHex(body, '#ffffff', 0.07);
  const ink = mixHex(body, '#ffffff', 0.9);
  const dim = mixHex(body, '#ffffff', 0.42);
  const fontSize = codeFontSize(scene.lines);
  const n = scene.lines.length;
  const winH = BAR_H + BODY_PAD * 2 + n * LINE_H;
  const top = (960 - winH) / 2;

  // Caret: on the latest started typed line; blinks (frame-driven) once typed.
  let caretLine = -1;
  scene.lines.forEach((l, i) => {
    if (t >= l.at && l.tone !== 'remove') caretLine = i;
  });
  const caretLineData = scene.lines[caretLine];
  const caretTyping =
    caretLineData !== undefined && typedCount(caretLineData, t) < caretLineData.text.length;
  const caretOn = caretTyping || Math.floor(t * 2) % 2 === 0;
  const terminal = /term|bash|zsh|shell|console|cli/i.test(scene.title);
  const Icon = terminal ? SquareTerminal : FileCode;

  return (
    <div
      style={{
        position: 'absolute',
        left: WIN_LEFT,
        top,
        width: WIN_W,
        height: winH,
        opacity: Math.min(1, enter * 1.4),
        transform: `translateY(${((1 - enter) * 50).toFixed(2)}px) scale(${(0.96 + 0.04 * enter).toFixed(4)}) ${floatTransform(float)} ${reactionTransform(reaction)}`,
      }}
    >
      <Glow color={S.accentSoft} intensity={0.45 + reaction.glow} radius={340} />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: 30,
          overflow: 'hidden',
          background: body,
          border: `1.5px solid ${withAlpha(ink, 0.12)}`,
          boxShadow: `${shadow}, 0 30px 80px rgba(0,0,0,0.35)`,
        }}
      >
        {/* Title bar */}
        <div
          style={{
            position: 'relative',
            height: BAR_H,
            background: bar,
            borderBottom: `1.5px solid ${withAlpha(ink, 0.08)}`,
            display: 'flex',
            alignItems: 'center',
            padding: '0 28px',
          }}
        >
          <div style={{ display: 'flex', gap: 14 }}>
            {[S.negative, mixHex(S.negative, S.positive, 0.5), S.positive].map((c) => (
              <div
                key={c}
                style={{ width: 22, height: 22, borderRadius: 11, background: c, opacity: 0.9 }}
              />
            ))}
          </div>
          <div
            style={{
              position: 'absolute',
              left: '50%',
              top: 14,
              bottom: 0,
              transform: 'translateX(-50%)',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '0 28px',
              borderRadius: '16px 16px 0 0',
              background: body,
              fontFamily: S.font,
              fontWeight: 600,
              fontSize: 28,
              color: mixHex(body, '#ffffff', 0.75),
              whiteSpace: 'nowrap',
            }}
          >
            <Icon size={28} strokeWidth={2.2} color={S.accent} />
            {scene.title}
          </div>
        </div>
        {/* Lines */}
        <div style={{ padding: `${BODY_PAD}px 0` }}>
          {scene.lines.map((l, i) => (
            <CodeLine
              key={`${l.at}-${l.text}`}
              line={l}
              index={i}
              fontSize={fontSize}
              caret={i === caretLine && caretOn}
              ink={ink}
              dim={dim}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
