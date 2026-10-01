import { agentWorkflowTiming } from '../../remotion/compositions/explainer/technology/agent-workflow';
import {
  type AgentWorkflowScene,
  TECHNOLOGY_LAYOUTS,
  TECHNOLOGY_LIMITS,
} from '../../remotion/compositions/explainer/technology/types';
import type { SceneCue } from '../../remotion/compositions/explainer/types';
import type { KindSpec, ParseContext, Rec } from './kind-spec';
import { mechanismIssue } from './mechanism-contract';
import { technologyEvidence, technologyPhrase, technologyStory } from './technology-contract';

// Deliberately bounded relationship grammar, not a bag of technology nouns. Split at
// claim boundaries so the first failed call cannot negate a later successful retry.
const NEGATED =
  /\b(?:no|not|never|without|cannot|can't|won't|doesn't|didn't|isn't|wasn't|hasn't|couldn't|wouldn't|neither)\b/i;
const PROPOSED =
  /\b(?:may|might|could|should|would|will|maybe|perhaps|plans?|proposes?|hopes?|tries|attempts?|pretends?|allegedly|supposedly)\b/i;
const FAILED =
  /\b(?:fails?|failed|failure|unsuccessful(?:ly)?|denied|denies|rejects?|rejected|refuses?|refused|unchecked|unverified|skipped|pending)\b/i;
const UNRELATED =
  /\b(?:another|other|different|unrelated)\s+(?:\w+\s+){0,2}(?:task|tool|result)\b/i;

function claims(text: string): string[] {
  return text
    .split(/[.!?;,]|\b(?:but|then|and)\b/i)
    .map((part) => part.toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function asserted(claim: string): boolean {
  return !NEGATED.test(claim) && !PROPOSED.test(claim);
}

function positive(claim: string): boolean {
  return asserted(claim) && !FAILED.test(claim) && !UNRELATED.test(claim);
}

function escapePhrase(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function containsPhrase(claim: string, phrase: string): boolean {
  return ` ${claim} `.includes(` ${phrase.toLowerCase()} `);
}

function parseAgentWorkflow(raw: Rec, ctx: ParseContext): AgentWorkflowScene | null {
  if (
    raw.preset !== 'tool-success' &&
    raw.preset !== 'tool-retry' &&
    raw.preset !== 'approval-gate'
  )
    return mechanismIssue(
      ctx,
      'agent-workflow needs an authored tool-success, tool-retry or approval-gate preset',
    );

  const story = technologyStory(raw, ctx);
  const toolLabel = technologyPhrase(raw.toolLabel, ctx, TECHNOLOGY_LIMITS.actorLabel);
  if (!story || !toolLabel)
    return mechanismIssue(ctx, 'agent-workflow needs a source-backed toolLabel');
  if (
    [story.label, story.subject, story.outcome, story.condition ?? '', toolLabel].some((text) =>
      /[<>]|https?:\/\/|www\./i.test(text),
    )
  ) {
    return mechanismIssue(ctx, 'agent-workflow labels are source text, not markup or URLs');
  }

  const setupWord = ctx.inWin(raw.setupWord);
  const actionWord = ctx.inWin(raw.actionWord);
  const responseWord = ctx.inWin(raw.responseWord);
  const checkWord = ctx.inWin(raw.checkWord);
  const resolveWord = ctx.inWin(raw.resolveWord);
  if (
    setupWord === null ||
    actionWord === null ||
    responseWord === null ||
    checkWord === null ||
    resolveWord === null
  )
    return null;

  const setup = claims(technologyEvidence(ctx, setupWord, actionWord - 1));
  const action = claims(technologyEvidence(ctx, actionWord, responseWord - 1));
  const response = claims(technologyEvidence(ctx, responseWord, checkWord - 1));
  const check = claims(technologyEvidence(ctx, checkWord, resolveWord - 1));
  const resolution = claims(technologyEvidence(ctx, resolveWord, ctx.win.endWord));
  const tool = escapePhrase(toolLabel.toLowerCase());
  const subject = escapePhrase(story.subject.toLowerCase());
  const receivesTask = new RegExp(
    `\\bagent (?:gets?|got|receives?|received|takes?|took) (?:a |the |that )?${subject}\\b`,
  );
  const callsTool = new RegExp(
    `\\bagent (?:calls?|called|invokes?|invoked) (?:the |a )?${tool}\\b`,
  );
  const returnsResult = new RegExp(
    `\\b${tool} (?:returns?|returned|produces?|produced) (?:a |the |its )?result\\b`,
  );
  const completesTask = new RegExp(
    `\\bagent (?:finally )?(?:completes?|completed|finishes?|finished) (?:the |that |its )?(?:${subject}|task)\\b`,
  );

  if (
    !setup.some((c) => positive(c) && receivesTask.test(c)) ||
    !action.some((c) => positive(c) && callsTool.test(c))
  ) {
    return mechanismIssue(
      ctx,
      'show the agent receiving this subject and actually calling this named tool, in the setup/action spans',
    );
  }
  // The outcome must quote the completing claim, not an earlier wish or another task.
  if (
    !/\b(?:complete[sd]?|finishe[sd]|done)\b/i.test(story.outcome) ||
    !resolution.some(
      (c) => positive(c) && completesTask.test(c) && containsPhrase(c, story.outcome),
    )
  ) {
    return mechanismIssue(
      ctx,
      'resolveWord needs this agent completing this task with the quoted outcome, not an unsupported completion',
    );
  }
  if (resolution.some((c) => NEGATED.test(c) || PROPOSED.test(c) || FAILED.test(c))) {
    return mechanismIssue(
      ctx,
      'the resolution cannot contradict or merely propose task completion',
    );
  }

  const returned = response.findIndex((c) => positive(c) && returnsResult.test(c));
  if (returned < 0)
    return mechanismIssue(ctx, 'the called tool must actually return a result before checking');

  const resultCheck = raw.preset === 'approval-gate' ? response.slice(returned + 1) : check;
  const inspected = resultCheck.findIndex(
    (c) =>
      positive(c) &&
      /\bagent (?:checks?|checked|validates?|validated) (?:the |that |its |returned )*result\b/.test(
        c,
      ),
  );
  const passed = resultCheck.findIndex(
    (c) =>
      positive(c) && /\bresult (?:passes?|passed) (?:the |its )?(?:check|validation)\b/.test(c),
  );
  if (
    inspected < 0 ||
    passed <= inspected ||
    resultCheck.some((c) => FAILED.test(c) || NEGATED.test(c) || PROPOSED.test(c))
  ) {
    return mechanismIssue(
      ctx,
      'the returned result needs an actual agent check and a passing result, not just a check mention',
    );
  }

  if (raw.preset === 'tool-retry') {
    const failed = response.findIndex(
      (c) => asserted(c) && /\b(?:first|initial) (?:tool )?call (?:fails?|failed)\b/.test(c),
    );
    const retriesTool = new RegExp(`\\bagent (?:retries|retried) (?:the |that |same )?${tool}\\b`);
    const retried = response.findIndex((c) => positive(c) && retriesTool.test(c));
    if (
      failed < 0 ||
      retried <= failed ||
      returned <= retried ||
      response.slice(retried).some((c) => !positive(c))
    ) {
      return mechanismIssue(
        ctx,
        'tool-retry requires a first failed call, an actual retry of that tool, and its returned passing result; retry alone is not success',
      );
    }
  } else if (
    response.some(
      (c) =>
        FAILED.test(c) || NEGATED.test(c) || PROPOSED.test(c) || /\bretr(?:y|ies|ied)\b/.test(c),
    )
  ) {
    return mechanismIssue(
      ctx,
      'this branch cannot silently turn a failed or proposed call into success',
    );
  }

  if (raw.preset === 'approval-gate') {
    const requested = response.findIndex(
      (c) =>
        positive(c) &&
        /\b(?:task (?:waits?|waited) for (?:human |a person's )?approval|agent (?:requests?|requested) (?:human )?approval)\b/.test(
          c,
        ),
    );
    const granted = check.some(
      (c) =>
        positive(c) &&
        /\b(?:person|human|reviewer) (?:approves?|approved) (?:the |that )?(?:task|result)\b/.test(
          c,
        ),
    );
    // `passed` is relative to the slice after the returned claim. Approval must
    // wait for that validation, not merely for the tool's return.
    const validated = returned + 1 + passed;
    // A grant belongs to a person, not to the tool or agent. Request != grant.
    if (requested <= validated || !granted || check.some((c) => !positive(c))) {
      return mechanismIssue(
        ctx,
        'approval-gate needs result validation before the waiting request, followed by explicit human approval at checkWord before task completion',
      );
    }
  } else if ([...response, ...check].some((c) => /\bapproval\b/.test(c))) {
    return mechanismIssue(ctx, 'a human approval prerequisite must use the approval-gate branch');
  }

  return { kind: 'agent-workflow', preset: raw.preset, ...story, toolLabel };
}

export const AGENT_WORKFLOW_SPEC: KindSpec<'agent-workflow'> = {
  kind: 'agent-workflow',
  family: 'process',
  describe:
    'An agent owns one task on a control desk, calls a named tool, checks its returned result, then completes the same task. tool-retry visibly stops a failed first call before an actual successful retry. approval-gate waits for an explicitly granted human approval, never a request alone. Retain any exact source condition; conditional outcomes are illustrative, not verified events.',
  schema:
    '{"kind":"agent-workflow","preset":"tool-success|tool-retry|approval-gate","label":"source phrase","subject":"source task","toolLabel":"source tool","outcome":"source completion phrase","condition":"exact source condition, only if present","setupWord":N,"actionWord":N,"responseWord":N,"checkWord":N,"resolveWord":N}',
  limits:
    'label ≤32, subject ≤24, outcome ≤40, condition ≤56, toolLabel ≤22; all source-backed. Five explicit word indices, 5–12s, gaps ≥0.6/1/1/1s, final hold ≥0.8s. setupWord: receives task; actionWord: calls tool; responseWord: return (or first failure, actual retry, then return); checkWord: checks/passes result, or human grant after a checked result and approval request; resolveWord: task completes. Choose clause-start words so actors remain in their evidence spans.',
  layouts: TECHNOLOGY_LAYOUTS,
  durationSec: [TECHNOLOGY_LIMITS.minDuration, TECHNOLOGY_LIMITS.maxDuration],
  triggers: [
    /\bagent (?:calls?|called|invokes?|invoked)\b.{0,90}\b(?:tool|result)\b/,
    /\btool (?:call|result)\b.{0,90}\b(?:check|pass|fail|retr(?:y|ies|ied))\b/,
    /\bagent (?:retr(?:y|ies|ied))\b.{0,60}\b(?:tool|result)\b/,
    /\b(?:agent|tool)\b.{0,160}\bhuman approval\b/,
  ],
  avoid:
    'Not mere tool mentions, a proposed or failed retry, an unchecked result, approval requests/denials without a grant, or invented completion claims.',
  parse: parseAgentWorkflow,
  cues: (scene: AgentWorkflowScene): SceneCue[] => {
    const timing = agentWorkflowTiming(scene);
    return [
      { kind: 'tick', at: scene.actionAt, gain: 0.45 },
      ...(scene.preset === 'tool-retry'
        ? [
            { kind: 'thump' as const, at: scene.responseAt, gain: 0.4 },
            { kind: 'tick' as const, at: timing.retryContactAt, gain: 0.4 },
          ]
        : []),
      { kind: 'flip', at: scene.checkAt, gain: 0.4 },
      { kind: 'tick', at: scene.resolveAt, gain: 0.45 },
    ];
  },
};
