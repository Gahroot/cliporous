/**
 * Synthetic fixture speech lives inside the production planner's lead-in/tail.
 * The fixture duration is the whole authored window, not the spoken span.
 * Keep padding equal to EXPLAINER_LIMITS (asserted by concept-library.test.ts).
 */
export const CONCEPT_FIXTURE_PADDING = { leadInSec: 0.25, tailSec: 0.35 } as const;

export function conceptFixtureWords(
  sourceText: string,
  durationSec: number,
): { text: string; start: number; end: number }[] {
  if (!Number.isFinite(durationSec) || durationSec < 5 || durationSec > 12) {
    throw new Error('Concept fixture duration must be between 5 and 12 seconds.');
  }
  const tokens = sourceText.trim().split(/\s+/);
  if (!sourceText.trim() || tokens.length > 1000) {
    throw new Error('Concept fixtures require 1 to 1000 source words.');
  }
  const { leadInSec, tailSec } = CONCEPT_FIXTURE_PADDING;
  const spokenSec = durationSec - leadInSec - tailSec;
  const at = (index: number): number =>
    Number((leadInSec + (index * spokenSec) / tokens.length).toFixed(9));
  return tokens.map((text, index) => ({ text, start: at(index), end: at(index + 1) }));
}
