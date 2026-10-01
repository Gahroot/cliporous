import type { WordTimestamp } from '@shared/types';

// Selected scene tracks stay small even if a saved transcript contains oversized word text.
const MAX_VTT_CHARACTERS = 64 * 1024;
const MAX_WORD_CHARACTERS = 1024;

function timestamp(milliseconds: number): string {
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor(milliseconds / 60_000) % 60;
  const seconds = Math.floor(milliseconds / 1000) % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(milliseconds % 1000).padStart(3, '0')}`;
}

/** A bounded, inert native caption track on the original source's absolute media clock. */
export function buildSourceCaptionTrack(
  words: readonly WordTimestamp[],
  start: number,
  end: number,
): string {
  let vtt = 'WEBVTT\n\n';
  if (Number.isFinite(start) && Number.isFinite(end) && start >= 0 && end > start) {
    for (const word of words) {
      if (!Number.isFinite(word.start) || !Number.isFinite(word.end)) continue;
      // Round inward so millisecond cue precision never escapes the selected source window.
      const from = Math.ceil(Math.max(start, word.start) * 1000);
      const to = Math.floor(Math.min(end, word.end) * 1000);
      if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || to <= from) continue;
      const text = Array.from(word.text.slice(0, MAX_WORD_CHARACTERS), (character) => {
        const code = character.charCodeAt(0);
        return code < 32 || code === 127 ? ' ' : character;
      })
        .join('')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      if (!text) continue;
      const cue = `${timestamp(from)} --> ${timestamp(to)}\n${text}\n\n`;
      if (vtt.length + cue.length > MAX_VTT_CHARACTERS) break;
      vtt += cue;
    }
  }
  // TextEncoder replaces malformed/truncated surrogate pairs before URI encoding.
  const wellFormed = new TextDecoder().decode(new TextEncoder().encode(vtt));
  return `data:text/vtt;charset=utf-8,${encodeURIComponent(wellFormed)}`;
}
