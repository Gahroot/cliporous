/**
 * Chat scene — a phone mockup (rounded frame, dynamic-island notch, dark
 * screen) showing one of:
 *  - `sms`: bubbles (them = left grey, me = right accent) that pop in on
 *    their beat, each "them" bubble preceded by a typing indicator;
 *  - `email`: an inbox card — sender, subject (first message) and body lines
 *    (later messages) typing in;
 *  - `notification`: lock-screen banners dropping in from the top.
 *
 * Motion adapted from Remocn claude-chat / chat-gpt (MIT): spring bounce-in
 * (damping 14, stiffness ~110–200) + fade-up for new content.
 */

import { BatteryFull, Mail, MessageCircle, Signal, Wifi } from 'lucide-react';
import type React from 'react';
import { spring } from 'remotion';
import {
  floatTransform,
  Glow,
  reactionTransform,
  useBreath,
  useFloat,
  useLivingShadow,
  useReaction,
} from './motion';
import { mixHex, withAlpha } from './palette';
import { ramp, useSceneTime, useStage } from './stage';
import { type ChatScene as ChatSceneData, EXPLAINER_STAGE_WIDTH } from './types';

type Message = ChatSceneData['messages'][number];

const PHONE_W = 500;
const PHONE_H = 860;
const PHONE_TOP = 50;
/** Extra scale so the phone fills ~93% of the 960 stage height. */
const PHONE_SCALE = 1.04;
const BEZEL = 14;
const TYPING_SEC = 0.75;

/** Spring bounce-in 0→1 (Remocn introBounceIn), from `atSec`. */
function useBounce(atSec: number, stiffness = 170): number {
  const { frame, fps } = useSceneTime();
  return spring({
    frame: frame - Math.round(atSec * fps),
    fps,
    config: { damping: 14, stiffness, mass: 0.7 },
  });
}

/** Typewriter: visible prefix of `text` from `atSec` at ~`cps` chars/s. */
function typed(text: string, t: number, atSec: number, cps = 38): string {
  if (t < atSec) return '';
  return text.slice(0, Math.min(text.length, Math.floor((t - atSec) * cps) + 1));
}

// ---------------------------------------------------------------------------
// Phone chrome
// ---------------------------------------------------------------------------

const StatusBar: React.FC<{ color: string }> = ({ color }) => {
  const S = useStage();
  return (
    <div
      style={{
        position: 'absolute',
        left: 38,
        right: 34,
        top: 22,
        height: 40,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontFamily: S.font,
        fontWeight: 700,
        fontSize: 22,
        color,
      }}
    >
      <span>9:41</span>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <Signal size={22} strokeWidth={2.6} color={color} />
        <Wifi size={22} strokeWidth={2.6} color={color} />
        <BatteryFull size={26} strokeWidth={2.2} color={color} />
      </div>
    </div>
  );
};

const Phone: React.FC<{ children: React.ReactNode; screen: string }> = ({ children, screen }) => {
  const S = useStage();
  const { t } = useSceneTime();
  const float = useFloat('chat-phone', 6, 5.2);
  const shadow = useLivingShadow('chat-phone', 1.2);
  const reaction = useReaction(undefined);
  const enter = useBounce(0, 110);
  const fade = ramp(t, 0, 0.4);
  const frame = mixHex(S.bgOuter, S.text, 0.1);

  return (
    <div
      style={{
        position: 'absolute',
        left: (EXPLAINER_STAGE_WIDTH - PHONE_W) / 2,
        top: PHONE_TOP,
        width: PHONE_W,
        height: PHONE_H,
        opacity: fade,
        transform: `perspective(2400px) translateY(${(1 - enter) * 60}px) scale(${(PHONE_SCALE * (0.96 + 0.04 * enter)).toFixed(4)}) rotateY(-4deg) ${floatTransform(float)} ${reactionTransform(reaction)}`,
      }}
    >
      <Glow color={S.accentSoft} intensity={0.55 + reaction.glow} radius={320} />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: 78,
          background: `linear-gradient(145deg, ${mixHex(frame, S.text, 0.12)} 0%, ${frame} 40%, ${mixHex(frame, '#000000', 0.3)} 100%)`,
          boxShadow: `${shadow}, inset 0 0 0 2px ${withAlpha(S.text, 0.14)}, inset 0 2px 0 ${withAlpha(S.text, 0.2)}`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: BEZEL,
          borderRadius: 64,
          overflow: 'hidden',
          background: screen,
          boxShadow: 'inset 0 0 0 1.5px rgba(0,0,0,0.6)',
        }}
      >
        {children}
        {/* Dynamic island */}
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: 18,
            width: 150,
            height: 42,
            marginLeft: -75,
            borderRadius: 21,
            background: '#000000',
          }}
        />
        {/* Glass sheen */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'linear-gradient(125deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0) 32%)',
            pointerEvents: 'none',
          }}
        />
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// SMS
// ---------------------------------------------------------------------------

const TypingDots: React.FC<{ from: number; until: number }> = ({ from, until }) => {
  const S = useStage();
  const { t } = useSceneTime();
  const inP = ramp(t, from, 0.25);
  const outP = ramp(t, until - 0.08, 0.1);
  const vis = inP * (1 - outP);
  if (t < from || t > until + 0.05) return null;
  return (
    <div
      style={{
        alignSelf: 'flex-start',
        display: 'flex',
        gap: 8,
        padding: '20px 24px',
        borderRadius: 28,
        borderBottomLeftRadius: 8,
        background: S.cardRaised,
        opacity: vis,
        transform: `scale(${0.8 + 0.2 * inP})`,
        transformOrigin: '0% 100%',
      }}
    >
      {[0, 1, 2].map((i) => {
        const w = Math.sin((t - from) * 9 - i * 0.9);
        return (
          <div
            key={i}
            style={{
              width: 13,
              height: 13,
              borderRadius: 7,
              background: S.muted,
              opacity: 0.45 + 0.55 * Math.max(0, w),
              transform: `translateY(${-Math.max(0, w) * 5}px)`,
            }}
          />
        );
      })}
    </div>
  );
};

const Bubble: React.FC<{ msg: Message; index: number }> = ({ msg, index }) => {
  const S = useStage();
  const pop = useBounce(msg.at, 200);
  const reaction = useReaction(index);
  const me = msg.side === 'me';
  if (pop <= 0.001) return null;
  return (
    <div
      style={{
        alignSelf: me ? 'flex-end' : 'flex-start',
        maxWidth: '80%',
        padding: '16px 24px 18px',
        borderRadius: 30,
        [me ? 'borderBottomRightRadius' : 'borderBottomLeftRadius']: 8,
        background: me
          ? `linear-gradient(180deg, ${mixHex(S.accent, '#ffffff', 0.12)} 0%, ${S.accent} 100%)`
          : S.cardRaised,
        color: me ? '#ffffff' : S.text,
        fontFamily: S.font,
        fontWeight: 600,
        fontSize: 29,
        lineHeight: 1.28,
        opacity: Math.min(1, pop * 1.6),
        transform: `translateY(${(1 - pop) * 26}px) scale(${0.7 + 0.3 * pop}) ${reactionTransform(reaction)}`,
        transformOrigin: me ? '100% 100%' : '0% 100%',
        boxShadow: me
          ? `0 10px 30px ${withAlpha(S.accent, 0.35 + reaction.glow * 0.3)}`
          : '0 10px 24px rgba(0,0,0,0.25)',
      }}
    >
      {msg.text}
    </div>
  );
};

const SmsScreen: React.FC<{ scene: ChatSceneData }> = ({ scene }) => {
  const S = useStage();
  const { t } = useSceneTime();
  const head = ramp(t, 0.15, 0.45);
  const initial = scene.from.trim().charAt(0).toUpperCase() || '•';
  return (
    <>
      <StatusBar color={S.text} />
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 74,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 8,
          paddingBottom: 18,
          borderBottom: `1px solid ${S.cardBorder}`,
          opacity: head,
          transform: `translateY(${(1 - head) * -12}px)`,
        }}
      >
        <div
          style={{
            width: 76,
            height: 76,
            borderRadius: 38,
            background: `linear-gradient(160deg, ${S.clay[1]} 0%, ${S.clay[2]} 100%)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: S.font,
            fontWeight: 800,
            fontSize: 34,
            color: S.paperText,
          }}
        >
          {initial}
        </div>
        <div style={{ fontFamily: S.font, fontWeight: 700, fontSize: 24, color: S.text }}>
          {scene.from}
        </div>
      </div>
      <div
        style={{
          position: 'absolute',
          left: 24,
          right: 24,
          top: 220,
          bottom: 30,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          gap: 14,
        }}
      >
        {scene.messages.map((m, i) => {
          const prev = scene.messages[i - 1];
          const typingFrom = Math.max(prev ? prev.at + 0.35 : 0.35, m.at - TYPING_SEC);
          return (
            <SmsRow
              key={`${m.at}-${m.text}`}
              msg={m}
              index={i}
              typingFrom={m.side === 'them' && m.at - typingFrom > 0.2 ? typingFrom : null}
            />
          );
        })}
      </div>
    </>
  );
};

const SmsRow: React.FC<{ msg: Message; index: number; typingFrom: number | null }> = ({
  msg,
  index,
  typingFrom,
}) => {
  const { t } = useSceneTime();
  if (t < msg.at) {
    return typingFrom === null ? null : <TypingDots from={typingFrom} until={msg.at} />;
  }
  return <Bubble msg={msg} index={index} />;
};

// ---------------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------------

const EmailScreen: React.FC<{ scene: ChatSceneData }> = ({ scene }) => {
  const S = useStage();
  const { t } = useSceneTime();
  const head = ramp(t, 0.15, 0.45);
  const [subject, ...body] = scene.messages;
  const cardPop = useBounce(subject?.at ?? 0.3, 150);
  const reaction = useReaction(0);
  const breath = useBreath('chat-mail');
  const initial = scene.from.trim().charAt(0).toUpperCase() || '•';
  const skeleton = body.length === 0;

  return (
    <>
      <StatusBar color={S.text} />
      <div
        style={{
          position: 'absolute',
          left: 34,
          right: 34,
          top: 86,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          opacity: head,
        }}
      >
        <span style={{ fontFamily: S.font, fontWeight: 800, fontSize: 44, color: S.text }}>
          Inbox
        </span>
        <Mail size={34} strokeWidth={2.2} color={S.accent} />
      </div>
      {/* Faded older mail rows behind the new one */}
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: 34,
            right: 34,
            top: 560 + i * 78,
            height: 58,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            opacity: head * (0.5 - i * 0.12),
          }}
        >
          <div
            style={{
              width: `${55 - i * 8}%`,
              height: 14,
              borderRadius: 7,
              background: S.cardRaised,
            }}
          />
          <div
            style={{ width: `${82 - i * 6}%`, height: 12, borderRadius: 6, background: S.card }}
          />
        </div>
      ))}
      <div
        style={{
          position: 'absolute',
          left: 22,
          right: 22,
          top: 170,
          borderRadius: 30,
          padding: '26px 28px 30px',
          background: S.cardRaised,
          border: `1.5px solid ${withAlpha(S.accent, 0.35 + breath * 0.2)}`,
          boxShadow: `0 20px 50px rgba(0,0,0,0.45), 0 0 ${(30 + reaction.glow * 30).toFixed(0)}px ${withAlpha(S.accent, 0.18 + reaction.glow * 0.3)}`,
          opacity: Math.min(1, cardPop * 1.5),
          transform: `translateY(${(1 - cardPop) * -40}px) scale(${0.94 + 0.06 * cardPop}) ${reactionTransform(reaction)}`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div
            style={{
              width: 58,
              height: 58,
              borderRadius: 29,
              flexShrink: 0,
              background: `linear-gradient(160deg, ${S.clay[1]} 0%, ${S.clay[2]} 100%)`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: S.font,
              fontWeight: 800,
              fontSize: 28,
              color: S.paperText,
            }}
          >
            {initial}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: S.font, fontWeight: 800, fontSize: 26, color: S.text }}>
              {scene.from}
            </div>
            <div style={{ fontFamily: S.font, fontWeight: 600, fontSize: 19, color: S.muted }}>
              to me · now
            </div>
          </div>
          <div style={{ width: 16, height: 16, borderRadius: 8, background: S.accent }} />
        </div>
        <div
          style={{
            marginTop: 22,
            fontFamily: S.font,
            fontWeight: 800,
            fontSize: 31,
            lineHeight: 1.22,
            color: S.text,
          }}
        >
          {subject ? typed(subject.text, t, subject.at, 55) : ''}
        </div>
        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {skeleton
            ? [88, 70].map((w) => (
                <div
                  key={w}
                  style={{
                    width: `${w}%`,
                    height: 14,
                    borderRadius: 7,
                    background: S.card,
                    opacity: ramp(t, (subject?.at ?? 0) + 0.4, 0.4),
                  }}
                />
              ))
            : body.map((m) => (
                <div
                  key={`${m.at}-${m.text}`}
                  style={{
                    fontFamily: S.font,
                    fontWeight: 550,
                    fontSize: 26,
                    lineHeight: 1.35,
                    color: mixHex(S.text, S.muted, 0.35),
                  }}
                >
                  {typed(m.text, t, m.at)}
                  {t >= m.at && t < m.at + m.text.length / 38 + 0.25 && (
                    <span style={{ color: S.accent }}>▍</span>
                  )}
                </div>
              ))}
        </div>
      </div>
    </>
  );
};

// ---------------------------------------------------------------------------
// Notification (lock screen)
// ---------------------------------------------------------------------------

const BANNER_H = 150;
const BANNER_GAP = 14;
const BANNER_TOP = 360;

const Banner: React.FC<{
  msg: Message;
  index: number;
  from: string;
  y: number;
  drop: number;
}> = ({ msg, index, from, y, drop }) => {
  const S = useStage();
  const reaction = useReaction(index);
  if (drop <= 0.001) return null;
  return (
    <div
      style={{
        position: 'absolute',
        left: 18,
        right: 18,
        top: y,
        height: BANNER_H,
        borderRadius: 34,
        padding: '20px 24px',
        background: withAlpha(mixHex(S.cardRaised, S.text, 0.08), 0.9),
        border: `1px solid ${withAlpha(S.text, 0.1)}`,
        boxShadow: `0 18px 40px rgba(0,0,0,0.4), 0 0 ${(reaction.glow * 40).toFixed(0)}px ${withAlpha(S.accent, 0.4)}`,
        opacity: Math.min(1, drop * 1.8),
        transform: `translateY(${(1 - drop) * -(BANNER_H + 120)}px) scale(${0.92 + 0.08 * drop}) ${reactionTransform(reaction)}`,
        display: 'flex',
        gap: 18,
      }}
    >
      <div
        style={{
          width: 62,
          height: 62,
          borderRadius: 18,
          flexShrink: 0,
          background: `linear-gradient(160deg, ${mixHex(S.accent, '#ffffff', 0.2)} 0%, ${S.accent} 100%)`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <MessageCircle size={36} strokeWidth={2.4} color="#ffffff" />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontFamily: S.font,
            fontSize: 22,
          }}
        >
          <span style={{ fontWeight: 800, color: S.text }}>{from}</span>
          <span style={{ fontWeight: 600, color: S.muted }}>now</span>
        </div>
        <div
          style={{
            marginTop: 6,
            fontFamily: S.font,
            fontWeight: 600,
            fontSize: 25,
            lineHeight: 1.3,
            color: mixHex(S.text, S.muted, 0.2),
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {msg.text}
        </div>
      </div>
    </div>
  );
};

const NotificationScreen: React.FC<{ scene: ChatSceneData }> = ({ scene }) => {
  const S = useStage();
  const { t, frame, fps } = useSceneTime();
  const head = ramp(t, 0.1, 0.5);
  const drops = scene.messages.map((m) =>
    spring({
      frame: frame - Math.round(m.at * fps),
      fps,
      config: { damping: 15, stiffness: 150, mass: 0.8 },
    }),
  );
  // Newest banner sits on top; older ones get pushed down as new ones land.
  const ys = scene.messages.map((_, i) => {
    let push = 0;
    for (let j = i + 1; j < drops.length; j++) push += Math.min(1, drops[j] ?? 0);
    return BANNER_TOP + push * (BANNER_H + BANNER_GAP);
  });

  return (
    <>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `radial-gradient(120% 70% at 30% 0%, ${withAlpha(S.accent, 0.4)} 0%, rgba(0,0,0,0) 60%), radial-gradient(90% 60% at 100% 100%, ${withAlpha(S.accent2, 0.3)} 0%, rgba(0,0,0,0) 70%)`,
        }}
      />
      <StatusBar color={S.text} />
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 110,
          textAlign: 'center',
          opacity: head,
          transform: `translateY(${(1 - head) * 16}px)`,
        }}
      >
        <div style={{ fontFamily: S.font, fontWeight: 600, fontSize: 26, color: S.text }}>
          Tuesday, 9 June
        </div>
        <div
          style={{
            fontFamily: S.font,
            fontWeight: 700,
            fontSize: 150,
            lineHeight: 1,
            letterSpacing: -4,
            color: S.text,
          }}
        >
          9:41
        </div>
      </div>
      {scene.messages.map((m, i) => (
        <Banner
          key={`${m.at}-${m.text}`}
          msg={m}
          index={i}
          from={scene.from}
          y={ys[i] ?? BANNER_TOP}
          drop={drops[i] ?? 0}
        />
      ))}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          bottom: 16,
          width: 170,
          height: 7,
          marginLeft: -85,
          borderRadius: 4,
          background: withAlpha(S.text, 0.6),
          opacity: head,
        }}
      />
    </>
  );
};

// ---------------------------------------------------------------------------

export const ChatScene: React.FC<{ scene: ChatSceneData }> = ({ scene }) => {
  const S = useStage();
  const screen =
    scene.medium === 'notification'
      ? mixHex(S.bgOuter, '#000000', 0.35)
      : `linear-gradient(180deg, ${mixHex(S.bgOuter, '#000000', 0.2)} 0%, ${mixHex(S.bgOuter, '#000000', 0.45)} 100%)`;
  return (
    <Phone screen={screen}>
      {scene.medium === 'sms' && <SmsScreen scene={scene} />}
      {scene.medium === 'email' && <EmailScreen scene={scene} />}
      {scene.medium === 'notification' && <NotificationScreen scene={scene} />}
    </Phone>
  );
};
