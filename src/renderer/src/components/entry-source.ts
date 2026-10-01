export interface EntrySource {
  kind: 'file' | 'url';
  value: string;
}

export function isYouTubeUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
    if (url.username || url.password) return false;
    // This is only an entry hint, not a download trust boundary. The main-process
    // validator owns video-ID formats (including legacy /v/ and query variants).
    const host = url.hostname;
    return (
      host === 'youtu.be' ||
      host === 'youtube.com' ||
      host === 'www.youtube.com' ||
      host === 'm.youtube.com'
    );
  } catch {
    return false;
  }
}
