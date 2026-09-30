import {
  DETAIL_KINDS,
  type EditorialFields,
  NUMBER_PRESENTATIONS,
  SEMANTIC_MOTIONS,
  STAMP_FINISHES,
  type StampFinish,
} from '../../remotion/compositions/explainer/editorial/types';
import { EXPLODED_TARGETS } from '../../remotion/compositions/explainer/mechanisms/composed-types';
import {
  type ExplainerScene,
  type ExplainerSceneBody,
  isCausalSceneKind,
  type SceneExtras,
} from '../../remotion/compositions/explainer/types';
import { isRec, type ParseContext, type Rec } from './kind-spec';

function note(ctx: ParseContext, field: string, reason: string): void {
  const message = `optional ${field} omitted: ${reason}`;
  if (!ctx.issues.includes(message)) ctx.issues.push(message);
}

function normalized(text: string): string {
  return text
    .toLocaleLowerCase('en-US')
    .replace(/[’]/g, "'")
    .replace(/(?<!\d)\.|\.(?!\d)/g, '')
    .replace(/[^\p{L}\p{N}'%$+.-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function sourceSupports(text: string, ctx: ParseContext): boolean {
  const source = normalized(
    ctx.words
      .slice(ctx.win.startWord, ctx.win.endWord + 1)
      .map((w) => w.text)
      .join(' '),
  );
  const sought = normalized(text);
  return sought.length > 0 && ` ${source} `.includes(` ${sought} `);
}

/** Evidence-like badges must not reverse a negation or invent certification/results. */
export function stampSupported(text: string, ctx: ParseContext): boolean {
  if (!sourceSupports(text, ctx)) return false;
  const source = normalized(
    ctx.words
      .slice(ctx.win.startWord, ctx.win.endWord + 1)
      .map((w) => w.text)
      .join(' '),
  );
  const target = normalized(text);
  const i = source.indexOf(target);
  return !/\b(no|not|never|isn't|wasn't|aren't|can't|cannot|unverified|without|might|could|allegedly|claims?)\b/.test(
    `${source.slice(Math.max(0, i - 50), i)} ${source.slice(i + target.length, i + target.length + 20)}`,
  );
}

export function isEvidenceStamp(text: string): boolean {
  return /\b(certified|verified|proof|proven|approved|guaranteed?|promised?|study|profit|returns?|results?)\b|\d.*[%$]|[$]\d/i.test(
    text,
  );
}

export function parseStampFinish(
  value: unknown,
  text: string,
  ctx: ParseContext,
): StampFinish | undefined {
  if (value === undefined || value === null) return undefined;
  const finish = STAMP_FINISHES.find((f) => f === value);
  if (!finish || !stampSupported(text, ctx)) {
    note(ctx, 'finish', 'use letterpress/embossed with exact, non-negated source wording');
    return undefined;
  }
  return finish;
}

function beat(
  value: unknown,
  after: number,
  ctx: ParseContext,
  field: string,
  hold = 0.7,
): number | undefined {
  const w = ctx.inWin(value);
  const at = w === null ? undefined : ctx.words[w]?.start;
  // Do not rescue a late beat by clamping the entire reveal into the final frame.
  if (at === undefined || at < after || at + hold > ctx.win.endTime) {
    note(ctx, field, 'word must follow the host entrance and leave a readable final hold');
    return undefined;
  }
  return at;
}

function knownKeys(
  raw: Rec,
  allowed: readonly string[],
  field: string,
  ctx: ParseContext,
): boolean {
  if (Object.keys(raw).some((key) => !allowed.includes(key))) {
    note(ctx, field, 'unknown fields (no replacement text, hidden facts, coordinates or assets)');
    return false;
  }
  return true;
}

/** Match one complete quantity, so a currency/unit elsewhere cannot justify a new fact. */
export function numberSourceSupports(
  body: Extract<ExplainerSceneBody, { kind: 'number' }>,
  ctx: ParseContext,
): boolean {
  // Conservative for optional emphasis: a quoted, denied or hypothetical quantity
  // must not acquire an authoritative mechanical readout. Keep the legacy core.
  const wording = normalized(
    ctx.words
      .slice(ctx.win.startWord, ctx.win.endWord + 1)
      .map((w) => w.text)
      .join(' '),
  );
  if (
    /\b(no|not|never|isn't|wasn't|aren't|can't|cannot|might|could|if|hypothetical|allegedly|claims?)\b/.test(
      wording,
    )
  )
    return false;
  const canonical = (s: string): string =>
    normalized(s.replace(/,/g, '').replace(/−/g, '-'))
      .replace(/\b(percent)\b/g, '%')
      .replace(/\b(hours?|hrs)\b/g, 'h')
      .replace(/\b(minus|negative)\s*/g, '-')
      .replace(/\b(plus|positive)\s*/g, '+')
      .replace(/(\d+(?:\.\d+)?)\s+dollars?\b/g, '$$$1')
      .replace(/\s+/g, '');
  const source = canonical(
    ctx.words
      .slice(ctx.win.startWord, ctx.win.endWord + 1)
      .map((w) => w.text)
      .join(' '),
  );
  const quantity = canonical(
    `${body.prefix ?? ''}${body.value.toFixed(body.decimals ?? 0)}${body.suffix ?? ''}`,
  );
  const i = source.indexOf(quantity);
  if (i < 0) return false;
  // A bare 12 cannot stand in for -12, $12, 120, 12.5 or 12%.
  return (
    !/[\d.+$%-]/.test(source[i - 1] ?? '') && !/[\d.%]/.test(source[i + quantity.length] ?? '')
  );
}

/** Attach optional fields AFTER the kind's core parser; never reject the core. */
export function parseEditorialFields(
  raw: Rec,
  body: ExplainerSceneBody,
  ctx: ParseContext,
): EditorialFields {
  const result: EditorialFields = {};
  if (raw.finish !== undefined && raw.finish !== null) {
    if (body.kind === 'stamp') {
      const finish = parseStampFinish(raw.finish, body.word, ctx);
      if (finish) result.finish = finish;
    } else note(ctx, 'finish', 'supported only on stamps');
  }
  if (raw.labelTreatment !== undefined && raw.labelTreatment !== null) {
    const r = raw.labelTreatment;
    if (
      (body.kind !== 'hero' && body.kind !== 'statement') ||
      !isRec(r) ||
      (r.kind !== 'peel-back' && r.kind !== 'redaction')
    ) {
      note(ctx, 'labelTreatment', 'supported hero/statement kinds are peel-back and redaction');
    } else if (knownKeys(r, ['kind', 'revealWord', 'targetIndex'], 'labelTreatment', ctx)) {
      const index =
        body.kind === 'statement' &&
        typeof r.targetIndex === 'number' &&
        Number.isInteger(r.targetIndex)
          ? r.targetIndex
          : -1;
      const word = body.kind === 'statement' ? body.words[index] : undefined;
      const text = body.kind === 'hero' ? body.label : word?.text;
      const entranceAt = body.kind === 'hero' ? body.at + 0.3 : (word?.at ?? Infinity);
      const at = beat(r.revealWord, entranceAt + 0.15, ctx, 'labelTreatment', 0.95);
      if (
        !text ||
        !sourceSupports(text, ctx) ||
        (isEvidenceStamp(text) && !stampSupported(text, ctx)) ||
        (body.kind === 'hero' && r.targetIndex !== undefined)
      ) {
        note(ctx, 'labelTreatment', 'target must be an existing source-supported label/word');
      } else if (at !== undefined)
        result.labelTreatment = {
          kind: r.kind,
          revealAt: at,
          ...(body.kind === 'statement' ? { targetIndex: index } : {}),
        };
    }
  }
  if (raw.semanticText !== undefined && raw.semanticText !== null) {
    const r = raw.semanticText;
    const kind = isRec(r) ? SEMANTIC_MOTIONS.find((k) => k === r.kind) : undefined;
    if (body.kind !== 'statement' || !isRec(r) || !kind) {
      note(ctx, 'semanticText', 'only compress/separate/align on a statement word');
    } else if (knownKeys(r, ['kind', 'targetIndex', 'word'], 'semanticText', ctx)) {
      const index =
        typeof r.targetIndex === 'number' && Number.isInteger(r.targetIndex) ? r.targetIndex : -1;
      const target = body.words[index];
      const meanings = {
        compress: /^(compress\w*|squeez\w*|compact\w*|shrink\w*|tight\w*)[.!?,]?$/i,
        separate: /^(separat\w*|apart|split\w*|divid\w*)[.!?,]?$/i,
        align: /^(align\w*|togeth\w*|order\w*|synchron\w*)[.!?,]?$/i,
      };
      const at = beat(r.word, target?.at ?? Infinity, ctx, 'semanticText', 1.1);
      if (!target || !sourceSupports(target.text, ctx) || !meanings[kind].test(target.text)) {
        note(ctx, 'semanticText', 'motion must explain the exact source-supported target word');
      } else if (at !== undefined) result.semanticText = { kind, targetIndex: index, at };
    }
  }
  if (raw.presentation !== undefined && raw.presentation !== null) {
    const presentation = NUMBER_PRESENTATIONS.find((p) => p === raw.presentation);
    if (body.kind !== 'number' || !presentation)
      note(ctx, 'presentation', 'only odometer/split-flap on number');
    else {
      if (!numberSourceSupports(body, ctx) || !sourceSupports(body.label, ctx)) {
        note(ctx, 'presentation', 'number, sign, units and label must be source-grounded');
      } else result.presentation = presentation;
    }
  }
  if (raw.detail !== undefined && raw.detail !== null) {
    const r = raw.detail;
    // Structural view keeps this helper independent of kind registration order.
    const host = body as ExplainerSceneBody & {
      template?: keyof typeof EXPLODED_TARGETS;
      target?: string;
      explainAt?: number;
      returnAt?: number;
    };
    const kind = isRec(r) ? DETAIL_KINDS.find((k) => k === r.kind) : undefined;
    if (String(body.kind) !== 'exploded-view' || !isRec(r) || !kind || !host.template) {
      note(ctx, 'detail', 'only authored exploded-view targets support detail treatments');
    } else if (knownKeys(r, ['kind', 'target', 'word', 'label'], 'detail', ctx)) {
      const targets = EXPLODED_TARGETS[host.template];
      const target = targets?.find((target) => target === r.target);
      const label = ctx.str(r.label, 24);
      const at = beat(r.word, host.explainAt ?? Infinity, ctx, 'detail', 0.8);
      if (
        !target ||
        target !== host.target ||
        !label ||
        !sourceSupports(label, ctx) ||
        (kind === 'measurement' && !stampSupported(label, ctx))
      ) {
        note(
          ctx,
          'detail',
          'target must match the selected authored part; label ≤24 chars from source',
        );
      } else if (
        kind === 'measurement' &&
        !/\d+(?:[.,]\d+)?\s*(?:mm|cm|m|km|inches?|feet|ft|grams?|kg|g|ml|liters?|litres?|l|seconds?|secs?|s|ms|minutes?|mins?|hours?|hrs?|percent|degrees?)\b|\d+(?:[.,]\d+)?\s*[%°]/i.test(
          label,
        )
      ) {
        note(
          ctx,
          'detail',
          'measurement needs an explicit source quantity/unit, not inferred dimensions',
        );
      } else if (at !== undefined && at + 0.75 <= (host.returnAt ?? -Infinity)) {
        result.detail = { kind, target, label, at };
      } else note(ctx, 'detail', 'leave time to read the detail before reassembly');
    }
  }
  // Deterministic priority; do not silently stack two primary treatments.
  const keys = Object.keys(result) as (keyof EditorialFields)[];
  for (const key of keys.slice(1)) {
    delete result[key];
    note(ctx, key, 'one primary editorial treatment per scene');
  }
  return result;
}

export function hasEditorialTreatment(scene: EditorialFields & SceneExtras): boolean {
  return !!(
    scene.finish ||
    scene.labelTreatment ||
    scene.semanticText ||
    scene.presentation ||
    scene.detail ||
    scene.overlayStamp?.finish
  );
}

/** Removing optional emphasis must not remove the legacy content it was attached to. */
export function removeEditorialTreatment(scene: ExplainerScene): ExplainerScene {
  const {
    finish: _f,
    labelTreatment: _l,
    semanticText: _s,
    presentation: _p,
    detail: _d,
    ...core
  } = scene as ExplainerScene & EditorialFields;
  if (core.overlayStamp?.finish) delete core.overlayStamp;
  return core as ExplainerScene;
}

/** Functional mechanism scenes never inherit generic decorative extras/pulses. */
export function suppressEditorialExtras(
  body: ExplainerSceneBody & EditorialFields,
  extras: SceneExtras,
  ctx: ParseContext,
): SceneExtras {
  if (isCausalSceneKind(body.kind) || hasEditorialTreatment(body)) {
    if (Object.keys(extras).length)
      note(
        ctx,
        'extras',
        'primary treatment/mechanism owns emphasis; stamps, annotations, dim and reactions removed',
      );
    return {};
  }
  if (extras.overlayStamp?.finish) {
    const { overlayStamp } = extras;
    if (Object.keys(extras).some((k) => k !== 'overlayStamp'))
      note(ctx, 'extras', 'finished overlay stamp owns emphasis');
    return { overlayStamp };
  }
  return extras;
}

/** Offered only for hosts in the shortlist; no expanded kind/prop cap. */
export function editorialPrompt(kinds: readonly string[]): string {
  const lines: string[] = [];
  if (kinds.includes('stamp'))
    lines.push(
      'stamp (or laterStamp): optional "finish":"letterpress"|"embossed"; exact spoken verdict, never invented verification/certification.',
    );
  if (kinds.includes('hero') || kinds.includes('statement'))
    lines.push(
      'hero/statement: optional "labelTreatment":{"kind":"peel-back"|"redaction","revealWord":N,"targetIndex":0}; targetIndex only on statement. Reveals ORIGINAL source text only, no hidden/replacement claim.',
    );
  if (kinds.includes('statement'))
    lines.push(
      'statement: optional "semanticText":{"kind":"compress"|"separate"|"align","targetIndex":0,"word":N} only when that word means the chosen action.',
    );
  if (kinds.includes('number'))
    lines.push(
      'number: optional "presentation":"odometer"|"split-flap"; preserve spoken value, sign, decimals, units and label.',
    );
  if (kinds.includes('exploded-view'))
    lines.push(
      'exploded-view: optional "detail":{"kind":"magnified-inset"|"tracked-callout"|"measurement"|"focus-isolation","target":"authored target","label":"exact source text ≤24 chars","word":N}; target must match scene.target. Measurement requires spoken quantity+unit. Reveal at/after explainWord, ≥0.75s before returnWord.',
    );
  return lines.length
    ? `\nOptional editorial emphasis (omit unless useful; ONE per scene, never adjacent; no annotation/laterStamp/reactions with a primary treatment; mechanisms have no global extras):\n${lines.join('\n')}\nLeave ≥1s to settle/read. All timing uses source-word indexes.\n`
    : '';
}
