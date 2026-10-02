/** Conservative authored advances, independent of DOM measurement, platform and seek order. */
export function textAdvance(text: string, size: number, mono = false): number {
  return Array.from(text).reduce((sum, c) => {
    const em = mono
      ? 0.61
      : /[\s.,:;!|'`ilI]/u.test(c)
        ? 0.32
        : /[MW@%]/u.test(c)
          ? 1
          : /[A-Z]/u.test(c)
            ? 0.76
            : /[^\x00-\x7f]/u.test(c)
              ? 1
              : 0.63;
    return sum + em * size;
  }, 0);
}

/** Wrap without ellipses or discarded facts, including a single overlong word. */
export function wrapBoardText(text: string, size: number, width?: number, mono = false): string[] {
  if (width === undefined) return text.split('\n');
  if (!Number.isFinite(width) || width < size)
    throw new Error('Storyboard text width must fit at least one glyph');
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/u).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (textAdvance(candidate, size, mono) <= width) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      line = '';
      for (const char of Array.from(word)) {
        if (line && textAdvance(line + char, size, mono) > width) {
          lines.push(line);
          line = '';
        }
        line += char;
      }
    }
    lines.push(line);
  }
  return lines;
}

/** Quantity has no authored start value: reveal the exact fact, not an invented count from zero. */
export function counterText(value: number, unit: string): string {
  if (!Number.isFinite(value)) throw new Error('Storyboard counter requires a finite source value');
  return `${Object.is(value, -0) ? '0' : String(value)}${unit ? ` ${unit}` : ''}`;
}
