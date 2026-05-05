import { Config } from '@remotion/cli/config'

// Studio + render entry. The compositions Root file is at:
//   src/main/remotion/Root.tsx
Config.setEntryPoint('./src/main/remotion/index.ts')

// Use repo `resources/` as the public dir so compositions can resolve bundled
// fonts and other assets via staticFile('fonts/Geist-Bold.ttf').
Config.setPublicDir('./resources')

// We want clean MOV with alpha for compositing into FFmpeg. ProRes 4444 carries
// alpha; default is H.264 (no alpha).
Config.setVideoImageFormat('png')
Config.setCodec('prores')
Config.setProResProfile('4444')
