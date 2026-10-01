import { describe, expect, it } from 'vitest';
import { isYouTubeUrl } from '../entry-source';

describe('YouTube entry hint', () => {
  it.each([
    'https://www.youtube.com/watch?v=example',
    'https://youtu.be/example',
    'https://m.youtube.com/shorts/example',
    'https://youtube.com/v/example',
  ])('keeps supported host forms available for main-process validation: %s', (value) => {
    expect(isYouTubeUrl(value)).toBe(true);
  });

  it.each([
    'https://youtube.com.example.invalid/watch?v=example',
    'https://foo.youtube.com/watch?v=example',
    'https://music.youtube.com/watch?v=example',
    'https://youtube.com@example.invalid/watch?v=example',
    'javascript:alert(1)',
    'file:///video.mp4',
    'https://demo:fixture-only@youtube.com/watch?v=example',
    'https://demo@youtu.be/example',
  ])('rejects non-video origins, non-web schemes and embedded credentials: %s', (value) => {
    expect(isYouTubeUrl(value)).toBe(false);
  });
});
