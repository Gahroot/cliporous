/** Count readable words and numbers, not separator glyphs. Joined arrows/slashes cannot hide words. */
export function businessReadingWords(text: string): number {
  const separated = text.replace(
    /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu,
    ' $& ',
  );
  return separated.match(/\p{L}+(?:['’]\p{L}+)*|\p{N}+(?:[.,]\p{N}+)*/gu)?.length ?? 0;
}
