// Synthetic transcript only: no recorded human, network asset, or model response is needed.
import type { PlannerWord } from '../../src/main/ai/explainer/kind-spec';

function sentence(text: string, start: number, step: number, spoken: number): PlannerWord[] {
  return text.split(' ').map((word, i) => ({
    text: word,
    start: Number((start + i * step).toFixed(3)),
    end: Number((start + i * step + spoken).toFixed(3)),
  }));
}

const bottleneck = sentence(
  'Orders pile up behind the approval gate until we open it and clear the waiting queue today',
  10,
  0.4,
  0.3,
);
const keystone = sentence(
  'Temporary supports hold blocks while we seat the wedges then the keystone locks the arch before we withdraw supports and it stands',
  17.1,
  0.3,
  0.25,
);
const offset = bottleneck.length;
export const words = [...bottleneck, ...keystone];
// Leave speaker-only room in the clip so the real planner's coverage budget accepts both scenes.
export const bounds = { minStart: 8, maxEnd: 60 };
export const rawPlan = {
  scenes: [
    {
      kind: 'bottleneck',
      layout: 'stack',
      startWord: 0,
      endWord: offset - 1,
      label: 'Approval gate',
      tokenCount: 6,
      feedWord: 0,
      queueWord: 3,
      openWord: 9,
      clearWord: 12,
    },
    {
      kind: 'keystone',
      layout: 'stack',
      startWord: offset,
      endWord: words.length - 1,
      label: 'Keystone locks the arch',
      supportsWord: offset,
      blocksWord: offset + 6,
      lockWord: offset + 12,
      withdrawWord: offset + 17,
      continues: true,
      transition: 'fade',
    },
  ],
};

export const syntheticFace = { x: 830, y: 240, width: 260, height: 260 };
export const fps = 30;
