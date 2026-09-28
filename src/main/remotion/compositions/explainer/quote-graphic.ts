/**
 * Quote graphic — the animated prop drawn on the fullscreen-quote card.
 *
 * The card itself (flat sand backdrop, one serif word at a time burned in by
 * the caption pass at the frame centre) is unchanged; this composition only
 * adds one soft clay hero prop in the top band, above the word. Pure +
 * JSX-free so the main-process render glue can share the geometry and props.
 */

import type { HeroProp, HeroTone } from './types';

export const QUOTE_GRAPHIC_COMPOSITION_ID = 'QuoteGraphic';

/** Output canvas — the locked 9:16 short. */
export const QUOTE_GRAPHIC_WIDTH = 1080;
export const QUOTE_GRAPHIC_HEIGHT = 1920;

/**
 * Where the 1080×960 prop stage is drawn (canvas px). Top-centre: below the
 * platforms' top bar (~250 px) and clear of the hero word, which is centred
 * at y = 960 with its cap line near y ≈ 870.
 */
export const QUOTE_GRAPHIC_BOX = { x: 219, y: 250, width: 642, height: 570 } as const;

export interface QuoteGraphicProps {
  prop: HeroProp;
  /** Seconds from the segment start when the prop pops in. */
  at: number;
  tone?: HeroTone;
  /** Card backdrop — must match the plain quote card (BRAND_FG). */
  background: string;
  /** Palette seeds for the prop materials (dark stage seeds, as on explainers). */
  seedBackground: string;
  seedForeground: string;
  accent: string;
  accent2?: string;
}
