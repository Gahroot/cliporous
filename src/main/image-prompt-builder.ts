/**
 * Segment image prompt builder
 *
 * Produces a fal.ai prompt from a segment's caption text, edit style, and
 * layout category.  The prompt keeps it simple — a short descriptive
 * instruction for a 9:16 contextual B-roll image — so fal.ai can fill in
 * plausible visuals without overfitting to any particular scene.
 */

export interface SegmentImagePromptOptions {
  brollSuggestion: string
  overlayText?: string
  editStyleId: string
  accentColor: string
  segmentCategory: 'main-video-images' | 'fullscreen-image'
}

// Rough visual vocabulary per edit style. Missing entries fall back to a
// neutral "clean, professional" treatment.
const STYLE_LOOK: Record<string, string> = {
  growth: 'bold educational flat illustration, high contrast, clean typography-friendly composition',
  cinematic: 'warm cinematic look, film grain, shallow depth of field, dramatic lighting',
  rebel: 'gritty urban aesthetic, bold shadows, high contrast, moody palette',
  clarity: 'minimal clean photography, soft natural light, lots of negative space',
  impact: 'dramatic cinematic photography, strong directional light, muted tones',
  elevate: 'aspirational documentary photography, golden hour, warm tones',
  volt: 'vibrant neon-tinged digital illustration, bold cyberpunk palette, high energy',
  prime: 'polished modern photography, teal-and-orange grade, subtle glow',
  paper_ii: 'editorial magazine photography, soft pastel palette, balanced composition',
  ember: 'warm contemplative photography, golden hour, shallow depth of field',
  film: 'vintage film photography, warm grain, soft focus, cinematic feel',
  align: 'corporate editorial photography, clean lines, balanced geometry',
  lumen: 'natural documentary photography, authentic candid framing, muted palette',
  pulse: 'futuristic UI aesthetic, cyan grid lines, tech dashboard inspired, high-tech glow',
  recess: 'raw unfiltered photography, natural light, honest and direct framing',
  prestyj: 'clean modern high-energy photography, purple accent lighting, crisp and vivid',
}

export function buildSegmentImagePrompt(opts: SegmentImagePromptOptions): string {
  const subject = opts.brollSuggestion.trim() || opts.overlayText?.trim() || 'thematic scene'
  const look = STYLE_LOOK[opts.editStyleId] ?? 'clean, professional photography, balanced composition'
  const framing =
    opts.segmentCategory === 'fullscreen-image'
      ? 'full-frame 9:16 vertical composition, subject fills the frame'
      : 'vertical 9:16 composition with breathing room for text overlay'

  return [
    `${subject}.`,
    `Visual treatment: ${look}.`,
    `Accent color: ${opts.accentColor}.`,
    `Composition: ${framing}.`,
    'No on-image text, no watermarks, no logos.',
  ].join(' ')
}
