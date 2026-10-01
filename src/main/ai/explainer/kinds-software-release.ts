import {
  type SoftwareReleaseScene,
  TECHNOLOGY_LAYOUTS,
  TECHNOLOGY_LIMITS,
} from '../../remotion/compositions/explainer/technology/types';
import type { KindSpec, ParseContext, Rec } from './kind-spec';
import { mechanismIssue } from './mechanism-contract';
import { technologyClause, technologyPhrase, technologyStory } from './technology-contract';

function literal(phrase: string): string {
  return phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
}

// Fail closed on proposed/negated claims, but only within the assertion being used.
// A previous failed attempt in another clause must not negate a later explicit pass.
const UNSUPPORTED =
  /\b(?:not|never|neither|cannot|can't|didn't|doesn't|wasn't|weren't|isn't|aren't|won't|hasn't|haven't|without|skipped|pending|proposed|planned|expected|hopes?|might|may|could|would|should|claims?|claimed|pretends?|unlikely|denies|denied)\b/i;

function assertion(text: string, pattern: RegExp): string | undefined {
  return text
    .replace(/[’‘]/g, "'")
    .split(/[;!?]|\.(?=\s|$)|,|\b(?:but|while|whereas|although|yet)\b/i)
    .find((part) => !UNSUPPORTED.test(part) && pattern.test(part));
}

function claim(text: string, pattern: string): string | undefined {
  return assertion(text, new RegExp(`\\b(?:${pattern})\\b`, 'i'));
}

function phraseWithin(phrase: string, text: string): boolean {
  return new RegExp(`\\b${literal(phrase)}\\b`, 'i').test(text);
}

function passClaim(text: string, check: string, subject: string): boolean {
  const matched = claim(
    text,
    `${check}\\s+(?:(?:has|have)\\s+)?pass(?:es|ed)?\\s+(?:for|on)\\s+(?:the\\s+)?${subject}|${subject}\\s+(?:has\\s+)?pass(?:es|ed)?\\s+(?:the\\s+)?${check}`,
  );
  return !!matched && !/\b(?:fail(?:s|ed)?|regression|skips?)\b/i.test(matched);
}

function parseSoftwareRelease(raw: Rec, ctx: ParseContext): SoftwareReleaseScene | null {
  const story = technologyStory(raw, ctx);
  if (!story) return null;
  const preset = raw.preset;
  if (preset !== 'fix-pass' && preset !== 'regression-rollback' && preset !== 'parallel-release') {
    return mechanismIssue(ctx, 'software-release requires an authored preset');
  }
  const parallel = preset === 'parallel-release';
  if (!Array.isArray(raw.checkLabels) || raw.checkLabels.length !== (parallel ? 2 : 1)) {
    return mechanismIssue(
      ctx,
      'software-release needs one check label, or exactly two for parallel',
    );
  }
  const checkLabels: string[] = [];
  for (const value of raw.checkLabels) {
    const label = technologyPhrase(value, ctx, TECHNOLOGY_LIMITS.actorLabel);
    if (!label) return mechanismIssue(ctx, 'checkLabels must be short source phrases');
    checkLabels.push(label);
  }
  if (parallel && checkLabels[0].toLowerCase() === checkLabels[1].toLowerCase()) {
    return mechanismIssue(ctx, 'parallel checks must have distinct names');
  }
  const setup = technologyClause(ctx, raw.setupWord);
  const action = technologyClause(ctx, raw.actionWord);
  const response = technologyClause(ctx, raw.responseWord);
  const check = technologyClause(ctx, raw.checkWord);
  const resolve = technologyClause(ctx, raw.resolveWord);
  const subject = literal(story.subject);
  const first = literal(checkLabels[0]);
  const second = parallel ? literal(checkLabels[1]) : '';
  const runActor = parallel
    ? `(?:${first}\\s+and\\s+(?:the\\s+)?${second}|${second}\\s+and\\s+(?:the\\s+)?${first})`
    : first;
  const run = claim(
    action,
    `${runActor}\\s+(?:run|runs|ran|are run|were run)\\s+(?:on|against|for)\\s+(?:the\\s+)?${subject}`,
  );
  if (!run || (parallel && !/\bin parallel\b/i.test(run))) {
    return mechanismIssue(
      ctx,
      'the same change must actually reach every named check; parallel checks must run in parallel',
    );
  }

  if (preset === 'regression-rollback') {
    const previousVersion = technologyPhrase(
      raw.previousVersion,
      ctx,
      TECHNOLOGY_LIMITS.actorLabel,
    );
    if (!previousVersion || previousVersion.toLowerCase() === story.subject.toLowerCase()) {
      return mechanismIssue(ctx, 'rollback requires the stated distinct prior version');
    }
    const version = `${literal(previousVersion)}(?![\\w-]|\\.[\\w])`;
    const prior = claim(
      setup,
      `${subject}\\s+replace(?:s|d)?\\s+(?:the\\s+)?(?:prior|previous)\\s+version\\s+${version}`,
    );
    const regression = claim(
      response,
      `regression\\s+(?:in|from)\\s+(?:the\\s+)?${subject}\\s+(?:fails?|failed|breaks?|broke)\\s+(?:the\\s+)?${first}|${first}\\s+fail(?:s|ed)?\\s+(?:on|for)\\s+(?:the\\s+)?${subject}\\s+(?:because of|due to)\\s+(?:a\\s+)?regression`,
    );
    const blocked = claim(
      check,
      `(?:failed\\s+)?${first}\\s+(?:block(?:s|ed)?|prevent(?:s|ed)?)\\s+(?:the\\s+)?release\\s+of\\s+(?:the\\s+)?${subject}`,
    );
    const restored = claim(
      resolve,
      `rollback\\s+restore(?:s|d)?\\s+(?:the\\s+)?(?:prior|previous)\\s+version\\s+${version}`,
    );
    const releasedDespiteFailure = claim(resolve, `${subject}\\s+(?:is|was|has been)\\s+released`);
    if (
      !prior ||
      !regression ||
      !blocked ||
      !restored ||
      releasedDespiteFailure ||
      !phraseWithin(story.outcome, restored)
    ) {
      return mechanismIssue(
        ctx,
        'prove regression → failed named check → blocked release → rollback restoring that prior version',
      );
    }
    return { kind: 'software-release', preset, ...story, checkLabels, previousVersion };
  }
  if (raw.previousVersion !== undefined) {
    return mechanismIssue(ctx, 'previousVersion belongs only to a supported rollback');
  }
  const released = claim(resolve, `${subject}\\s+(?:is|was|has been)\\s+released`);
  if (!released || !phraseWithin(story.outcome, released)) {
    return mechanismIssue(
      ctx,
      'the release outcome must describe this change actually being released',
    );
  }
  if (!passClaim(response, first, subject)) {
    return mechanismIssue(ctx, 'the first named check must explicitly pass for this same change');
  }
  if (parallel) {
    if (
      !passClaim(check, second, subject) ||
      !claim(
        resolve,
        '(?:only\\s+)?after\\s+both\\s+(?:checks|tests)\\s+pass(?:ed)?\\s+and\\s+join(?:ed)?',
      )
    ) {
      return mechanismIssue(
        ctx,
        'parallel release requires each named check to pass, then both to join before release',
      );
    }
  } else {
    const fixed = claim(
      setup,
      `${subject}\\s+(?:fix(?:es|ed)?|resolv(?:es|ed)?|correct(?:s|ed)?)\\s+(?:(?:a|the|this)\\s+)?(?:bug|defect)`,
    );
    const cleared = claim(
      check,
      `passing\\s+${first}\\s+clear(?:s|ed)?\\s+(?:the\\s+)?${subject}\\s+for\\s+release`,
    );
    const afterPass = claim(
      resolve,
      `only\\s+then|after\\s+(?:the\\s+)?${first}\\s+pass(?:es|ed)?`,
    );
    if (!fixed || !cleared || !afterPass) {
      return mechanismIssue(
        ctx,
        'fix-pass needs an actual fix, passing checks clearing that change, and only then release',
      );
    }
  }
  return { kind: 'software-release', preset, ...story, checkLabels };
}

export const SOFTWARE_RELEASE_SPEC: KindSpec<'software-release'> = {
  kind: 'software-release',
  describe:
    'A release workbench follows one code change through physical test gates. fix-pass: fixes a bug, runs and passes its check, then releases. regression-rollback: a regression fails checks, blocks release and rollback restores the named prior version. parallel-release: two named checks run in parallel, each explicitly passes, both join, only then release. No snippets, logs or invented versions.',
  schema:
    '{"kind":"software-release","preset":"fix-pass","label":"source phrase","subject":"patch","checkLabels":["tests"],"outcome":"patch is released","setupWord":N,"actionWord":N,"responseWord":N,"checkWord":N,"resolveWord":N}',
  limits:
    'Source phrases only: label ≤32, subject ≤24, outcome ≤40, checkLabels 1 (2 distinct for parallel) each ≤22; previousVersion ≤22 required only for rollback, stated as prior and explicitly restored. Preserve exact source condition ≤56. Five beats setup/action/response/check/resolve with gaps ≥0.6/1/1/1s; window 5–12s and ≥0.8s final hold. Beats select clauses proving the relationship, not nouns: setup fix/prior; action named checks run on subject; response first pass/regression failure; check clearance/block/second pass; resolve release after clearance or BOTH passing checks join, or rollback restores prior. No skipped, merely proposed or failed check may become a pass.',
  layouts: TECHNOLOGY_LAYOUTS,
  durationSec: [5, 12],
  family: 'process',
  triggers: [
    /\b(?:code change|patch|bug fix|regression|rollback)\b/,
    /\b(?:tests?|checks?)\b.{0,65}\b(?:pass|fail|release|parallel)\b/,
  ],
  avoid:
    'A code noun, a test run without a pass, an unsupported rollback, or parallel work without both passing and joining.',
  parse: parseSoftwareRelease,
  cues: (scene: SoftwareReleaseScene) => [
    { kind: 'thump', at: scene.actionAt, gain: 0.24 },
    {
      kind: scene.preset === 'regression-rollback' ? 'thump' : 'tick',
      at:
        scene.preset === 'regression-rollback'
          ? scene.responseAt
          : scene.checkAt + (scene.preset === 'parallel-release' ? 0.3 : 0),
      gain: 0.28,
    },
    { kind: 'tick', at: scene.resolveAt - 0.3, gain: 0.22 },
  ],
};
