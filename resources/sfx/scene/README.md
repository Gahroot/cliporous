# Scene SFX (explainer scenes)

Soft, low, physical cue sounds mixed under the voice by
`src/main/render/scene-sfx.ts`. One or more files per `SceneCueKind`
(`src/main/remotion/compositions/explainer/types.ts`); repeated cues rotate
through the numbered variants. No dings, chimes, coins or meme sounds.

Packaged automatically: `package.json` → `build.extraResources` copies
`resources/sfx/**/*` to `<resources>/sfx`, so these land in `<resources>/sfx/scene`.

## Files

Sources were fetched from the MIT-licensed repo
[kapishdima/soundcn](https://github.com/kapishdima/soundcn) (`assets/kenney_*/…ogg`);
each file's registry entry (`public/r/<name>.json`) lists
`author: "Kenney <https://kenney.nl>"` and `meta.license: "CC0"`. Kenney packs are
released under [CC0 1.0](http://creativecommons.org/publicdomain/zero/1.0/)
(attribution not required; credited here anyway). Nothing from the repo's `wow/`
folder (World of Warcraft) was used.

| File | Cue | Source | Author | Licence | Centroid | Duration | Loudness |
|---|---|---|---|---|---|---|---|
| `tick-1.mp3` | tick | soundcn `assets/kenney_casino-audio/card-place-1.ogg` (Casino Audio) | Kenney | CC0 1.0 | 2961 Hz | 0.611 s | -25.1 LUFS |
| `tick-2.mp3` | tick | soundcn `assets/kenney_casino-audio/card-place-2.ogg` (Casino Audio) | Kenney | CC0 1.0 | 2900 Hz | 0.413 s | -23.5 LUFS |
| `tick-3.mp3` | tick | soundcn `assets/kenney_casino-audio/card-place-3.ogg` (Casino Audio) | Kenney | CC0 1.0 | 2779 Hz | 0.777 s | -24.1 LUFS |
| `tick-4.mp3` | tick | soundcn `assets/kenney_casino-audio/card-place-4.ogg` (Casino Audio) | Kenney | CC0 1.0 | 2591 Hz | 0.600 s | -21.5 LUFS |
| `slide-1.mp3` | slide | soundcn `assets/kenney_casino-audio/card-slide-1.ogg` (Casino Audio) | Kenney | CC0 1.0 | 2231 Hz | 0.503 s | -22.9 LUFS |
| `slide-2.mp3` | slide | soundcn `assets/kenney_casino-audio/card-slide-3.ogg` (Casino Audio) | Kenney | CC0 1.0 | 2740 Hz | 0.595 s | -22.8 LUFS |
| `slide-3.mp3` | slide | soundcn `assets/kenney_casino-audio/card-slide-5.ogg` (Casino Audio) | Kenney | CC0 1.0 | 2973 Hz | 0.596 s | -23.7 LUFS |
| `thump-1.mp3` | thump | soundcn `assets/kenney_impact-sounds/impactSoft_heavy_000.ogg` (Impact Sounds) | Kenney | CC0 1.0 | 139 Hz | 0.527 s | -20.4 LUFS |
| `thump-2.mp3` | thump | soundcn `assets/kenney_impact-sounds/impactSoft_heavy_002.ogg` (Impact Sounds) | Kenney | CC0 1.0 | 129 Hz | 0.569 s | -20.5 LUFS |
| `thump-3.mp3` | thump | soundcn `assets/kenney_impact-sounds/impactSoft_heavy_003.ogg` (Impact Sounds) | Kenney | CC0 1.0 | 109 Hz | 0.541 s | -20.4 LUFS |
| `pop-1.mp3` | pop | soundcn `assets/kenney_impact-sounds/impactGeneric_light_001.ogg` (Impact Sounds) | Kenney | CC0 1.0 | 780 Hz | 0.115 s | -24.7 LUFS |
| `pop-2.mp3` | pop | soundcn `assets/kenney_impact-sounds/impactGeneric_light_003.ogg` (Impact Sounds) | Kenney | CC0 1.0 | 834 Hz | 0.135 s | -24.4 LUFS |
| `flip-1.mp3` | flip | soundcn `assets/kenney_rpg-audio/bookFlip1.ogg` (RPG Audio) | Kenney | CC0 1.0 | 2636 Hz | 0.694 s | -26.0 LUFS |
| `flip-2.mp3` | flip | soundcn `assets/kenney_rpg-audio/bookFlip2.ogg` (RPG Audio) | Kenney | CC0 1.0 | 2909 Hz | 0.420 s | -26.2 LUFS |
| `whoosh-1.mp3` | whoosh | `resources/sfx/swipe-transition.mp3` (softened) | BatchClip (procedural FFmpeg synthesis) | original work, CC0-equivalent (see `../README.md`) | 2514 Hz | 0.391 s | -20.4 LUFS |
| `rise-1.mp3` | rise | `resources/sfx/rise-tension-short.mp3` (softened) | BatchClip (procedural FFmpeg synthesis) | original work, CC0-equivalent (see `../README.md`) | 2112 Hz | 0.577 s | -20.4 LUFS |

Centroid = energy-weighted mean of FFmpeg `aspectralstats` centroid over frames
within 30 dB of the loudest frame (mono downmix). All files are ≤ 3.5 kHz
(acceptance limit). All are noise/impact sounds except `rise-1`, which keeps
the source's low swept-tone component (spectral crest ≈ 200) — a slow riser,
not a chime. Loudness = EBU R128 integrated, measured with
3 s of silence padding.

## Processing

Every file went through the bundled `ffmpeg-static` (6.0):

1. mono → stereo, trim leading silence (`silenceremove`, -50 dB),
2. lowpass: tick/slide 4 kHz, flip 3.5 kHz ×2 (4-pole), whoosh 4.5 kHz,
   rise 3.5 kHz, thump/pop 6 kHz,
3. trim to ≤ 1.5 s (rise ≤ 1.2 s), linear fade-out over the last 35 % (≤ 0.25 s),
4. two-pass linear loudness match to -20 LUFS with a -1.5 dBTP ceiling; a
   gentle `alimiter` may shave up to 6 dB of transient peak. Very short
   transients (card, page, pop) hit that cap and sit a few LU under -20 — their
   integrated reading is also diluted by the 400 ms gating window, so they are
   perceptually close,
5. 48 kHz, MP3 128 kbps CBR.

## Rejected candidates

- `card-slide-2/4/6/7/8`, `card-shove-*`, `card-fan-1`: brighter than the kept slides.
- `bookFlip3`: very crisp/short.
- Kenney Interface `drop_00x`: tonal pitch-swept "bloop" (bubbly).
- Kenney Interface `tick_00x`, `scroll_001`: centroid ≈ 10–11 kHz (clicky).
- `resources/sfx/word-pop.mp3`: a pure ~1.4 kHz sine burst (beep-like).
- Anything under soundcn `assets/wow/` (World of Warcraft — not licensed for reuse).
