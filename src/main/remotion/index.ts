/**
 * Remotion entry point — registers compositions for Studio preview AND the
 * headless renderer used by segment-render.ts.
 *
 * This file is loaded by both:
 *   - `npx remotion studio`              → interactive preview/iteration
 *   - `@remotion/renderer` (server-side) → bundled and rendered headlessly
 */
import { registerRoot } from 'remotion'
import { RemotionRoot } from './Root'

registerRoot(RemotionRoot)
