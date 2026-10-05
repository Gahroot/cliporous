import { validLongformWords } from '../../../shared/longform-scenes';
import {
  STORYBOARD_LIMITS as L,
  STORYBOARD_MODEL_ACTIONS,
  STORYBOARD_MODELS,
  STORYBOARD_PANEL_KINDS,
  type StoryboardDiagnostic,
  type StoryboardLabel,
  type StoryboardPanel,
  type StoryboardResult,
  type StoryboardSourceSpan,
  type StoryboardSourceSpec,
  storyboardSourceInputBudget,
} from '../../../shared/storyboards';
import type { WordTimestamp } from '../../../shared/types';
import {
  type BusinessExplanationReconstruction,
  parseBusinessExplanationSource,
} from './business-adapters';
import {
  type BusinessPanelProjection,
  businessPanelProjection,
  isBusinessStoryboardScene,
} from './business-diagrams';
import { businessReadingWords } from './business-reading';
import { BOARD_LAYOUT, BOARD_MODELS, panelLabels } from './catalog';

export interface StoryboardParseContext {
  clipStart: number;
  clipEnd: number;
  section?: { id: string; startWord: number; endWord: number };
  sourceId?: string;
}
export interface ParsedStoryboard {
  spec: StoryboardSourceSpec;
  startTime: number;
  endTime: number;
  /** All clocks are ABSOLUTE source seconds. No segment-local timing here. */
  panels: {
    revealAt: number;
    moveAt: number;
    labelsAt: number[];
    propAt?: number;
    actionEndAt?: number;
  }[];
  overviewAt?: number;
  businessPanels?: ReadonlyMap<
    string,
    { reconstruction: BusinessExplanationReconstruction; projection: BusinessPanelProjection }
  >;
}

// biome-ignore lint/suspicious/noControlCharactersInRegex: reject control characters in untrusted source labels.
const unsafeText = /[<>`{}\\\u0000-\u001f]|(?:https?|file|data|javascript):|www\./i;
const conditional =
  /\b(if|unless|might|may|could|would|not|never|cannot|can't|doesn't|don't|without)\b/i;
const approximate =
  /\b(about|around|roughly|approximately|nearly|almost|over|under|at least|up to|between)\b/i;
export function normalizedSourcePhrase(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[.,!?;:"“”‘’()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function sourceLabelText(text: string): string {
  // Case/spacing may change; punctuation may carry quantity, unit or relationship meaning.
  return text.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}
function canonicalDecimal(text: string): string | null {
  const match = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(text.replaceAll(',', ''));
  if (!match) return null;
  const integer = match[2].replace(/^0+(?=\d)/, '');
  const fraction = (match[3] ?? '').replace(/0+$/, '');
  const sign = match[1] === '-' && (integer !== '0' || fraction) ? '-' : '';
  return `${sign}${integer}${fraction ? `.${fraction}` : ''}`;
}
function plain(value: unknown): value is Record<string, unknown> {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
  );
}

/** Inspect before stringify or property access: no cycles, getters, class instances or oversized JSON. */
export function storyboardInputBudget(input: unknown): boolean {
  return storyboardSourceInputBudget(input);
}

/** Strict source-only allowlist. This is also the saved-file security boundary. */
export function parseStoryboardSpec(
  input: unknown,
  words: readonly WordTimestamp[],
  context: StoryboardParseContext,
): StoryboardResult<ParsedStoryboard> {
  const diagnostics: StoryboardDiagnostic[] = [];
  const fail = (
    code: StoryboardDiagnostic['code'],
    message: string,
    panelId?: string,
    repairable = true,
  ) => {
    if (diagnostics.length < 24)
      diagnostics.push({ code, message, panelId, sourceId: context.sourceId, repairable });
  };
  const reject = (): StoryboardResult<ParsedStoryboard> => ({ ok: false, diagnostics });
  if (!storyboardInputBudget(input)) {
    fail('budget', 'Source specification exceeds the bounded plain-JSON budget.', undefined, false);
    return reject();
  }
  if (!plain(input)) return reject();
  const keys = (
    value: unknown,
    required: string[],
    optional: string[] = [],
    panelId?: string,
  ): value is Record<string, unknown> => {
    if (
      !plain(value) ||
      required.some((key) => !(key in value)) ||
      Object.keys(value).some((key) => !required.includes(key) && !optional.includes(key))
    ) {
      fail(
        'shape',
        'Missing or unsupported source fields; geometry and executable content are forbidden.',
        panelId,
        false,
      );
      return false;
    }
    return true;
  };
  if (
    !keys(input, ['kind', 'specVersion', 'startWord', 'endWord', 'subject', 'panels'], ['overview'])
  )
    return reject();
  if (input.kind !== 'storyboard' || (input.specVersion !== 1 && input.specVersion !== 2)) {
    fail(
      'version',
      'Expected storyboard specVersion 1 or 2; the saved version is preserved.',
      undefined,
      false,
    );
    return reject();
  }
  if (
    !Number.isFinite(context.clipStart) ||
    context.clipStart < 0 ||
    !validLongformWords(words, context.clipEnd) ||
    context.clipEnd <= context.clipStart
  ) {
    fail('words', 'Invalid transcript or source bounds.', undefined, false);
    return reject();
  }
  const span = (
    value: Record<string, unknown>,
    bounds: StoryboardSourceSpan,
    panelId?: string,
  ): boolean => {
    const { startWord: start, endWord: end } = value;
    if (
      typeof start !== 'number' ||
      typeof end !== 'number' ||
      !Number.isInteger(start) ||
      !Number.isInteger(end) ||
      start < bounds.startWord ||
      end > bounds.endWord ||
      end < start ||
      !words[start] ||
      !words[end]
    ) {
      fail('words', 'Source span is out of range or reversed.', panelId);
      return false;
    }
    return true;
  };
  const sourceBounds = { startWord: 0, endWord: words.length - 1 };
  if (!span(input, sourceBounds) || input.startWord === input.endWord) {
    if (!diagnostics.length) fail('words', 'A board needs a source passage.');
    return reject();
  }
  const boardSpan = { startWord: input.startWord as number, endWord: input.endWord as number };
  if (
    context.section &&
    (boardSpan.startWord < context.section.startWord || boardSpan.endWord > context.section.endWord)
  )
    fail('words', 'Storyboard crosses its owned planning section.');
  const phrase = (s: StoryboardSourceSpan) =>
    words
      .slice(s.startWord, s.endWord + 1)
      .map((w) => w.text)
      .join(' ');
  const evidence = (
    value: unknown,
    bounds: StoryboardSourceSpan,
    panelId?: string,
  ): value is StoryboardSourceSpan =>
    keys(value, ['startWord', 'endWord'], [], panelId) && span(value, bounds, panelId);
  const label = (
    value: unknown,
    bounds: StoryboardSourceSpan,
    panelId?: string,
  ): value is StoryboardLabel => {
    if (
      !keys(value, ['text', 'startWord', 'endWord'], [], panelId) ||
      !span(value, bounds, panelId)
    )
      return false;
    if (
      typeof value.text !== 'string' ||
      !value.text.trim() ||
      value.text.length > L.maxLabelChars ||
      value.text.trim().split(/\s+/).length > L.maxLabelWords ||
      unsafeText.test(value.text) ||
      sourceLabelText(value.text) !==
        sourceLabelText(phrase(value as unknown as StoryboardSourceSpan))
    ) {
      fail(
        'evidence',
        'Label must be a bounded exact source phrase, not generated prose.',
        panelId,
      );
      return false;
    }
    return true;
  };
  label(input.subject, boardSpan);
  if (
    !Array.isArray(input.panels) ||
    input.panels.length < L.minPanels ||
    input.panels.length > L.maxPanels
  ) {
    fail('budget', 'A storyboard requires one to five panels.', undefined, false);
    return reject();
  }
  const ids = new Set<string>();
  const props = new Map<string, string>();
  let lastEndWord = boardSpan.startWord - 1;
  let modelMeshes = 0;
  let propCount = 0;
  const businessPanels = new Map<
    string,
    { reconstruction: BusinessExplanationReconstruction; projection: BusinessPanelProjection }
  >();
  const sharedIdentities = new Map<
    string,
    { localId: string; label: string; role: string; origin: string }
  >();
  for (const raw of input.panels) {
    const panelId = plain(raw) && typeof raw.id === 'string' ? raw.id.slice(0, 64) : undefined;
    if (
      !plain(raw) ||
      (!STORYBOARD_PANEL_KINDS.some((kind) => kind === raw.kind) &&
        !(input.specVersion === 2 && raw.kind === 'explanation'))
    ) {
      fail('unsupported', 'Unsupported panel template.', panelId, false);
      continue;
    }
    const additions: Record<string, string[]> = {
      statement: ['body'],
      comparison: ['left', 'right', 'evidence'],
      process: ['items', 'relationship', 'evidence'],
      notes: ['items'],
      quantity: ['value', 'unit', 'evidence'],
      hero: ['caption', 'prop'],
      explanation: ['explanation'],
    };
    if (
      !keys(
        raw,
        [
          'id',
          'kind',
          'startWord',
          'endWord',
          'title',
          'revealWord',
          'moveWord',
          ...additions[String(raw.kind)],
        ],
        raw.kind === 'hero' || raw.kind === 'explanation' ? [] : ['prop'],
        panelId,
      )
    )
      continue;
    if (!panelId || !/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(String(raw.id)) || ids.has(panelId))
      fail('identity', 'Panel IDs must be unique bounded identifiers.', panelId);
    if (panelId) ids.add(panelId);
    if (!span(raw, boardSpan, panelId)) continue;
    const pSpan = { startWord: raw.startWord as number, endWord: raw.endWord as number };
    if (pSpan.startWord <= lastEndWord)
      fail('words', 'Panels must follow nonoverlapping source order.', panelId);
    lastEndWord = pSpan.endWord;
    const beat = (word: unknown) =>
      typeof word === 'number' &&
      Number.isInteger(word) &&
      word >= pSpan.startWord &&
      word <= pSpan.endWord;
    if (
      !beat(raw.revealWord) ||
      !beat(raw.moveWord) ||
      (raw.revealWord as number) > (raw.moveWord as number)
    )
      fail('timing', 'Reveal and move must be ordered words inside the panel.', panelId);
    label(raw.title, pSpan, panelId);
    if (raw.kind === 'explanation' && panelId) {
      const reconstructed = parseBusinessExplanationSource(raw.explanation, [...words], {
        ...context,
        section: { id: panelId, ...pSpan },
      });
      if (!reconstructed.ok) {
        diagnostics.push(...reconstructed.diagnostics.map((issue) => ({ ...issue, panelId })));
        continue;
      }
      const native = reconstructed.value.planned.scene;
      if (!isBusinessStoryboardScene(native)) {
        fail('unsupported', 'Reconstruction is outside the business allowlist.', panelId, false);
        continue;
      }
      const projected = businessPanelProjection(native, reconstructed.value.source.sourceVersion);
      if (!projected.ok) {
        diagnostics.push(...projected.diagnostics.map((issue) => ({ ...issue, panelId })));
        continue;
      }
      for (const identity of reconstructed.value.identities) {
        const link = identity.link;
        if (!link) continue;
        const previous = sharedIdentities.get(link.sharedId);
        if (
          previous &&
          (previous.localId !== link.localId ||
            previous.label !== identity.identity.label ||
            previous.role !== link.role ||
            previous.origin !== identity.origin)
        )
          fail(
            'identity',
            'Shared identity must retain its native ID, source label, semantic role and origin; a label or alias alone is not equivalence evidence.',
            panelId,
          );
        sharedIdentities.set(link.sharedId, {
          localId: link.localId,
          label: identity.identity.label,
          role: link.role,
          origin: identity.origin,
        });
      }
      businessPanels.set(panelId, {
        reconstruction: reconstructed.value,
        projection: projected.value,
      });
    }
    if (raw.kind === 'statement') label(raw.body, pSpan, panelId);
    if (raw.kind === 'hero') label(raw.caption, pSpan, panelId);
    if (raw.kind === 'comparison') {
      const valid =
        label(raw.left, pSpan, panelId) &&
        label(raw.right, pSpan, panelId) &&
        evidence(raw.evidence, pSpan, panelId);
      if (valid) {
        const e = raw.evidence as unknown as StoryboardSourceSpan;
        const sides = [raw.left, raw.right] as StoryboardLabel[];
        if (
          sides.some((s) => s.startWord < e.startWord || s.endWord > e.endWord) ||
          !/\b(versus|vs|compared|whereas|while|unlike|but|both|than|different|same)\b/i.test(
            phrase(e),
          )
        )
          fail('evidence', 'Comparison needs local evidence containing both sides.', panelId);
      }
    }
    if (raw.kind === 'process' || raw.kind === 'notes') {
      if (
        !Array.isArray(raw.items) ||
        raw.items.length < (raw.kind === 'process' ? 2 : 1) ||
        raw.items.length > L.maxItems
      )
        fail('budget', 'Invalid item count.', panelId);
      else {
        let last = pSpan.startWord - 1;
        for (const item of raw.items)
          if (label(item, pSpan, panelId)) {
            if (item.startWord <= last)
              fail('words', 'Items must follow source order without overlap.', panelId);
            last = item.endWord;
          }
      }
      if (raw.kind === 'process') {
        if (!['sequence', 'causes'].includes(String(raw.relationship)))
          fail('unsupported', 'Unsupported relationship.', panelId, false);
        if (evidence(raw.evidence, pSpan, panelId)) {
          const text = phrase(raw.evidence);
          const supported =
            raw.relationship === 'causes'
              ? /\b(causes?|because|therefore|leads? to|results? in|so that)\b/i.test(text)
              : /\b(then|next|after|before|first|finally|followed by)\b/i.test(text);
          if (
            !supported ||
            conditional.test(phrase(pSpan)) ||
            !Array.isArray(raw.items) ||
            raw.items.some(
              (item) =>
                !plain(item) ||
                (item.startWord as number) < (raw.evidence as StoryboardSourceSpan).startWord ||
                (item.endWord as number) > (raw.evidence as StoryboardSourceSpan).endWord,
            )
          )
            fail(
              'evidence',
              'Directional relationship lacks affirmative local source evidence for every item.',
              panelId,
            );
        }
      }
    }
    if (raw.kind === 'quantity') {
      const valid = label(raw.unit, pSpan, panelId) && label(raw.evidence, pSpan, panelId);
      if (valid) {
        const e = raw.evidence as unknown as StoryboardLabel;
        const u = raw.unit as unknown as StoryboardLabel;
        const evidenceText = words
          .slice(e.startWord, e.endWord + 1)
          .map((word) => word.text)
          .join(' ');
        // Read numeric meaning from source, never a normalized model label that can lose a sign.
        // Unicode boundaries prevent accepting an ASCII suffix of a different numeral.
        const exact =
          evidenceText
            .replaceAll('−', '-')
            .match(/(?<![\p{L}\p{N}_.])[-+]?\d+(?:,\d{3})*(?:\.\d+)?(?![\p{L}\p{N}_.])/gu) ?? [];
        if (
          typeof raw.value !== 'number' ||
          !Number.isFinite(raw.value) ||
          Math.abs(raw.value) > 1e12 ||
          e.text.replaceAll('−', '-') !== evidenceText.replaceAll('−', '-') ||
          exact.length !== 1 ||
          Number(exact[0].replaceAll(',', '')) !== raw.value ||
          canonicalDecimal(exact[0]) !== canonicalDecimal(String(raw.value)) ||
          u.startWord < e.startWord ||
          u.endWord > e.endWord ||
          /\d/.test(u.text) ||
          approximate.test(phrase(pSpan)) ||
          conditional.test(phrase(pSpan)) ||
          /[%$€£]/.test(e.text.replace(u.text, ''))
        )
          fail(
            'evidence',
            'Quantity and unit must be one exact, unconditional source-backed value.',
            panelId,
          );
      }
    }
    if (raw.prop !== undefined) {
      const p = raw.prop;
      if (!keys(p, ['id', 'model', 'action', 'atWord', 'evidence'], [], panelId)) continue;
      if (typeof p.id !== 'string' || !/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(p.id))
        fail('identity', 'Invalid semantic prop ID.', panelId);
      if (!STORYBOARD_MODELS.some((model) => model === p.model)) {
        fail('unsupported', 'Unsupported storyboard model.', panelId, false);
        continue;
      }
      const model = p.model as keyof typeof BOARD_MODELS;
      const def = BOARD_MODELS[model];
      modelMeshes += def.meshes;
      propCount++;
      if (!STORYBOARD_MODEL_ACTIONS[model].some((action) => action === p.action))
        fail('unsupported', 'Unsupported action for this model.', panelId, false);
      if (!beat(p.atWord) || (p.atWord as number) < (raw.revealWord as number))
        fail('timing', 'Prop action must follow the panel reveal.', panelId);
      if (evidence(p.evidence, boardSpan, panelId)) {
        if (!def.subject.test(phrase(p.evidence)))
          fail(
            'evidence',
            'Prop must identify an object supported by its source evidence.',
            panelId,
          );
        const signature = JSON.stringify([model, p.evidence.startWord, p.evidence.endWord]);
        if (typeof p.id === 'string') {
          if (props.has(p.id) && props.get(p.id) !== signature)
            fail('identity', 'Repeated semantic props must retain model and evidence.', panelId);
          props.set(p.id, signature);
        }
      }
      if (p.action !== 'reveal') {
        const text = phrase(pSpan);
        const action = p.action === 'deactivate' ? def.deactivate : def.activate;
        // A single local clause must name this object and its action. Do not infer direction.
        const clauses = text.split(/[.!?;]/);
        const actorAction =
          action &&
          new RegExp(
            `${def.subject.source}(?:\\s+(?:now|slowly|quickly|gradually|fully|is|starts|to)){0,3}\\s+${action.source}`,
            'i',
          );
        const supported = clauses.some(
          (clause) => actorAction?.test(clause) && !conditional.test(clause),
        );
        if (!supported || conditional.test(text))
          fail(
            'evidence',
            'Prop direction requires an affirmative local clause about that object.',
            panelId,
          );
      }
    }
  }
  if (propCount > L.maxProps || modelMeshes > L.maxModelMeshes)
    fail('budget', 'Cumulative prop/mesh budget exceeded.', undefined, false);
  if (
    input.overview !== undefined &&
    (!keys(input.overview, ['atWord']) ||
      !Number.isInteger(input.overview.atWord) ||
      (input.overview.atWord as number) < boardSpan.startWord ||
      (input.overview.atWord as number) > boardSpan.endWord)
  )
    fail('timing', 'Overview must be anchored inside the board.');
  if (diagnostics.length) return reject();

  const spec = structuredClone(input) as unknown as StoryboardSourceSpec;
  const subject = normalizedSourcePhrase(spec.subject.text);
  const seenProps = new Set<string>();
  const priorLabels = new Set<string>();
  const seenBusinessLinks = new Set<string>();
  const labelsForPanel = (panel: StoryboardPanel): StoryboardLabel[] =>
    panel.kind === 'explanation' ? [panel.title] : panelLabels(panel);
  for (const panel of spec.panels) {
    const mentionsSubject = ` ${normalizedSourcePhrase(phrase(panel))} `.includes(` ${subject} `);
    const reusesSubject = panel.prop && seenProps.has(panel.prop.id);
    const connectedRelationship =
      (panel.kind === 'comparison' || panel.kind === 'process') &&
      panelLabels(panel).some((l) => priorLabels.has(normalizedSourcePhrase(l.text)));
    const connectedBusiness =
      panel.kind === 'explanation' &&
      panel.explanation.identityLinks.some((link) => seenBusinessLinks.has(link.sharedId));
    if (!mentionsSubject && !reusesSubject && !connectedRelationship && !connectedBusiness)
      fail(
        'evidence',
        'Panel lacks a shared explanatory subject, repeated evidenced prop, or connected relationship.',
        panel.id,
      );
    if (panel.prop) seenProps.add(panel.prop.id);
    for (const l of labelsForPanel(panel)) priorLabels.add(normalizedSourcePhrase(l.text));
    if (panel.kind === 'explanation')
      for (const link of panel.explanation.identityLinks) seenBusinessLinks.add(link.sharedId);
    if (panel.kind === 'process') {
      // Arrows follow the source direction; "A after B" / "A because B" must not become A → B.
      const marker =
        panel.relationship === 'causes'
          ? /\b(causes?|leads? to|results? in|therefore|so that)\b/i
          : /\b(then|next|before|followed by)\b/i;
      for (let i = 1; i < panel.items.length; i++) {
        const between = words
          .slice(panel.items[i - 1].endWord + 1, panel.items[i].startWord)
          .map((w) => w.text)
          .join(' ');
        if (!marker.test(between))
          fail(
            'evidence',
            'Every process edge needs forward relationship evidence between its source items.',
            panel.id,
          );
      }
    }
  }
  const startTime = Math.max(context.clipStart, words[spec.startWord].start - 0.25);
  const endTime = Math.min(context.clipEnd, words[spec.endWord].end + 0.35);
  if (
    words[spec.startWord].start < context.clipStart ||
    words[spec.endWord].end > context.clipEnd ||
    endTime - startTime < L.minDurationSec ||
    endTime - startTime > L.maxDurationSec
  )
    fail('timing', 'Storyboard window must preserve its source within 4..40 seconds.');
  if (
    spec.panels[0].startWord !== spec.startWord ||
    spec.panels[0].revealWord !== spec.startWord ||
    spec.panels[0].moveWord !== spec.startWord ||
    spec.panels.at(-1)?.endWord !== spec.endWord
  )
    fail('timing', 'First/last panels must cover the full board window.');
  const overviewAt = spec.overview && words[spec.overview.atWord].start;
  const panels = spec.panels.map((panel, index) => {
    const revealAt = words[panel.revealWord].start;
    const moveAt = words[panel.moveWord].start;
    const labels = labelsForPanel(panel);
    const labelsAt = labels.map((l) => Math.max(revealAt, words[l.startWord].start));
    // Title is ready during the incoming pan, rather than panning to an empty panel.
    if (labelsAt[0] > moveAt || moveAt - revealAt > BOARD_LAYOUT.panSec)
      fail('timing', 'Incoming title must be ready during the source-anchored pan.', panel.id);
    const propAt = panel.prop && words[panel.prop.atWord].start;
    const actionEndAt =
      panel.prop && propAt !== undefined
        ? propAt +
          (panel.prop.action === 'reveal'
            ? BOARD_LAYOUT.revealSec
            : BOARD_MODELS[panel.prop.model].actionSec)
        : undefined;
    const exit =
      index + 1 < spec.panels.length
        ? words[spec.panels[index + 1].moveWord].start
        : (overviewAt ?? endTime - BOARD_LAYOUT.fadeSec);
    const readableStart = Math.max(
      revealAt + BOARD_LAYOUT.revealSec,
      moveAt + (index ? BOARD_LAYOUT.panSec : 0),
    );
    let readWords = new Set(
      labels.flatMap((l) =>
        Array.from({ length: l.endWord - l.startWord + 1 }, (_, n) => l.startWord + n),
      ),
    ).size;
    const business = businessPanels.get(panel.id);
    if (business) {
      const plan = business.reconstruction.planned;
      if (
        plan.startTime < startTime ||
        plan.endTime > endTime ||
        (index > 0 && plan.startTime < moveAt) ||
        (index + 1 < spec.panels.length && plan.endTime > exit)
      )
        fail(
          'timing',
          'Camera/window would trim the protected native explanation interval.',
          panel.id,
        );
      const content = business.projection;
      readWords = Math.max(
        readWords,
        [
          content.title,
          ...content.headings,
          ...content.rows.flatMap((row) => row.cells),
          ...content.notes,
        ].reduce(
          (count, text) =>
            count +
            (panel.kind === 'explanation' && panel.explanation.sourceVersion === 2
              ? businessReadingWords(text)
              : text.trim().split(/\s+/u).length),
          0,
        ),
      );
    }
    if (
      exit - readableStart < readWords / BOARD_LAYOUT.wordsPerSecond + L.minHoldSec ||
      Math.max(...labelsAt) + BOARD_LAYOUT.revealSec + L.minHoldSec > exit ||
      (actionEndAt !== undefined && actionEndAt + L.minHoldSec > exit)
    )
      fail(
        'timing',
        `Insufficient reading, action or completed hold time.${panel.kind === 'explanation' && panel.explanation.sourceVersion === 2 ? ` Reading: ${readWords} words need ${(readWords / BOARD_LAYOUT.wordsPerSecond + L.minHoldSec).toFixed(3)}s; ${(exit - readableStart).toFixed(3)}s available.` : ''}`,
        panel.id,
      );
    return { revealAt, moveAt, labelsAt, propAt, actionEndAt };
  });
  const lastPanel = panels.at(-1);
  if (
    overviewAt !== undefined &&
    (!lastPanel ||
      overviewAt <= lastPanel.moveAt ||
      endTime - BOARD_LAYOUT.fadeSec - overviewAt < BOARD_LAYOUT.panSec + L.minOverviewHoldSec)
  )
    fail('timing', 'Overview requires a complete move and readable hold.');
  if (diagnostics.length) return reject();
  return {
    ok: true,
    value: {
      spec,
      startTime,
      endTime,
      panels,
      ...(overviewAt === undefined ? {} : { overviewAt }),
      ...(businessPanels.size ? { businessPanels } : {}),
    },
  };
}
