import { describe, expect, it } from 'vitest';
import type { PlannerWord } from './kind-spec';
import { ALL_KIND_SPECS } from './kinds';
import { buildShortlist, SHORTLIST_LIMITS } from './shortlist';

function toWords(text: string): PlannerWord[] {
  return text.split(/\s+/).map((w, i) => ({ text: w, start: i * 0.4, end: i * 0.4 + 0.35 }));
}

/**
 * Offline eval set: realistic podcast lines → a kind (and optionally a prop)
 * that MUST be on the menu the planner sees. This is how we notice when a new
 * kind's triggers crowd out an old one, or a line stops reaching its kind.
 */
const CASES: { text: string; kind: string; prop?: string }[] = [
  { text: 'The formula is simple: consistency times time equals results.', kind: 'equation' },
  {
    text: 'Plot every task on effort versus impact and do the high impact low effort ones first.',
    kind: 'quadrant',
  },
  {
    text: 'Your business lives in the sweet spot where what you love meets what people pay for.',
    kind: 'venn',
  },
  {
    text: 'ROI basically means how much you get back for every dollar you put in.',
    kind: 'definition',
  },
  {
    text: 'A Harvard study found that people who write goals down are twice as likely to hit them.',
    kind: 'study',
  },
  { text: 'One in four founders quit in the first year.', kind: 'pictogram' },
  {
    text: 'My top three channels, ranked: number one is referrals, then SEO, then email.',
    kind: 'ranking',
  },
  {
    text: 'Rent costs 2,000 a month, ads another 500, tools 200. Add it up, that is 2,700 a month.',
    kind: 'receipt',
  },
  {
    text: 'I posted every day for thirty days straight and the streak changed everything.',
    kind: 'streak',
  },
  {
    text: "It's a spectrum. Most people sit somewhere between lazy and burnt out.",
    kind: 'spectrum',
  },
  { text: 'As Naval says, play long-term games with long-term people.', kind: 'quote' },
  { text: 'It was all over the news, every headline said the startup was dead.', kind: 'headline' },
  {
    text: 'I was broke, hit rock bottom, then had my breakthrough and a real comeback.',
    kind: 'journey',
  },
  { text: 'Just google it. People search how to start a podcast every day.', kind: 'search' },
  {
    text: 'I wrote one line of code, ran the command in the terminal, and the bug was gone.',
    kind: 'code',
  },
  {
    text: 'People only see the surface, the launch, not what is underneath: years of hidden work.',
    kind: 'iceberg',
  },
  {
    text: 'You have to weigh it: the risk versus reward here is massively in your favour.',
    kind: 'balance',
  },
  {
    text: 'Third place went to email, second place SEO, and the winner, the gold medal, referrals.',
    kind: 'podium',
  },
  {
    text: 'If you invest 500 a month, compound interest turns it into a million over time.',
    kind: 'compound',
  },
  {
    text: 'Better sleep leads to more energy, which leads to focus. One domino knocks over the next, a chain reaction.',
    kind: 'dominoes',
  },
  {
    text: 'Step by step: learn, then build, then scale. Take it one step at a time and climb.',
    kind: 'stairs',
  },
  // Older kinds must stay reachable.
  { text: 'First, write the outline. Second, record it. Third, edit it down.', kind: 'checklist' },
  {
    text: 'Most people think you need more ads. That is a myth, the truth is you need a better offer.',
    kind: 'myth-fact',
  },
  {
    text: 'Out of a thousand leads only fifty convert, the funnel narrows at every step.',
    kind: 'funnel',
  },
  {
    text: 'It is a flywheel: content brings leads, leads bring revenue, revenue funds content, over and over.',
    kind: 'loop',
  },
  { text: 'Before, I edited every video by hand. Now the old way is gone.', kind: 'before-after' },
  // Hero props follow the transcript.
  {
    text: 'Save a little every month, that savings account is your safety net.',
    kind: 'hero',
    prop: 'piggybank',
  },
  { text: 'Burnout is real. My energy was completely drained.', kind: 'hero', prop: 'battery' },
  { text: 'AI changed everything. ChatGPT writes my first drafts.', kind: 'hero', prop: 'chip' },
  { text: 'Set one clear goal and aim everything at that target.', kind: 'hero', prop: 'target' },
  {
    text: 'Patience. It takes years, and time is running out for people who wait.',
    kind: 'hero',
    prop: 'hourglass',
  },
];

describe('buildShortlist eval set', () => {
  it.each(CASES)('offers $kind for "$text"', ({ text, kind, prop }) => {
    const s = buildShortlist(toWords(text));
    expect(s.kinds.map((k) => k.kind)).toContain(kind);
    if (prop) expect(s.heroProps).toContain(prop);
  });
});

describe('buildShortlist limits', () => {
  it('always offers the general kinds', () => {
    const s = buildShortlist(toWords('hello there'));
    for (const k of ALL_KIND_SPECS.filter((x) => x.general)) {
      expect(s.kinds.map((x) => x.kind)).toContain(k.kind);
    }
  });

  it('backfills a quiet transcript to the minimum', () => {
    const s = buildShortlist(toWords('hello there friend'));
    expect(s.kinds.length).toBeGreaterThanOrEqual(SHORTLIST_LIMITS.minKinds);
    expect(s.heroProps.length).toBeGreaterThanOrEqual(SHORTLIST_LIMITS.minProps);
  });

  it('never exceeds the caps, even for a trigger-heavy transcript', () => {
    const everything = CASES.map((c) => c.text).join(' ');
    const s = buildShortlist(toWords(everything));
    expect(s.kinds.length).toBeLessThanOrEqual(SHORTLIST_LIMITS.maxKinds);
    expect(s.heroProps.length).toBeLessThanOrEqual(SHORTLIST_LIMITS.maxProps);
  });

  it('is deterministic and keeps registry order', () => {
    const w = toWords(CASES.map((c) => c.text).join(' '));
    const a = buildShortlist(w);
    const b = buildShortlist(w);
    expect(a.kinds.map((k) => k.kind)).toEqual(b.kinds.map((k) => k.kind));
    const order = ALL_KIND_SPECS.map((k) => k.kind);
    const idx = a.kinds.map((k) => order.indexOf(k.kind));
    expect(idx).toEqual([...idx].sort((x, y) => x - y));
  });

  it('prompt lists only shortlisted hero props', async () => {
    const { buildExplainerPrompt } = await import('../explainer-scenes');
    const w = toWords('Save money every month in a savings account, it is your budget.');
    const s = buildShortlist(w);
    const prompt = buildExplainerPrompt(w, { minStart: 0, maxEnd: 100 }, '9:16', s);
    expect(prompt).toContain('piggybank (');
    const offered = new Set(s.heroProps);
    for (const p of ['brain', 'dice', 'door'] as const) {
      if (!offered.has(p)) expect(prompt).not.toContain(`${p} (`);
    }
  });
});
