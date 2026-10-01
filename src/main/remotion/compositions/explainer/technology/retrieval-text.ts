import type { RetrievalGroundingPose } from './retrieval-grounding';

export const RETRIEVAL_TYPE = {
  sourceSize: 24,
  sourceLineHeight: 26,
  excerptSize: 26,
  excerptLineHeight: 28,
  height: 168,
  gap: 4,
  width: 308,
} as const;

// Rounded-up hmtx advances / 1000em from resources/fonts/Inter-Bold.ttf (ASCII 32..126).
// Both labels use Inter 700, with kerning/ligatures disabled; no browser measurement or canvas.
const ADVANCES = [
  237, 338, 552, 649, 655, 1016, 672, 339, 377, 377, 560, 679, 334, 468, 334, 389, 675, 432, 630,
  646, 677, 623, 650, 582, 651, 650, 334, 343, 679, 679, 679, 560, 1017, 747, 662, 740, 723, 608,
  587, 751, 748, 281, 585, 720, 566, 932, 763, 771, 648, 777, 657, 655, 668, 732, 747, 1038, 739,
  731, 665, 377, 389, 377, 487, 477, 366, 581, 631, 589, 631, 596, 398, 632, 623, 271, 271, 581,
  271, 913, 623, 614, 631, 631, 408, 561, 367, 623, 600, 851, 581, 603, 573, 469, 372, 469, 679,
];

export function retrievalTextWidth(text: string, size: number): number {
  return Array.from(text.normalize('NFD')).reduce((width, char) => {
    if (/\p{Mark}/u.test(char)) return width;
    const codePoint = char.codePointAt(0) ?? 32;
    const advance = ADVANCES[codePoint - 32] ?? 1050;
    return width + (advance / 1000 + 0.008) * size;
  }, 0);
}

/** Keep every source character. Prefer word breaks, but hard-wrap long tokens/packed worst cases. */
function wrap(text: string, size: number, maxLines: number): string[] {
  const split = (preferWords: boolean): string[] => {
    const lines: string[] = [];
    let line = '';
    for (const char of Array.from(text)) {
      if (line && retrievalTextWidth(line + char, size) > RETRIEVAL_TYPE.width) {
        const space = preferWords ? line.lastIndexOf(' ') : -1;
        if (space >= 0) {
          lines.push(line.slice(0, space + 1));
          line = line.slice(space + 1);
        } else {
          lines.push(line);
          line = '';
        }
        // The remaining word may itself occupy a full line.
        if (line && retrievalTextWidth(line + char, size) > RETRIEVAL_TYPE.width) {
          lines.push(line);
          line = '';
        }
      }
      line += char;
    }
    if (line) lines.push(line);
    return lines;
  };
  const words = split(true);
  return words.length <= maxLines ? words : split(false);
}

export function retrievalSlipText(
  label: string,
  excerpt: string,
  reference: number,
): {
  sourceLines: string[];
  excerptLines: string[];
  excerptSize: number;
  excerptLineHeight: number;
  height: number;
} {
  const sourceLines = wrap(`[${reference}] ${label}`, RETRIEVAL_TYPE.sourceSize, 2);
  const sourceHeight = sourceLines.length * RETRIEVAL_TYPE.sourceLineHeight + RETRIEVAL_TYPE.gap;
  // Short excerpts use the available paper area; dense copy retains the readable
  // minimum. This source-dependent choice stays constant throughout the scene.
  for (const excerptSize of [34, 32, 30, 28, RETRIEVAL_TYPE.excerptSize]) {
    const excerptLineHeight = excerptSize + 2;
    const maxLines = Math.floor((RETRIEVAL_TYPE.height - sourceHeight) / excerptLineHeight);
    const excerptLines = wrap(excerpt, excerptSize, maxLines);
    const height = sourceHeight + excerptLines.length * excerptLineHeight;
    if (height <= RETRIEVAL_TYPE.height || excerptSize === RETRIEVAL_TYPE.excerptSize) {
      return { sourceLines, excerptLines, excerptSize, excerptLineHeight, height };
    }
  }
  throw new Error('The minimum excerpt size must always be selected');
}

export function retrievalLibraryCaption(pose: RetrievalGroundingPose): string {
  if (pose.noMatch) return 'No match';
  const selected = pose.slips.filter((slip) => slip.selected).length;
  if (selected === 2) return 'Two excerpts selected';
  if (selected === 1) return 'Excerpt selected';
  return pose.searchProgress > 0 ? 'Searching documents' : 'Source documents';
}
