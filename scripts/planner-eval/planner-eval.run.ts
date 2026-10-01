import { readFileSync } from 'node:fs';
import { test, vi } from 'vitest';
import type { PlannerGenerator } from '../../src/main/ai/explainer/planner-generation';
import { getPlannerProfile } from '../../src/main/ai/explainer/planner-profiles';
import { parseCorpus } from '../../src/main/ai/planner-eval/corpus';
import {
  type EvaluationOptions,
  runEvaluation,
  runTrial,
} from '../../src/main/ai/planner-eval/runner';
import { evaluationTimeouts } from './run.mjs';

// External boundaries only: the production planner, validators and selection stay real.
// Even an accidental auxiliary Gemini call is a hard failure, not a network request.
vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    constructor() {
      throw new Error('Paid provider forbidden in planner evaluation');
    }
  },
  ThinkingLevel: { LOW: 'LOW', HIGH: 'HIGH', MINIMAL: 'MINIMAL', MEDIUM: 'MEDIUM' },
}));
vi.stubGlobal('fetch', () => {
  throw new Error('In-process network forbidden in planner evaluation');
});

const serialized = process.env.PLANNER_EVAL_OPTIONS;
if (!serialized || serialized.length > 16_384)
  throw new Error('Run through scripts/planner-eval/run.mjs');
const options: unknown = JSON.parse(serialized);
if (!options || typeof options !== 'object') throw new Error('Invalid runtime options');
const o = options as Record<string, unknown>;
const timeouts = evaluationTimeouts(o.mode);

test('explicit offline or subscription-only evaluation adapter', {
  timeout: timeouts.testMs,
}, async () => {
  if (
    !['dry-run', 'replay', 'live'].includes(String(o.mode)) ||
    typeof o.corpus !== 'string' ||
    typeof o.directory !== 'string' ||
    typeof o.codeFingerprint !== 'string' ||
    (o.reasoning !== undefined && typeof o.reasoning !== 'string') ||
    (o.transport !== undefined &&
      !['gg-chatgpt', 'codex-subscription'].includes(String(o.transport))) ||
    (o.executableSha256 !== undefined &&
      (typeof o.executableSha256 !== 'string' ||
        o.executableSha256.length !== 64 ||
        !/^[a-f0-9]{64}$/.test(o.executableSha256))) ||
    (o.autoReloadDisabled !== undefined && typeof o.autoReloadDisabled !== 'boolean')
  )
    throw new Error('Invalid runtime options');
  if (
    o.mode === 'live' &&
    (o.transport !== 'gg-chatgpt' ||
      o.codexExecutable !== undefined ||
      o.executableSha256 !== undefined ||
      typeof o.model !== 'string')
  )
    throw new Error('GG ChatGPT model preflight required; native configuration is forbidden');
  const parsed = parseCorpus(readFileSync(o.corpus, 'utf8'));
  if (!parsed.ok) throw new Error(parsed.error);
  if (o.fixture !== undefined && o.fixture !== 'authored-responses-v1')
    throw new Error('Unknown authored fixture');
  const evaluation: EvaluationOptions = {
    mode: o.mode as 'dry-run' | 'replay' | 'live',
    corpus: parsed.value,
    directory: o.directory,
    fixture: o.fixture,
    codeFingerprint: o.codeFingerprint,
    model: typeof o.model === 'string' ? o.model : undefined,
    transport: o.transport as EvaluationOptions['transport'],
    reasoning: typeof o.reasoning === 'string' ? o.reasoning : undefined,
    autoReloadDisabled:
      typeof o.autoReloadDisabled === 'boolean' ? o.autoReloadDisabled : undefined,
    codexExecutable: typeof o.codexExecutable === 'string' ? o.codexExecutable : undefined,
    executableSha256: typeof o.executableSha256 === 'string' ? o.executableSha256 : undefined,
    repetitions: typeof o.repetitions === 'number' ? o.repetitions : 2,
    profiles: Array.isArray(o.profiles)
      ? o.profiles.map((id) => {
          const profile = typeof id === 'string' ? getPlannerProfile(id) : undefined;
          if (!profile) throw new Error('Unknown planner profile');
          return profile.id;
        })
      : undefined,
    clipId: typeof o.clipId === 'string' ? o.clipId : undefined,
    split: o.split === 'discovery' || o.split === 'holdout' ? o.split : undefined,
    signal: AbortSignal.timeout(timeouts.runMs),
  };
  const report = await runEvaluation(evaluation);
  if (o.fixture === 'authored-responses-v1') {
    const original = parseCorpus(
      readFileSync(new URL('./fixtures/authored-v1.json', import.meta.url), 'utf8'),
    );
    if (!original.ok || JSON.stringify(original.value) !== JSON.stringify(parsed.value))
      throw new Error('Authored responses require the unchanged authored corpus');
    const data: unknown = JSON.parse(
      readFileSync(new URL('./fixtures/authored-responses-v1.json', import.meta.url), 'utf8'),
    );
    if (
      !data ||
      typeof data !== 'object' ||
      !('clips' in data) ||
      !data.clips ||
      typeof data.clips !== 'object'
    )
      throw new Error('Invalid authored responses');
    const clips = data.clips as Record<string, unknown>;
    for (const spec of report.schedule) {
      const response = clips[spec.clipId];
      if (!response || typeof response !== 'object') continue;
      const phases = response as Record<string, unknown>;
      const generator: PlannerGenerator = async ({ phase }) => {
        const value = phases[phase] === 'use-draft' ? phases.draft : phases[phase];
        if (value === undefined) throw new Error('Missing authored response phase');
        return {
          text: JSON.stringify(value),
          metadata: {
            provider: 'offline',
            model: 'authored-control-v1',
            configId: 'authored-responses-v1',
            latencyMs: 0,
          },
        };
      };
      await runTrial(evaluation, spec, generator);
    }
    await runEvaluation(evaluation);
  }
  console.log('Evaluation report saved. See report.json for completion and access status.');
});
