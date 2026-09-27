/**
 * Data-ish scene kinds (before-after, chart, chat, network, loop) as planner
 * specs. Mirrors the structure of kinds-core.ts.
 */

import type { SceneCue } from '../../remotion/compositions/explainer/types';
import {
  type AnyKindSpec,
  isRec,
  type KindSpec,
  num,
  type ParseContext,
  parseTimedList,
} from './kind-spec';

const L = {
  baTitle: 16,
  baPoint: 24,
  chartTitle: 22,
  chartLabel: 6,
  chartCallout: 8,
  chatFrom: 18,
  chatMessage: 60,
  networkHub: 12,
  networkNode: 14,
  loopStage: 14,
  loopCenter: 12,
} as const;

/** Largest chart value we accept (values are relative; this only rejects garbage). */
const CHART_MAX_VALUE = 1e12;

/** Optional string: null/undefined → undefined; invalid → null (reject). */
function optStr(ctx: ParseContext, v: unknown, max: number): string | undefined | null {
  if (v === null || v === undefined) return undefined;
  return ctx.str(v, max);
}

/** Optional beat: null/undefined → undefined; out-of-window → null (reject). */
function optWord(ctx: ParseContext, v: unknown): number | undefined | null {
  if (v === null || v === undefined) return undefined;
  return ctx.inWin(v);
}

export const beforeAfterSpec: KindSpec<'before-after'> = {
  kind: 'before-after',
  describe:
    'they contrast the old way with the new way (before/after, without/with). Two cards, each a short title + 1-3 short points; a slider wipes from "before" to "after" on the turn word.',
  schema:
    '{"kind":"before-after","before":{"title":"...","points":["..."]},"after":{"title":"...","points":["..."]},"beforeWord":N,"wipeWord":N}',
  limits: `before/after title ≤ ${L.baTitle}, each point ≤ ${L.baPoint} (1-3 points per side)`,
  layouts: ['stack', 'pip', 'takeover'],
  durationSec: [3.5, 9],
  parse: (raw, ctx) => {
    const side = (v: unknown): { title: string; points: string[] } | null => {
      if (!isRec(v) || !Array.isArray(v.points)) return null;
      const title = ctx.str(v.title, L.baTitle);
      if (!title) return null;
      const points: string[] = [];
      for (const p of v.points) {
        const s = ctx.str(p, L.baPoint);
        if (s === null) return null;
        points.push(s);
      }
      if (points.length < 1) return null;
      return { title, points: points.slice(0, 3) };
    };
    const before = side(raw.before);
    const after = side(raw.after);
    const beforeW = ctx.inWin(raw.beforeWord);
    const wipeW = ctx.inWin(raw.wipeWord);
    if (!before || !after || beforeW === null || wipeW === null) return null;
    const beforeAt = ctx.at(beforeW);
    // The "before" card needs a moment on screen before the wipe reads.
    const wipeAt = Math.min(ctx.lastBeat, Math.max(ctx.at(wipeW), beforeAt + 0.8));
    if (wipeAt - beforeAt < 0.4) return null;
    return { kind: 'before-after', before, after, beforeAt, wipeAt };
  },
  cues: (s) => [
    { kind: 'slide', at: s.beforeAt, gain: 0.7 },
    { kind: 'whoosh', at: s.wipeAt, gain: 0.7 },
  ],
};

/** When the chart's callout pops (after the last bar/point has grown). Shared with the scene. */
export function chartCalloutAt(growAt: number, pointCount: number): number {
  return growAt + 0.35 + pointCount * 0.12 + 0.3;
}

export const chartSpec: KindSpec<'chart'> = {
  kind: 'chart',
  describe:
    'they talk about growth or decline over time (revenue up, churn down). Bars or a line with 3-6 short point labels and relative values; optional callout on the last point ("+212%").',
  schema:
    '{"kind":"chart","style":"bars"|"line","trend":"up"|"down","title":"...","points":[{"label":"Jan","value":12}],"callout":"+212%" or null,"growWord":N}',
  limits: `chart title ≤ ${L.chartTitle}, point label ≤ ${L.chartLabel} (3-6 points, values ≥ 0), callout ≤ ${L.chartCallout}`,
  layouts: ['stack', 'over', 'pip'],
  durationSec: [3, 8],
  parse: (raw, ctx) => {
    const title = ctx.str(raw.title, L.chartTitle);
    const growW = ctx.inWin(raw.growWord);
    if (!title || growW === null || !Array.isArray(raw.points)) return null;
    const points: { label: string; value: number }[] = [];
    for (const p of raw.points) {
      if (!isRec(p)) return null;
      const label = ctx.str(p.label, L.chartLabel);
      const value = num(p.value, 0, CHART_MAX_VALUE);
      if (label === null || value === null) return null;
      points.push({ label, value });
    }
    if (points.length < 3) return null;
    const kept = points.slice(0, 6);
    if (!kept.some((p) => p.value > 0)) return null;
    const callout = optStr(ctx, raw.callout, L.chartCallout);
    if (callout === null) return null;
    const first = kept[0]?.value ?? 0;
    const last = kept[kept.length - 1]?.value ?? 0;
    const trend =
      raw.trend === 'up' || raw.trend === 'down' ? raw.trend : last >= first ? 'up' : 'down';
    return {
      kind: 'chart',
      style: raw.style === 'line' ? 'line' : 'bars',
      trend,
      points: kept,
      title,
      ...(callout ? { callout } : {}),
      growAt: ctx.at(growW),
    };
  },
  cues: (s) => [
    { kind: 'rise', at: s.growAt, gain: 0.6 },
    ...(s.callout
      ? [{ kind: 'pop' as const, at: chartCalloutAt(s.growAt, s.points.length), gain: 0.8 }]
      : []),
  ],
};

export const chatSpec: KindSpec<'chat'> = {
  kind: 'chat',
  describe:
    'they quote a message, a customer text, an email or a notification. A phone mockup with 1-4 short messages that pop in on the words they are said.',
  schema:
    '{"kind":"chat","medium":"sms"|"email"|"notification","from":"...","messages":[{"text":"...","side":"them"|"me","word":N}]}',
  limits: `from ≤ ${L.chatFrom}, message ≤ ${L.chatMessage} (1-4 messages; for email the first message is the subject)`,
  layouts: ['over', 'stack', 'pip'],
  durationSec: [3, 9],
  parse: (raw, ctx) => {
    const from = ctx.str(raw.from, L.chatFrom);
    if (!from) return null;
    const messages = parseTimedList(
      raw.messages,
      ctx,
      (m) => {
        const text = ctx.str(m.text, L.chatMessage);
        return text ? { text, side: m.side === 'me' ? ('me' as const) : ('them' as const) } : null;
      },
      [1, 4],
    );
    if (!messages) return null;
    const medium = raw.medium === 'email' || raw.medium === 'notification' ? raw.medium : 'sms';
    return {
      kind: 'chat',
      medium,
      from,
      messages: messages.map((m) => ({ text: m.text, side: m.side, at: m.t })),
    };
  },
  cues: (s) => s.messages.map((m): SceneCue => ({ kind: 'pop', at: m.at, gain: 0.6 })),
};

export const networkSpec: KindSpec<'network'> = {
  kind: 'network',
  describe:
    'they name people/tools/parts that connect (your team, your stack, a referral network). 3-6 nodes around an optional hub; lines draw in as each is named; optionally everything links up ("it all connects").',
  schema:
    '{"kind":"network","hub":"..." or null,"nodes":[{"label":"...","icon":"Icon","word":N}],"connectAllWord":N or null}',
  limits: `hub ≤ ${L.networkHub}, node label ≤ ${L.networkNode} (3-6 nodes)`,
  layouts: ['stack', 'takeover', 'pip'],
  durationSec: [3.5, 10],
  parse: (raw, ctx) => {
    const nodes = parseTimedList(
      raw.nodes,
      ctx,
      (n) => {
        const label = ctx.str(n.label, L.networkNode);
        return label ? { label, icon: ctx.icon(n.icon) } : null;
      },
      [3, 6],
    );
    if (!nodes) return null;
    const hub = optStr(ctx, raw.hub, L.networkHub);
    const connectW = optWord(ctx, raw.connectAllWord);
    if (hub === null || connectW === null) return null;
    const lastNode = nodes[nodes.length - 1]?.t ?? ctx.win.startTime;
    const connectAllAt =
      connectW === undefined
        ? undefined
        : Math.max(lastNode, Math.min(ctx.lastBeat, Math.max(ctx.at(connectW), lastNode + 0.4)));
    return {
      kind: 'network',
      ...(hub ? { hub } : {}),
      nodes: nodes.map((n) => ({ label: n.label, icon: n.icon, at: n.t })),
      ...(connectAllAt === undefined ? {} : { connectAllAt }),
    };
  },
  cues: (s) => [
    ...s.nodes.map((n): SceneCue => ({ kind: 'tick', at: n.at, gain: 0.85 })),
    ...(s.connectAllAt === undefined
      ? []
      : [{ kind: 'whoosh' as const, at: s.connectAllAt, gain: 0.6 }]),
  ],
};

export const loopSpec: KindSpec<'loop'> = {
  kind: 'loop',
  describe:
    'they describe a cycle that repeats (habit loop, feedback loop, flywheel). 2-5 stages around a ring joined by arrows; optional centre label; the ring starts spinning on the "again and again" word.',
  schema: '{"kind":"loop","stages":[{"label":"...","word":N}],"center":"..." or null,"spinWord":N}',
  limits: `stage label ≤ ${L.loopStage} (2-5 stages), center ≤ ${L.loopCenter}`,
  layouts: ['stack', 'pip', 'takeover'],
  durationSec: [3.5, 10],
  parse: (raw, ctx) => {
    const stages = parseTimedList(
      raw.stages,
      ctx,
      (st) => {
        const label = ctx.str(st.label, L.loopStage);
        return label ? { label } : null;
      },
      [2, 5],
    );
    if (!stages) return null;
    const center = optStr(ctx, raw.center, L.loopCenter);
    const spinW = ctx.inWin(raw.spinWord);
    if (center === null || spinW === null) return null;
    const lastStage = stages[stages.length - 1]?.t ?? ctx.win.startTime;
    const spinAt = Math.max(
      lastStage,
      Math.min(ctx.lastBeat, Math.max(ctx.at(spinW), lastStage + 0.3)),
    );
    return {
      kind: 'loop',
      stages: stages.map((st) => ({ label: st.label, at: st.t })),
      ...(center ? { center } : {}),
      spinAt,
    };
  },
  cues: (s) => [
    ...s.stages.map((st): SceneCue => ({ kind: 'tick', at: st.at, gain: 0.85 })),
    { kind: 'whoosh', at: s.spinAt, gain: 0.55 },
  ],
};

export const DATA_KIND_SPECS: readonly AnyKindSpec[] = [
  beforeAfterSpec,
  chartSpec,
  chatSpec,
  networkSpec,
  loopSpec,
];
