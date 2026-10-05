import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  AuthorityHandshakeRail,
  BusinessEvidenceNote,
  ObservationMark,
  PriorityTrayMark,
} from './treatments';

// DOM/SVG semantics only. These checks are not native frame/visual evidence.
describe('narrow business treatment parts, without stages or source-selected geometry', () => {
  it('marks explicit evidence in text and preserves ordinary React escaping', () => {
    const html = renderToStaticMarkup(
      createElement(BusinessEvidenceNote, {
        evidence: {
          state: 'unknown',
          label: 'cash is unknown',
          source: { fromWord: 0, toWord: 2 },
        },
      }),
    );
    expect(html).toContain('data-evidence-state="unknown"');
    expect(html).toContain('Unknown: cash is unknown');
    expect(html).toContain('<desc>cash is unknown</desc>');
    const escaped = renderToStaticMarkup(
      createElement(BusinessEvidenceNote, {
        evidence: { state: 'illustrative', label: '<source>', source: { fromWord: 0, toWord: 0 } },
      }),
    );
    expect(escaped).toContain('&lt;source&gt;');
    expect(escaped).not.toContain('<source>');
  });
  it('has no acceptance segment for pending or denied authority even with a wrong extra progress', () => {
    for (const state of ['pending', 'denied'] as const) {
      const html = renderToStaticMarkup(
        createElement(AuthorityHandshakeRail, {
          label: 'Review',
          state,
          approach: 1,
          accepted: 1,
        }),
      );
      expect(html).toContain(`data-authority-state="${state}"`);
      expect(html).toContain('M522 230H522');
      expect(html).toContain(`Review: ${state}`);
      expect(html).not.toContain('canvas');
    }
  });
  it('keeps unknown tiers unfilled and labelled rather than inventing a proportion', () => {
    const html = renderToStaticMarkup(
      createElement(PriorityTrayMark, {
        tier: { id: 'first', amount: null, ceiling: null },
        index: 0,
        label: 'Priority one',
        fill: 1,
        opacity: 1,
      }),
    );
    expect(html).toContain('Not stated');
    expect(html).toContain('data-tier-id="first"');
    expect(html.match(/<rect/g)).toHaveLength(1);
    expect(html).not.toContain('canvas');
  });
  it('distinguishes plan and observation with text and a stroke pattern', () => {
    const plan = renderToStaticMarkup(
      createElement(ObservationMark, {
        label: 'October tasks',
        observed: false,
        opacity: 1,
      }),
    );
    const observed = renderToStaticMarkup(
      createElement(ObservationMark, {
        label: 'October tasks',
        observed: true,
        opacity: 1,
      }),
    );
    expect(plan).toContain('Planned: October tasks');
    expect(plan).toContain('stroke-dasharray="10 8"');
    expect(observed).toContain('Observed: October tasks');
    expect(observed).not.toContain('stroke-dasharray');
  });
});
