/**
 * Webpack override for the Remotion bundle.
 *
 * The Remotion compositions render in their OWN webpack bundle — separate from
 * the electron-vite renderer build — so the Tailwind/PostCSS pass and the `@`
 * path alias that the renderer relies on do not exist here by default. Without
 * this override, shadcn/ui primitives (`@/components/ui/*`, `@/lib/utils`) used
 * by the skin×block compositions would fail to resolve and render unstyled.
 *
 * This override is shared by BOTH entry points so preview ≡ render:
 *   - `remotion.config.ts`  → Studio / `npx remotion preview`  (root = cwd)
 *   - `render.ts` bundle()  → headless `@remotion/renderer`    (root = app path)
 *
 * It is a FACTORY keyed on the project root rather than `__dirname`: render.ts
 * is bundled by electron-vite into `out/main`, so a `__dirname`-relative walk
 * would resolve to the wrong directory at runtime. Each caller passes the root
 * it already knows reliably.
 */
import { enableTailwind } from '@remotion/tailwind'
import type { WebpackOverrideFn } from '@remotion/bundler'
import path from 'path'

/**
 * Build a Remotion webpack override that enables Tailwind and resolves the
 * renderer's `@` / `@shared` aliases against `projectRoot`.
 */
export function createWebpackOverride(projectRoot: string): WebpackOverrideFn {
  return (currentConfig) => {
    const withTailwind = enableTailwind(currentConfig)

    return {
      ...withTailwind,
      resolve: {
        ...withTailwind.resolve,
        alias: {
          ...(withTailwind.resolve?.alias ?? {}),
          // shadcn imports `@/components/ui/*` + `@/lib/utils`; mirror the
          // renderer alias (`electron.vite.config.ts`) so they resolve here.
          '@': path.join(projectRoot, 'src', 'renderer', 'src'),
          '@shared': path.join(projectRoot, 'src', 'shared')
        }
      }
    }
  }
}
