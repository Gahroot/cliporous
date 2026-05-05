/**
 * Image generation cache — stub
 *
 * Not yet implemented. Callers handle errors gracefully.
 */

import type { FalAspectRatio, FalImageResult } from './fal-image'

export async function generateAndCacheImage(
  _prompt: string,
  _aspectRatio: FalAspectRatio,
  _apiKey: string
): Promise<FalImageResult> {
  throw new Error('Image caching is not yet implemented')
}
