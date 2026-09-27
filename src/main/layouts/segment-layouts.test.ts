import { describe, expect, it } from 'vitest';
import {
  buildArchetypeLayout,
  PIP_WINDOW,
  pipSlideXExpr,
  type SegmentLayoutParams,
} from './segment-layouts';

const SCALE = 'lanczos+accurate_rnd+full_chroma_int';

const base: SegmentLayoutParams = {
  width: 1080,
  height: 1920,
  segmentDuration: 3,
  fps: 30,
  mediaPath: '/tmp/stage.mp4',
  sourceWidth: 1920,
  sourceHeight: 1080,
  cropRect: { x: 656, y: 0, width: 608, height: 1080 },
};

/** Filter graph emitted for split-image before `explainerLayout` existed. */
const LEGACY_STACK =
  `[1:v]scale=1080:960:force_original_aspect_ratio=increase:flags=${SCALE},crop=1080:960,setpts=N/FR/TB,fps=30,setsar=1[top];` +
  `[0:v]crop=608:1080:656:0,crop=608:540,scale=1080:960:flags=${SCALE},setpts=N/FR/TB,fps=30,setsar=1[bottom];` +
  '[top][bottom]vstack=inputs=2[composed];[composed]setsar=1,format=yuv420p[outv]';

const LEGACY_STACK_NO_CROP =
  `[1:v]scale=1080:960:force_original_aspect_ratio=increase:flags=${SCALE},crop=1080:960,setpts=N/FR/TB,fps=30,setsar=1[top];` +
  `[0:v]crop=1214:1080,scale=1080:960:flags=${SCALE},setpts=N/FR/TB,fps=30,setsar=1[bottom];` +
  '[top][bottom]vstack=inputs=2[composed];[composed]setsar=1,format=yuv420p[outv]';

describe('split-image explainer layouts', () => {
  it('undefined layout emits the legacy stack graph byte-for-byte', () => {
    expect(buildArchetypeLayout('split-image', base)).toEqual({
      filterComplex: LEGACY_STACK,
      inputCount: 2,
    });
    const { cropRect: _c, fps: _f, ...noCrop } = base;
    expect(buildArchetypeLayout('split-image', noCrop).filterComplex).toBe(LEGACY_STACK_NO_CROP);
  });

  it("'stack' is identical to undefined (and ignores speakerZoomFilter)", () => {
    expect(
      buildArchetypeLayout('split-image', {
        ...base,
        explainerLayout: 'stack',
        speakerZoomFilter: 'crop=iw:ih',
      }).filterComplex,
    ).toBe(LEGACY_STACK);
  });

  it('explainerLayout is ignored by non split-image archetypes', () => {
    const plain = buildArchetypeLayout('talking-head', base).filterComplex;
    expect(
      buildArchetypeLayout('talking-head', { ...base, explainerLayout: 'pip' }).filterComplex,
    ).toBe(plain);
  });

  it('stack-flipped puts the speaker on top and the stage below', () => {
    const { filterComplex, inputCount } = buildArchetypeLayout('split-image', {
      ...base,
      explainerLayout: 'stack-flipped',
    });
    expect(inputCount).toBe(2);
    expect(filterComplex).toBe(
      `[0:v]crop=608:1080:656:0,crop=608:540,scale=1080:960:flags=${SCALE},setpts=N/FR/TB,fps=30,setsar=1[top];` +
        `[1:v]scale=1080:960:force_original_aspect_ratio=increase:flags=${SCALE},crop=1080:960,setpts=N/FR/TB,fps=30,setsar=1[bottom];` +
        '[top][bottom]vstack=inputs=2[composed];[composed]setsar=1,format=yuv420p[outv]',
    );
  });

  it('takeover fills the frame with the stage and never draws [0:v]', () => {
    const { filterComplex, inputCount } = buildArchetypeLayout('split-image', {
      ...base,
      explainerLayout: 'takeover',
    });
    // Input 0 stays wired so the encoder maps the speaker audio.
    expect(inputCount).toBe(2);
    expect(filterComplex).not.toContain('[0:v]');
    expect(filterComplex).toBe(
      `[1:v]scale=1080:1920:force_original_aspect_ratio=decrease:flags=${SCALE},` +
        'pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black,setpts=N/FR/TB,fps=30,setsar=1[composed];' +
        '[composed]setsar=1,format=yuv420p[outv]',
    );
  });

  describe('pip', () => {
    const { filterComplex, inputCount } = buildArchetypeLayout('split-image', {
      ...base,
      explainerLayout: 'pip',
    });
    const restX = 1080 - PIP_WINDOW.margin - PIP_WINDOW.width; // 632
    const restY = 1920 - PIP_WINDOW.margin - PIP_WINDOW.height; // 1352

    it('uses the stage full-frame as the base layer', () => {
      expect(inputCount).toBe(2);
      expect(filterComplex).toContain(
        `[1:v]scale=1080:1920:force_original_aspect_ratio=decrease:flags=${SCALE},pad=1080:1920`,
      );
      expect(filterComplex).toMatch(/\[pipstage\]\[pipchrome\]overlay=/);
      expect(filterComplex).toMatch(/\[pipbg\]\[pipspk\]overlay=.*\[composed\]/);
      expect(filterComplex.endsWith('[composed]setsar=1,format=yuv420p[outv]')).toBe(true);
    });

    it('face-crops the speaker to the window interior, anchored above centre', () => {
      // 608×1080 face crop → 394:514 aspect sub-crop (608×792) anchored at 40%.
      expect(filterComplex).toContain(
        `[0:v]crop=608:1080:656:0,crop=608:792:0:115,scale=394:514:flags=${SCALE},` +
          'setpts=N/FR/TB,fps=30,setsar=1,format=yuva420p[pipspkraw]',
      );
    });

    it('masks the speaker with a procedurally generated rounded rect', () => {
      expect(filterComplex).toContain('color=c=black:s=394x514:r=30:d=0.0333,format=gray,geq=lum=');
      // Inner radius = 48 - 3 px border.
      expect(filterComplex).toContain('-45)');
      expect(filterComplex).toContain('[pipspkraw][pipmask]alphamerge[pipspk]');
      expect(filterComplex).not.toMatch(/movie=|\.png/);
    });

    it('generates a shadow + border chrome layer (one frame, rgba geq)', () => {
      expect(filterComplex).toMatch(/color=c=black@0:s=488x608:r=30:d=0\.0333,format=rgba,geq=r='/);
      expect(filterComplex).toContain('0.42*exp(');
      expect(filterComplex).toContain('0.55*clip(');
    });

    it('slides both layers in from the right with the same eased motion', () => {
      const dist = 1080 - (restX - 44);
      expect(filterComplex).toContain(
        `overlay=x='${pipSlideXExpr(restX - 44, dist, PIP_WINDOW.slideSeconds)}':y=${restY - 44}[pipbg]`,
      );
      expect(filterComplex).toContain(
        `overlay=x='${pipSlideXExpr(restX + 3, dist, PIP_WINDOW.slideSeconds)}':y=${restY + 3}[composed]`,
      );
    });
  });

  describe('pipSlideXExpr', () => {
    const evalAt = (expr: string, t: number): number =>
      Function('t', 'abs', `return ${expr};`)(t, Math.abs) as number;

    it('is comma-free', () => {
      expect(pipSlideXExpr(632, 492, 0.35)).not.toContain(',');
    });

    it('eases out from rest+dist to rest over the slide window, then holds', () => {
      const e = pipSlideXExpr(632, 492, 0.35);
      expect(evalAt(e, 0)).toBeCloseTo(1124);
      expect(evalAt(e, 0.35)).toBeCloseTo(632);
      expect(evalAt(e, 2)).toBeCloseTo(632);
      // easeOutCubic: past halfway by a third of the way through.
      const early = evalAt(e, 0.35 / 3);
      expect(early).toBeLessThan(632 + 492 / 2);
      expect(evalAt(e, 0.1)).toBeGreaterThan(evalAt(e, 0.2));
    });
  });

  describe('over', () => {
    const talkingHead = buildArchetypeLayout('talking-head', base).filterComplex;
    const thChain = talkingHead.slice('[0:v]'.length, talkingHead.indexOf('[scaled]'));

    it('renders the speaker like talking-head and alpha-overlays the stage', () => {
      const { filterComplex, inputCount } = buildArchetypeLayout('split-image', {
        ...base,
        explainerLayout: 'over',
      });
      expect(inputCount).toBe(2);
      expect(filterComplex).toBe(
        `[0:v]${thChain},setsar=1[overspk];` +
          `[1:v]format=yuva420p,scale=1080:1920:force_original_aspect_ratio=decrease:flags=${SCALE},` +
          'pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black@0,setpts=N/FR/TB,fps=30,setsar=1[overstage];' +
          '[overspk][overstage]overlay=0:0:format=auto[composed];' +
          '[composed]setsar=1,format=yuv420p[outv]',
      );
    });

    it('applies speakerZoomFilter to the speaker only, before the overlay', () => {
      const { filterComplex } = buildArchetypeLayout('split-image', {
        ...base,
        explainerLayout: 'over',
        speakerZoomFilter: 'crop=w=100:h=100,scale=1080:1920',
      });
      expect(filterComplex).toContain(
        `[0:v]${thChain},setsar=1,crop=w=100:h=100,scale=1080:1920[overspk]`,
      );
      expect(filterComplex.split('crop=w=100').length).toBe(2);
    });
  });
});
