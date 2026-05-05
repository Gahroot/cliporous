/**
 * fal.ai image generation — stub
 *
 * The fal.ai integration is not yet implemented. These stubs satisfy the
 * imports in ai-handlers.ts so the build passes. The renderer-side callers
 * already catch errors gracefully and fall back to non-image layouts.
 */

export type FalAspectRatio = '1:1' | '9:16' | '16:9' | '4:3' | '3:4'

export interface FalImageResult {
  url: string
  width: number
  height: number
}

export async function generateSegmentImage(
  _prompt: string,
  _aspectRatio: FalAspectRatio,
  _apiKey: string
): Promise<FalImageResult> {
  throw new Error('fal.ai image generation is not yet implemented')
}
