import type { PlannerWord, Rec, SceneWindow } from '../../../../../ai/explainer/kind-spec';

/** Project-authored OP-10 source; original grant/completion contract, new M-09 presentation. */
export function approvalGateSourceFixture(visualMode: 'diagram' | 'hybrid'): {
  id: 'OP-10';
  fixtureId: string;
  raw: Rec;
  words: PlannerWord[];
  window: SceneWindow;
} {
  const clauses = [
    'Agent receives the monthly report. Approval workflow.',
    'Agent calls Report tool.',
    'Report tool returns a result. Agent checks the result. Result passes the check. Agent requests human approval.',
    'Human approves the task.',
    'Agent completes the monthly report.',
  ];
  const starts = [0.4, 2.4, 4.4, 7.7, 10.2];
  const words: PlannerWord[] = [],
    indices: number[] = [];
  for (const [beat, clause] of clauses.entries()) {
    indices.push(words.length);
    const tokens = clause.split(/\s+/u);
    for (const [offset, text] of tokens.entries()) {
      words.push({
        text,
        start: starts[beat] + (offset * 0.72) / tokens.length,
        end: starts[beat] + ((offset + 0.8) * 0.72) / tokens.length,
      });
    }
  }
  return {
    id: 'OP-10',
    fixtureId: `business-op-10-${visualMode}`,
    words,
    window: { startWord: 0, endWord: words.length - 1, startTime: 0, endTime: 11.7 },
    raw: {
      kind: 'agent-workflow',
      preset: 'approval-gate',
      visualMode,
      label: 'Approval workflow',
      subject: 'monthly report',
      toolLabel: 'Report tool',
      outcome: 'completes the monthly report',
      startWord: 0,
      endWord: words.length - 1,
      setupWord: indices[0],
      actionWord: indices[1],
      responseWord: indices[2],
      checkWord: indices[3],
      resolveWord: indices[4],
    },
  };
}
