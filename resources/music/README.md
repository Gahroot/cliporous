# Background Music Library

This directory contains royalty-free background music tracks used by the BatchContent Sound Design system.
Place the actual `.mp3` files here. The system gracefully skips any missing files.

## Style-Curated Tracks

Each style preset ships with a hand-picked music track that matches its creative personality.
When the user picks a style, the background music automatically changes to match.

| Filename                    | Style Preset    | Mood / Description                          | Recommended BPM | Duration   |
|-----------------------------|-----------------|---------------------------------------------|-----------------|------------|
| `cinematic-ambient.mp3`     | Film            | Atmospheric slow-burn orchestral pads       | 70–85           | 60–120 s   |
| `cinematic-noir.mp3`        | Film Noir       | Jazzy, smoky, mysterious piano + brush drums| 80–90           | 60–120 s   |
| `cinematic-golden.mp3`      | Film Golden Hour| Warm strings, hopeful, golden-hour vibes    | 85–95           | 60–120 s   |
| `high-energy-beats.mp3`     | Velocity        | Punchy electronic, driving, aggressive      | 140–150         | 30–90 s    |
| `high-energy-trap.mp3`      | Velocity Bold   | Dark 808s, trap hi-hats, menacing energy    | 130–145         | 30–90 s    |
| `gritty-lofi.mp3`           | Rebel           | Lo-fi with vinyl crackle, grungy bass       | 75–90           | 60–120 s   |
| `gritty-dark.mp3`           | Rebel Blackout  | Industrial, distorted, raw textures         | 85–100          | 60–120 s   |
| `synthwave-neon.mp3`        | Neon            | Retro 80s synthwave, bright arpeggios       | 110–125         | 60–120 s   |
| `synthwave-vapor.mp3`       | Neon Ice        | Vaporwave, dreamy slowed pads, lo-fi nostalgia| 80–95         | 60–120 s   |
| `impact-hype.mp3`           | Impact          | Hard-hitting hip-hop instrumental, chest-rattling| 90–110     | 30–90 s    |
| `corporate-upbeat.mp3`      | Growth / Prime  | Clean, professional, uplifting corporate    | 110–120         | 60–120 s   |
| `ember-warm.mp3`            | Ember           | Warm indie acoustic, soulful guitar         | 85–100          | 60–120 s   |
| `volt-electric.mp3`         | Volt            | Electro house, driving bassline, electrifying| 125–135        | 30–90 s    |
| `clarity-focus.mp3`         | Clarity         | Minimal piano + soft ambient pads, focused  | 70–85           | 60–120 s   |

## Legacy Generic Tracks

These original tracks remain for backward compatibility. They still work if selected manually.

| Filename                    | Description                                       | Recommended Duration | Style / BPM         |
|-----------------------------|---------------------------------------------------|----------------------|---------------------|
| `ambient-tech.mp3`          | Subtle techy / corporate background loop          | 30 – 120 s          | Electronic, 100 BPM |
| `ambient-motivational.mp3`  | Uplifting, inspiring background loop              | 30 – 120 s          | Upbeat, 120 BPM     |
| `ambient-chill.mp3`         | Relaxed, lo-fi style background loop              | 30 – 120 s          | Chill, 85 BPM       |

## Per-Shot Music Crossfading

When different shots within a clip use different style presets (and therefore different music
tracks), the sound design engine automatically creates smooth crossfades:

- Each track plays for the full clip duration but with an envelope that fades in/out at shot boundaries
- Crossfade duration: 0.5 seconds (overlapping region where both tracks play simultaneously)
- Speech ducking is applied independently to each active track
- The result sounds like a professional editor hand-mixed the transitions

## Licensing Requirements

All music files must be:
- **Royalty-free** with no attribution required, OR
- Licensed under Creative Commons CC0 (public domain), OR
- Purchased with a license that permits use in short-form video content (TikTok, Reels, YouTube Shorts)

### Recommended Free Sources

- [Pixabay Music](https://pixabay.com/music/) — royalty-free, no attribution needed
- [Free Music Archive](https://freemusicarchive.org) — filter by CC0 license
- [Incompetech (Kevin MacLeod)](https://incompetech.com) — CC BY 3.0 (attribution required)
- [Bensound](https://www.bensound.com) — free tier with attribution
- [Mixkit](https://mixkit.co/free-stock-music/) — completely free

### Track Sourcing Guide by Mood

| Mood           | Search Terms                                              |
|----------------|-----------------------------------------------------------|
| Cinematic      | "cinematic ambient", "film score pad", "orchestral drone" |
| Noir           | "jazz noir", "smoky lounge", "detective theme"            |
| High Energy    | "edm drop", "festival energy", "trap beat"                |
| Lo-Fi Gritty   | "lo-fi hip hop", "vinyl crackle beat", "dusty boom bap"   |
| Synthwave      | "retrowave", "80s synth", "outrun"                        |
| Corporate      | "corporate upbeat", "startup technology", "presentation"  |
| Acoustic Warm  | "indie acoustic", "folk guitar", "warm singer-songwriter" |

## Format Requirements

- **Format**: MP3 (preferred) or WAV
- **Sample rate**: 44100 Hz or 48000 Hz
- **Channels**: Stereo preferred
- **Bit rate**: 192 kbps minimum for MP3
- **Duration**: Minimum 30 seconds (tracks will loop if the clip is longer)

## Notes

- Tracks are looped automatically to match clip duration (up to 1000 loops)
- Background music volume defaults to 10–12% to avoid competing with the speaker's voice
- Volume is adjustable via the Settings panel (Music Volume slider)
- Speech ducking lowers music volume during speech, raises it during pauses
- Files are bundled with the packaged app via `extraResources` in `package.json`
- Missing files are silently skipped — the system degrades gracefully
