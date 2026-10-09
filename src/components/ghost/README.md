# Ghost mascot

The animated Ghotly AI ghost (sunglasses, arms crossed): the front arm visibly swings open and snaps back
across the chest ("folds its arms") every few seconds, plus float / breathe / tilt and a soft neon glow.
Pure CSS keyframes - **no framer-motion, no JS per frame** - and self-contained, so the three things below
can be copied verbatim to another project.

```
src/components/ghost/GhostMascot.tsx     component (+ GhostLogo)
src/components/ghost/ghost-mascot.css    keyframes / layout (plain CSS, imported by the component)
src/assets/ghost/                        artwork (ES-imported, see "Assets")
```

## Usage

```tsx
import { GhostMascot, GhostLogo } from "../components/ghost/GhostMascot";   // adjust the relative path

<GhostMascot size={96} variant="hello" />                       // pop-in, then periodically swings an arm
                                                                  // open and crosses it back with a bounce
<GhostMascot size={64} />                                       // idle (default): gentle arm sway
<GhostMascot size={28} variant="calm" />                        // float only, arm at rest (also forced for size <= 40)
<GhostMascot size={120} animated={false} />                     // still logo, same framing
<GhostMascot size={72} onClick={openHelp} title="Need help?" /> // becomes a keyboard-accessible button
<GhostLogo size={20} />                                         // plain <img>, crisp hand-tuned frame for tiny sizes
```

| prop | type | default | notes |
|---|---|---|---|
| `size` | `number` | `64` | CSS px of the (square) box. `<= 40` always renders the `calm` variant |
| `variant` | `"idle" \| "hello" \| "calm"` | `"idle"` | see below |
| `animated` | `boolean` | `true` | `false` = still logo, no extra assets loaded |
| `blink` | `boolean` | - | accepted but unused - the shades cover the eyes, kept only so old call sites still compile |
| `className`, `style`, `title` | | | `style` may override the CSS custom properties below |
| `onClick` | `(e) => void` | - | adds `role="button"`, `tabIndex`, Enter/Space, pointer cursor, press feedback |
| `alt` / `aria-label` | `string` | `"Ghotly AI ghost"` | `alt=""` marks it decorative (`aria-hidden`) |

**Variants**

| | motion | layers used |
|---|---|---|
| `idle` | float +-5 px (4 s), squash/stretch breathing, tilt, glow pulse, slow arm sway (0 to -6deg) | base, arm, glow |
| `hello` | `idle` + pop-in with spring overshoot, then every 7.2 s the arm swings open to -22deg and snaps back across the chest with a small overshoot (+4deg) and a little body nod | same |
| `calm` | float only, arm stays at rest (use for small sizes and where CPU matters, e.g. the in-interview overlay) | the plain still frame, no layer assets loaded at all |

Hover (idle/hello, devices with hover): the arm flaps and the body gives a little bounce.
`prefers-reduced-motion`: clean still frame (zero running animations).
While `document.hidden` every mascot is paused by **one** shared `visibilitychange` listener (it toggles `html.gm-paused`).
Per-instance randomness (phase offsets, so instances don't all animate in lockstep) is derived from `useId()`
and applied through CSS custom properties.
If an animation asset fails to load the component silently falls back to the still logo.

CSS custom properties (set through `style`): `--gm-size`, `--gm-float` (float amplitude), `--gm-d-*` (phase offsets).

## How it works (so you can edit it)

Two raster layers share one 1024 px canvas, positioned with percentages so any `size` works:

* `base.webp` - the whole ghost (head, shades, the hem, **and the back arm**) with the front arm's own hole
  inpainted shut (OpenCV Telea inpainting - the chest fabric is smooth/gradient, which it reads perfectly).
  `base + arm, both at rest` reproduces the original artwork exactly.
* `arm.webp` - just the front arm/sleeve (the one drawn on top at the crossing, so it's never occluded),
  cut out with a hand-traced **ribbon**: the sleeve's top edge is a clear, followable outline from shoulder to
  hand, offset downward by a tapering width - its true *lower* edge has no outline at all (same fabric as the
  torso below it), so this was the only reliable way to isolate it. It's animated with a plain CSS
  `transform: rotate()` around `transform-origin` (the shoulder) - a rigid "paper doll" cutout joint, not a
  pre-rendered pose sprite strip. That's what makes the arm visibly swing rather than just sit crossed.
* `glow.webp` - blurred, cool-white rim halo (inset -13.96%, alpha 0 at its border). Do not put the mascot
  inside an `overflow: hidden` parent if you want the glow.

**Why this image needed a hand-traced cut, not an automatic one:** the art's black outline is pixel-identical
to, and directly touches, the true black background at the silhouette edge, and the sunglasses' temple arms
genuinely reach the edge of the head (by design - a wide "cool shades" look). Both defeat naive
flood-fill/threshold matting (confirmed with a morphological-opening radius sweep: nothing between "still
fused to the background" and "thin parts of the art erode away" worked) - see
`scratchpad/pw/agent-mascot2/0{1,3,4}_*.py` in the session that built this for the full trail, including the
per-row white-to-white-span trick that finally separated the sunglasses from the background in the static
matte.

**Regenerating this rig after an art change** (steps, scripts in `scratchpad/pw/agent-mascot2/`):
1. `01_matte.py` - flood-fill-from-border background removal + vector-smoothed edge. If the new art's outline
   also touches the background, you'll likely need the same per-row white-span patch (search `FACE_Y0` in that
   file) for whatever region has the same problem.
2. Trace the front arm's cutout: `03_arm_cut.py` (flood-fill attempt, documents why it leaks for this art) /
   `04_arm_ribbon.py` (the hand-traced ribbon that actually worked - edit `TOP_PTS`/`WIDTHS` and re-run; check
   `evidence/ribbon_proof.png`).
3. `05_split.py` - extracts the arm layer and `cv2.inpaint()`s the base's hole shut; check
   `evidence/split_recombined_check*.png` is pixel-identical to the source art (base + arm, recombined at
   their original position, composited over the matte) before trusting anything downstream.
4. `06_master.py` - places everything on the shared square canvas and computes the arm's bounding box +
   rotation pivot as percentages (prints `work/layout.json`) - copy `arm_box_pct` / `pivot_in_arm_pct` into
   `ghost-mascot.css`'s `.gm-arm` rule (`left/top/width/height` and `transform-origin`).
5. `07_layers.py` - final `base.png` / `arm.png` / `glow.png`, then convert to lossless WebP.
6. `08_icons.py` - the static icon set (`ghost-16..1024.png`, `.ico`, tray data-URLs) from the recombined
   (arm-at-rest) master.
7. Sanity-check the new angles before shipping: `frame_sheet2.mjs` renders the arm at fixed angles (it
   **cancels** the running CSS animation first, not just pauses it - a paused animation still controls the
   property and silently ignores an inline style override) so you can eyeball the widest pose for distortion.
   The keyframe's peak angle in `ghost-mascot.css` (`gm-arm-cross`, 72% keyframe) was dialled back from -34deg
   to -22deg for exactly this reason - a bigger swing looked rougher at the shoulder seam.

## Assets

| file | size | notes |
|---|---|---|
| `src/assets/ghost/ghost-{16,24,32,48,64,128,256,512,1024}.png` | - | pre-scaled still frames, arm at rest (`GhostLogo` / non-animated use) |
| `src/assets/ghost/ghost.ico` | - | Windows multi-size icon (16-256) |
| `src/assets/ghost/anim/base.webp` | ~220 KB | the whole ghost, front-arm hole inpainted |
| `src/assets/ghost/anim/arm.webp` | ~35 KB | the front arm/sleeve cutout |
| `src/assets/ghost/anim/glow.webp` | ~45 KB | rim halo |
