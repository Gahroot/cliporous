/**
 * Checklist scene — rows appear, then each ticks + strikes through on the word
 * the speaker says it. The next pending row carries a soft accent focus ring.
 */

import { Check } from 'lucide-react';
import type React from 'react';
import { resolveIcon } from '../blocks/icon';
import {
  floatTransform,
  Glow,
  reactionTransform,
  useFloat,
  useLivingShadow,
  useReaction,
} from './motion';
import { ramp, usePop, useSceneTime, useStage } from './stage';
import type { ChecklistItem, ChecklistScene as ChecklistSceneData } from './types';

const ROW_HEIGHT = 104;

const Row: React.FC<{ item: ChecklistItem; index: number; focused: boolean }> = ({
  item,
  index,
  focused,
}) => {
  const STAGE = useStage();
  const { t } = useSceneTime();
  const reaction = useReaction(index);
  const enter = ramp(t, 0.1 + index * 0.08, 0.45);
  const tick = usePop(item.doneAt, 220, 14);
  const strike = ramp(t, item.doneAt + 0.05, 0.35);
  const done = t >= item.doneAt;
  const Icon = resolveIcon(item.icon);

  return (
    <div
      style={{
        height: ROW_HEIGHT,
        borderRadius: 22,
        background: STAGE.cardRaised,
        display: 'flex',
        alignItems: 'center',
        gap: 28,
        padding: '0 32px',
        position: 'relative',
        opacity: enter,
        transform: `translateX(${(1 - enter) * -30}px) ${reactionTransform(reaction)}`,
        boxShadow: focused
          ? `inset 0 0 0 2px ${STAGE.accent}88, 0 0 36px ${STAGE.accentSoft}`
          : 'inset 0 0 0 1px rgba(255,255,255,0.04)',
      }}
    >
      <Glow color={STAGE.accentSoft} intensity={reaction.glow} radius={90} />
      <div style={{ width: 48, height: 48, position: 'relative', flexShrink: 0 }}>
        <Icon
          size={44}
          strokeWidth={1.8}
          color={STAGE.muted}
          style={{ position: 'absolute', inset: 2, opacity: 1 - tick }}
        />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: 12,
            background: STAGE.done,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transform: `scale(${tick})`,
          }}
        >
          <Check size={34} strokeWidth={3.2} color="#10331d" />
        </div>
      </div>
      <div style={{ position: 'relative', minWidth: 0 }}>
        <span
          style={{
            fontFamily: STAGE.font,
            fontWeight: 700,
            fontSize: 44,
            color: done ? STAGE.muted : STAGE.text,
            whiteSpace: 'nowrap',
          }}
        >
          {item.label}
        </span>
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: '54%',
            height: 5,
            borderRadius: 3,
            width: `${strike * 100}%`,
            background: STAGE.muted,
          }}
        />
      </div>
    </div>
  );
};

export const ChecklistScene: React.FC<{ scene: ChecklistSceneData }> = ({ scene }) => {
  const STAGE = useStage();
  const { t } = useSceneTime();
  const float = useFloat('checklist', 5);
  const shadow = useLivingShadow('checklist');
  const nextIndex = scene.items.findIndex((it) => t < it.doneAt);

  return (
    <div
      style={{
        position: 'absolute',
        left: 110,
        right: 110,
        top: '50%',
        transform: `translateY(-50%) ${floatTransform(float)}`,
        borderRadius: 34,
        padding: 26,
        background: STAGE.card,
        border: `1px solid ${STAGE.cardBorder}`,
        boxShadow: shadow,
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}
    >
      {scene.title && (
        <div
          style={{
            fontFamily: STAGE.font,
            fontWeight: 700,
            fontSize: 40,
            color: STAGE.text,
            padding: '6px 10px 4px',
          }}
        >
          {scene.title}
        </div>
      )}
      {scene.items.map((item, i) => (
        <Row key={`${i}-${item.label}`} item={item} index={i} focused={i === nextIndex} />
      ))}
    </div>
  );
};
