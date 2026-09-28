/**
 * QuoteGraphic — the fullscreen-quote card (flat sand backdrop) with one
 * soft clay hero prop animated in the top band. The quote words themselves
 * are NOT drawn here: the caption pass still burns them one at a time at the
 * frame centre, exactly as on the plain card. Opaque 1080×1920.
 */

import type React from 'react';
import { useMemo } from 'react';
import { AbsoluteFill } from 'remotion';
import { HERO_CAMERA, HERO_GROUND_Y, HeroPropActor } from './HeroScene';
import { heroImpactSec } from './hero-catalog';
import { Burst, Glow, useBreath } from './motion';
import { deriveExplainerPalette } from './palette';
import { QUOTE_GRAPHIC_BOX, type QuoteGraphicProps } from './quote-graphic';
import { Stage3D, useRigCamera } from './Stage3D';
import { ExplainerProvider, ramp, useSceneTime, useStage } from './stage';
import { projectToStage } from './three-helpers';
import { EXPLAINER_STAGE_HEIGHT, EXPLAINER_STAGE_WIDTH } from './types';

const PropStage: React.FC<{ props: QuoteGraphicProps }> = ({ props }) => {
  const S = useStage();
  const { t } = useSceneTime();
  const impactAt = props.at + heroImpactSec(props.prop, props.tone);
  const rig = { focusAt: impactAt, driftDeg: 6, pushAmount: 0.07 };
  const camera = useRigCamera(HERO_CAMERA, rig);
  const breath = useBreath('quote');
  const appear = ramp(t, props.at, 0.6);
  const center = projectToStage(camera, [0, 0.1, 0]);
  return (
    <>
      <div
        style={{
          position: 'absolute',
          left: center.x - 360,
          top: center.y - 360,
          width: 720,
          height: 720,
        }}
      >
        {/* Kept faint: on sand a strong violet halo reads as a stain. */}
        <Glow color={S.accentSoft} intensity={appear * (0.5 + breath * 0.25)} radius={340} />
      </div>
      <Stage3D camera={HERO_CAMERA} {...rig} groundY={HERO_GROUND_Y} shadowScale={7}>
        <HeroPropActor
          scene={{
            kind: 'hero',
            prop: props.prop,
            label: '',
            at: props.at,
            ...(props.tone ? { tone: props.tone } : {}),
          }}
        />
      </Stage3D>
      <Burst
        atSec={impactAt}
        x={center.x}
        y={center.y}
        color={S.accent}
        radius={280}
        count={12}
        seed="quote"
      />
    </>
  );
};

export const QuoteGraphic: React.FC<QuoteGraphicProps> = (props) => {
  const ctx = useMemo(
    () => ({
      // Prop materials use the same dark-stage palette as the explainer
      // scenes so every prop keeps its tuned look; only the canvas is sand.
      palette: deriveExplainerPalette({
        background: props.seedBackground,
        foreground: props.seedForeground,
        accent: props.accent,
        ...(props.accent2 ? { accent2: props.accent2 } : {}),
      }),
      layout: 'takeover' as const,
      aspect: '9:16' as const,
    }),
    [props.seedBackground, props.seedForeground, props.accent, props.accent2],
  );
  const box = QUOTE_GRAPHIC_BOX;
  const scale = Math.min(box.width / EXPLAINER_STAGE_WIDTH, box.height / EXPLAINER_STAGE_HEIGHT);
  const left = box.x + (box.width - EXPLAINER_STAGE_WIDTH * scale) / 2;
  const top = box.y + (box.height - EXPLAINER_STAGE_HEIGHT * scale) / 2;
  return (
    <ExplainerProvider value={ctx}>
      <AbsoluteFill style={{ backgroundColor: props.background }}>
        <div
          style={{
            position: 'absolute',
            left,
            top,
            width: EXPLAINER_STAGE_WIDTH,
            height: EXPLAINER_STAGE_HEIGHT,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
          }}
        >
          <PropStage props={props} />
        </div>
      </AbsoluteFill>
    </ExplainerProvider>
  );
};
