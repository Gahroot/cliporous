import { describe, expect, it } from 'vitest';
import { buildSourceCaptionTrack } from '@/lib/source-caption-track';

const PREFIX = 'data:text/vtt;charset=utf-8,';
function decodeTrack(src: string): string {
  expect(src.startsWith(PREFIX)).toBe(true);
  return decodeURIComponent(src.slice(PREFIX.length));
}

describe('buildSourceCaptionTrack', () => {
  it('uses absolute source timestamps, clips both boundaries and omits words outside the window', () => {
    const words = Object.freeze([
      { text: 'before', start: 1, end: 3.75 },
      { text: 'first', start: 3, end: 4.2 },
      { text: 'middle', start: 4.5, end: 5.5 },
      { text: 'last', start: 6, end: 7 },
      { text: 'after', start: 6.55, end: 8 },
    ]);
    expect(decodeTrack(buildSourceCaptionTrack(words, 3.75, 6.55))).toBe(
      'WEBVTT\n\n00:00:03.750 --> 00:00:04.200\nfirst\n\n00:00:04.500 --> 00:00:05.500\nmiddle\n\n00:00:06.000 --> 00:00:06.550\nlast\n\n',
    );
    expect(words[1]?.start).toBe(3);
    expect(words[3]?.end).toBe(7);
  });

  it('rounds inward to milliseconds and formats hour/minute boundaries without rebasing', () => {
    const words = [{ text: 'later', start: 3599, end: 3663 }];
    expect(decodeTrack(buildSourceCaptionTrack(words, 3599.7501, 3662.5559))).toBe(
      'WEBVTT\n\n00:59:59.751 --> 01:01:02.555\nlater\n\n',
    );
  });

  it('escapes VTT markup/entities and flattens newlines so transcript text cannot inject cues or tags', () => {
    const text =
      '<v speaker>A&B</v>\r\n\r\n00:00:00.000 --> 00:59:59.000\n<b>fake</b>\u0000\tend\u2028done';
    const vtt = decodeTrack(buildSourceCaptionTrack([{ text, start: 4, end: 5 }], 3.75, 6.55));
    expect(vtt).toBe(
      'WEBVTT\n\n00:00:04.000 --> 00:00:05.000\n&lt;v speaker&gt;A&amp;B&lt;/v&gt; 00:00:00.000 --&gt; 00:59:59.000 &lt;b&gt;fake&lt;/b&gt; end done\n\n',
    );
    expect(vtt.match(/ --> /g)).toHaveLength(1);
    expect(vtt).not.toContain('<');
    expect(vtt).not.toContain('\r');
  });

  it('omits empty, invalid and zero-duration words rather than inventing timing', () => {
    const words = [
      { text: ' ', start: 4, end: 5 },
      { text: 'zero', start: 4, end: 4 },
      { text: 'reverse', start: 5, end: 4 },
      { text: 'invalid', start: Number.NaN, end: 5 },
      { text: 'infinite', start: 4, end: Number.POSITIVE_INFINITY },
      { text: 'negative infinity', start: Number.NEGATIVE_INFINITY, end: 5 },
    ];
    expect(decodeTrack(buildSourceCaptionTrack(words, 3.75, 6.55))).toBe('WEBVTT\n\n');
    expect(decodeTrack(buildSourceCaptionTrack([], 3.75, 6.55))).toBe('WEBVTT\n\n');
  });

  it.each([
    [5, 4],
    [4, 4],
    [-1, 4],
    [Number.NaN, 4],
    [0, Number.POSITIVE_INFINITY],
  ])('emits no cues for invalid scene bounds %s to %s', (start, end) => {
    expect(
      decodeTrack(buildSourceCaptionTrack([{ text: 'word', start: 1, end: 8 }], start, end)),
    ).toBe('WEBVTT\n\n');
  });

  it('bounds the inline track and individual payloads without emitting partial cues', () => {
    const words = Array.from({ length: 200 }, () => ({ text: 'x'.repeat(2000), start: 4, end: 5 }));
    const vtt = decodeTrack(buildSourceCaptionTrack(words, 3.75, 6.55));
    expect(vtt.length).toBeLessThanOrEqual(64 * 1024);
    const cues = vtt.slice('WEBVTT\n\n'.length).trimEnd().split('\n\n');
    expect(cues.length).toBeGreaterThan(1);
    expect(cues.length).toBeLessThan(words.length);
    for (const cue of cues) expect(cue).toBe(`00:00:04.000 --> 00:00:05.000\n${'x'.repeat(1024)}`);
    expect(vtt.endsWith('\n\n')).toBe(true);
  });

  it('retains Unicode and safely replaces malformed or truncated surrogate pairs', () => {
    const words = [
      { text: 'café 🎬 \uD800', start: 4, end: 5 },
      { text: `${'x'.repeat(1023)}🎬`, start: 5, end: 6 },
    ];
    const vtt = decodeTrack(buildSourceCaptionTrack(words, 3.75, 6.55));
    expect(vtt).toContain('café 🎬 �');
    expect(vtt).toContain(`${'x'.repeat(1023)}�\n\n`);
  });
});
