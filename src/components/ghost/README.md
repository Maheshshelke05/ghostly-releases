# Ghost mascot

The animated Ghotly AI ghost: blinking eyes, a pulsing smile, swaying arms, a friendly wave, float / breathe / tilt and a soft neon glow.
Pure CSS keyframes - **no framer-motion, no JS per frame** - and self-contained, so the three things below can be copied verbatim to the website.

```
src/components/ghost/GhostMascot.tsx     component (+ GhostLogo)
src/components/ghost/ghost-mascot.css    keyframes / layout (plain CSS, imported by the component)
src/assets/ghost/                        artwork (ES-imported, see "Assets")
```

## Usage

```tsx
import { GhostMascot, GhostLogo } from "../components/ghost/GhostMascot";   // adjust the relative path

<GhostMascot size={96} variant="hello" />                       // pop-in + friendly wave every ~6 s
<GhostMascot size={64} />                                       // idle (default)
<GhostMascot size={28} variant="calm" />                        // float + blink only (also forced for size <= 40)
<GhostMascot size={120} animated={false} />                     // still logo, same framing
<GhostMascot size={72} onClick={openHelp} title="Need help?" /> // becomes a keyboard-accessible button
<GhostLogo size={20} />                                         // plain <img>, crisp hand-tuned frame for tiny sizes
```

| prop | type | default | notes |
|---|---|---|---|
| `size` | `number` | `64` | CSS px of the (square) box. `<= 40` always renders the `calm` variant |
| `variant` | `"idle" \| "hello" \| "calm"` | `"idle"` | see below |
| `animated` | `boolean` | `true` | `false` = still logo, no extra assets loaded |
| `blink` | `boolean` | `true` | |
| `className`, `style`, `title` | | | `style` may override the CSS custom properties below |
| `onClick` | `(e) => void` | - | adds `role="button"`, `tabIndex`, Enter/Space, pointer cursor, press feedback |
| `alt` / `aria-label` | `string` | `"Ghotly AI ghost"` | `alt=""` marks it decorative (`aria-hidden`) |

**Variants**

| | motion | animated layers |
|---|---|---|
| `idle` | float +-5 px (4 s), squash/stretch breathing, tilt, glow pulse, blink (per-instance random 3-6 s rhythm, occasional double blink), smile pulse, slow anti-phase arm sway | wrapper, glow, 2 arms, eyes, mouth |
| `hello` | `idle` + pop-in with spring overshoot, then every 6.4 s a hop and a ~2 s wave of one arm (wave bends the arm smoothly) | same |
| `calm` | float + blink only (use for small sizes and where CPU matters, e.g. the in-interview overlay) | wrapper, eyes |

Hover (idle/hello, devices with hover): both arms flap, little bounce, bigger smile. `prefers-reduced-motion`: clean still frame (zero running animations).
While `document.hidden` every mascot is paused by **one** shared `visibilitychange` listener (it toggles `html.gm-paused`).
Per-instance randomness (blink rhythm, phases) is derived from `useId()` and applied through CSS custom properties.
If an animation asset fails to load the component silently falls back to the still logo.

CSS custom properties (set through `style`): `--gm-size`, `--gm-float` (float amplitude), `--gm-blink-dur` (13-17 s super-cycle),
`--gm-blink-delay`, `--gm-d-*` (phase offsets).

## How it works (so you can edit it)

All layers share one 512 px canvas and are placed with percentages, so any `size` works:

* `base.webp` - the ghost **without arms**: the two arm windows are cleared with an exact alpha partition of unity, so base + arm cell = the original pixels.
* `arm-l.webp / arm-r.webp` - 32-pose sprite strips (arm lift A = -6 ... 88 px of the 1060 canvas). Each pose is a smooth *bend warp* (vertical shear that grows toward the hand, anchored at the shoulder) of the original art, so rims, highlights and glow bend together: no seams, tears or double edges. `steps()` animation of `transform: translateX` picks the pose (compositor driven).
* `eyes.webp` - 5 cells: open (empty), three half-lid frames, closed. Lid colour is a Laplace (harmonic) extension of the surrounding face shading, so there is no visible patch; the closed eye is a tapered navy arc. A blink is ~170 ms.
* `mouth.webp` - patch of the original mouth; smile pulse is `scale` (>= 1, so it always covers the mouth underneath).
* `glow.webp` - blurred, rim-coloured halo (inset -12 %, alpha 0 at its border). Do not put the mascot inside an `overflow: hidden` parent if you want the glow.

Animated properties: `translate`, `rotate`, `scale`, `opacity`, `transform` only (verified `compositeFailed: 0` for all animations in a Chromium trace).
Each strip image has a 16 px transparent gutter per cell so mip/bilinear minification can never leak a neighbouring pose.

## Assets (`src/assets/ghost/`)

| file | size | purpose |
|---|---|---|
| `ghost.png` | 1024x1024 RGBA, ~710 KB | clean transparent master (matte on any background) |
| `ghost-512/256/128/64/48/32/24/16.png` | 220 / 68 / 22 / 7 / 5 / 2.5 / 1.5 / 0.8 KB | lanczos (premultiplied) icon set, small ones lightly sharpened |
| `ghost.ico` | 16-256 px, 168 KB | Windows multi-size icon |
| `tray-32.dataurl.txt`, `tray-16.dataurl.txt` | 3.4 / 1.1 KB | tray icon as PNG data URL for the Electron main process |
| `anim/base.webp` | 131 KB | armless body (lossless WebP) |
| `anim/arm-l.webp`, `anim/arm-r.webp` | 174 KB each | arm pose strips |
| `anim/eyes.webp` / `mouth.webp` / `glow.webp` | 21 / 8 / 26 KB | |

Animated variant total: **~535 KB** (lossless WebP; Chromium 120 / Electron 28 and every current browser). `GhostLogo` and the still frames use the PNGs.
Also created: `ghostly-desktop-app/build/icon.png` (512) + `build/icon.ico` (electron-builder default lookup).

Tray icon in the main process:

```ts
import trayDataUrl from "../src/assets/ghost/tray-32.dataurl.txt?raw";
const icon = nativeImage.createFromDataURL(trayDataUrl.trim());
```

## Copy to the website

```bash
# from the repo root (needs Vite + React >= 18; website is Vite + React 19)
mkdir -p Ghostlyai-main-website/src/components/ghost Ghostlyai-main-website/src/assets/ghost/anim
cp ghostly-desktop-app/src/components/ghost/{GhostMascot.tsx,ghost-mascot.css} Ghostlyai-main-website/src/components/ghost/
cp ghostly-desktop-app/src/assets/ghost/ghost-{16,24,32,48,64,128,256,512}.png Ghostlyai-main-website/src/assets/ghost/
cp ghostly-desktop-app/src/assets/ghost/anim/*.webp Ghostlyai-main-website/src/assets/ghost/anim/
```

The component only imports `./ghost-mascot.css` and `../../assets/ghost/...`, so keep that relative layout (or edit the 14 import lines).
Static icons for the site are already in `Ghostlyai-main-website/public/ghost/`:
`logo.png` (512), `favicon-16x16.png`, `favicon-32x32.png`, `favicon.ico` (16/32/48), `icon-192.png`, `icon-512.png`,
`apple-touch-icon.png` (180, on the cream page colour because iOS flattens alpha) and `favicon.svg` (embeds a 64 px PNG - fine for tab icons, soft above 64 px).

```html
<link rel="icon" href="/ghost/favicon.ico" sizes="any" />
<link rel="icon" type="image/png" sizes="32x32" href="/ghost/favicon-32x32.png" />
<link rel="icon" type="image/png" sizes="16x16" href="/ghost/favicon-16x16.png" />
<link rel="apple-touch-icon" href="/ghost/apple-touch-icon.png" />
```

## Known limitations

* Arm poses are discrete: in the slow idle range one step is 2 px of the 1060 source canvas = 0.45 css px at 240 px (0.9 px at 480 px; the fast wave range uses 4 px steps). A very large idle mascot (> ~400 px) can show faint "ticking" on the hand edge - bake more poses with the same recipe if you ever need that.
* Layers are resampled independently by the browser: at rest the rig differs from the flat logo by 0.3/255 on average (sub-pixel only on rim pixels).
* Each `idle`/`hello` instance costs ~1 % of one core on the main thread, `calm` ~0.25 % (measured in a Chromium trace: React's root `animationiteration` listener makes Chromium dispatch iteration events; no JS runs besides that). Compositor/GPU work is negligible, and hidden tabs cost 0.
* Individual transform properties (`translate`/`rotate`/`scale`) need Chromium >= 104, Safari >= 14.1, Firefox >= 72.
* Under `prefers-reduced-motion` the mascot is a still image by design (hover/click feedback included).
