import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { tradeoffFixture } from '../../../../ai/explainer/hybrid-test-fixtures';
import { inferenceTradeoffSpec } from '../../../../ai/explainer/kinds-ai-diagrams';
import { InferenceTradeoffScene } from './InferenceTradeoffScene';

vi.mock('../stage', async (original) => {
  const actual = await original<typeof import('../stage')>();
  return {
    ...actual,
    useStage: () => actual.STAGE,
    useSceneTime: () => ({ t: 9, frame: 270, fps: 30 }),
  };
});

describe('model comparison decision evidence', () => {
  it('renders the actual parsed constraint with its unit, not just a chosen model', () => {
    const fixture = tradeoffFixture('constraint-choice', 'diagram');
    const scene = inferenceTradeoffSpec.parse(fixture.raw, fixture.ctx);
    if (!scene) throw new Error(fixture.ctx.issues.join('; '));
    const markup = renderToStaticMarkup(createElement(InferenceTradeoffScene, { scene }));
    expect(markup).toContain('Cost limit: 1 USD/task');
    expect(markup).toContain('sorting');
    expect(markup).toContain('one test');
    expect(markup).toContain('Illustrative example');
  });

  it('does not invent a limit for an unconstrained comparison', () => {
    const fixture = tradeoffFixture('measured-comparison', 'diagram');
    const scene = inferenceTradeoffSpec.parse(fixture.raw, fixture.ctx);
    if (!scene) throw new Error(fixture.ctx.issues.join('; '));
    const markup = renderToStaticMarkup(createElement(InferenceTradeoffScene, { scene }));
    expect(markup).not.toContain('limit:');
    expect(markup).toContain('No universal winner');
  });
});
