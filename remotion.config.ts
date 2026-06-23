import { Config } from '@remotion/cli/config'
import { createWebpackOverride } from './src/main/remotion/webpack-override'

// Studio + render entry. The compositions Root file is at:
//   src/main/remotion/Root.tsx
Config.setEntryPoint('./src/main/remotion/index.ts')

// Enable Tailwind + resolve the renderer's `@` alias inside the Remotion
// webpack bundle so shadcn/ui primitives render styled in Studio / preview.
// The CLI runs from the project root, so cwd is the correct alias root.
Config.overrideWebpackConfig(createWebpackOverride(process.cwd()))

// Use repo `resources/` as the public dir so compositions can resolve bundled
// fonts and other assets via staticFile('fonts/Geist-Bold.ttf').
Config.setPublicDir('./resources')

// We want clean MOV with alpha for compositing into FFmpeg. ProRes 4444 carries
// alpha; default is H.264 (no alpha).
Config.setVideoImageFormat('png')
Config.setCodec('prores')
Config.setProResProfile('4444')
