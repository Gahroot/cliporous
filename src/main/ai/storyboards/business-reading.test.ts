import { describe, expect, it } from 'vitest';
import { businessReadingWords } from './business-reading';

describe('native business reading clock tokens', () => {
  it.each([
    ['Mira → Dex', 2],
    ['Mira→Dex', 2],
    ['Role/fact', 2],
    ['Role / fact', 2],
    ['USD · kit · June', 3],
    ['USD kit June', 3],
    ['12.50 USD; 40/100 shares (40%)', 6],
    ['Unknown; conditional; not observed', 4],
    ['公司需要人工审核', 8],
    ['', 0],
  ])('%s reserves %s actual word/number tokens', (text, count) => {
    expect(businessReadingWords(text)).toBe(count);
  });
});
