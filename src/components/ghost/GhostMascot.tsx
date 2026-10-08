/**
 * GhostMascot - the animated Ghotly AI ghost.
 *
 *   <GhostMascot size={96} variant="hello" />          // pop-in + friendly wave
 *   <GhostMascot size={64} />                          // idle: float, breathe, blink, smile, arm sway
 *   <GhostMascot size={28} variant="calm" />           // float + blink only (also forced for size <= 40)
 *   <GhostLogo size={20} />                            // plain static <img> for tiny / list usage
 *
 * Pure CSS animation (see ghost-mascot.css): transform / translate / rotate / scale / opacity only,
 * no framer-motion, no JS per frame. Self-contained: copy this file, ghost-mascot.css and the
 * assets/ghost folder to another Vite project and it works as-is (assets are ES-imported, so URLs
 * resolve under http dev, hashed production builds and file:// packaged apps alike).
 */
import {
  useEffect,
  useId,
  useMemo,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import "./ghost-mascot.css";

import ghost16 from "../../assets/ghost/ghost-16.png";
import ghost24 from "../../assets/ghost/ghost-24.png";
import ghost32 from "../../assets/ghost/ghost-32.png";
import ghost48 from "../../assets/ghost/ghost-48.png";
import ghost64 from "../../assets/ghost/ghost-64.png";
import ghost128 from "../../assets/ghost/ghost-128.png";
import ghost256 from "../../assets/ghost/ghost-256.png";
import ghost512 from "../../assets/ghost/ghost-512.png";
import animBase from "../../assets/ghost/anim/base.webp";
import animArmL from "../../assets/ghost/anim/arm-l.webp";
import animArmR from "../../assets/ghost/anim/arm-r.webp";
import animEyes from "../../assets/ghost/anim/eyes.webp";
import animMouth from "../../assets/ghost/anim/mouth.webp";
import animGlow from "../../assets/ghost/anim/glow.webp";

export type GhostVariant = "idle" | "hello" | "calm";

export interface GhostMascotProps {
  /** Rendered box in CSS px (the artwork is square). Default 64. Sizes <= 40 always use the calm rendering. */
  size?: number;
  /** idle = float + breathe + blink + smile + arm sway; hello = idle + pop-in + wave; calm = float + blink. */
  variant?: GhostVariant;
  /** false renders the still logo (no motion, no extra assets). Default true. */
  animated?: boolean;
  /** Blink the eyes (default true). */
  blink?: boolean;
  className?: string;
  style?: CSSProperties;
  title?: string;
  /** Makes the mascot a button (cursor, focus ring, Enter/Space). */
  onClick?: (e: MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>) => void;
  /** Accessible name. alt="" marks it decorative. */
  alt?: string;
  "aria-label"?: string;
}

const DEFAULT_ALT = "Ghotly AI ghost";
const CALM_MAX_SIZE = 40;
const GLOW_MIN_SIZE = 56;

/** Hand-tuned, pre-scaled still frames (the small ones are sharpened for crisp tiny icons). */
const STATIC_FRAMES: ReadonlyArray<readonly [number, string]> = [
  [16, ghost16],
  [24, ghost24],
  [32, ghost32],
  [48, ghost48],
  [64, ghost64],
  [128, ghost128],
  [256, ghost256],
  [512, ghost512],
];

/** Smallest still frame that covers `cssSize` at pixel density `dpr` (<= 8% down-scaling tolerated). */
function pickStatic(cssSize: number, dpr: number): string {
  const need = cssSize * dpr * 0.92;
  for (const [px, url] of STATIC_FRAMES) if (px >= need) return url;
  return ghost512;
}

/* ---------- pixel density: SSR/hydration safe (server snapshot = 2), follows zoom / monitor changes ---------- */
const dprListeners = new Set<() => void>();
let dprBound = false;
function subscribeDpr(cb: () => void) {
  if (typeof window === "undefined") return () => {};
  if (!dprBound) {
    dprBound = true;
    window.addEventListener("resize", () => dprListeners.forEach((f) => f()));
  }
  dprListeners.add(cb);
  return () => {
    dprListeners.delete(cb);
  };
}
const getDpr = () => Math.min(Math.max(typeof window !== "undefined" ? window.devicePixelRatio || 1 : 2, 1), 3);
const getServerDpr = () => 2;

/* ---------- one shared visibility listener: pauses every mascot while the page is hidden ---------- */
let visibilityBound = false;
function bindVisibilityOnce() {
  if (visibilityBound || typeof document === "undefined") return;
  visibilityBound = true;
  const apply = () => document.documentElement.classList.toggle("gm-paused", document.hidden);
  document.addEventListener("visibilitychange", apply);
  apply();
}

/* ---------- reduced motion ---------- */
const RM_QUERY = "(prefers-reduced-motion: reduce)";
function subscribeReducedMotion(cb: () => void) {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mq = window.matchMedia(RM_QUERY);
  mq.addEventListener ? mq.addEventListener("change", cb) : mq.addListener(cb);
  return () => (mq.removeEventListener ? mq.removeEventListener("change", cb) : mq.removeListener(cb));
}
const getReducedMotion = () => (typeof window !== "undefined" && !!window.matchMedia ? window.matchMedia(RM_QUERY).matches : false);

/* ---------- animated layer preloading (shared across instances) ---------- */
const ANIM_URLS = [animBase, animArmL, animArmR, animEyes, animMouth, animGlow];
const loadedUrls = new Set<string>();
const failedUrls = new Set<string>();
const pendingUrls = new Map<string, Promise<void>>();
function preload(url: string): Promise<void> {
  if (loadedUrls.has(url) || failedUrls.has(url)) return Promise.resolve();
  let p = pendingUrls.get(url);
  if (!p) {
    p = new Promise<void>((resolve) => {
      const img = new Image();
      img.onload = () => {
        loadedUrls.add(url);
        resolve();
      };
      img.onerror = () => {
        failedUrls.add(url);
        resolve();
      };
      img.src = url;
    });
    pendingUrls.set(url, p);
  }
  return p;
}
type AnimStatus = "idle" | "loading" | "ready" | "failed";
function currentStatus(): AnimStatus {
  if (ANIM_URLS.some((u) => failedUrls.has(u))) return "failed";
  return ANIM_URLS.every((u) => loadedUrls.has(u)) ? "ready" : "loading";
}
function useAnimAssets(enabled: boolean): AnimStatus {
  const [status, setStatus] = useState<AnimStatus>(() => (enabled ? currentStatus() : "idle"));
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    setStatus(currentStatus());
    Promise.all(ANIM_URLS.map(preload)).then(() => alive && setStatus(currentStatus()));
    return () => {
      alive = false;
    };
  }, [enabled]);
  return enabled ? status : "idle";
}

/* ---------- per-instance randomness (deterministic from useId -> SSR/prerender safe) ---------- */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
function makeVars(id: string, size: number): CSSProperties {
  const r = mulberry32(hashString(id));
  const blinkDur = 13 + r() * 4; // 13-17 s super-cycle -> single blinks every ~3.5-6 s, an occasional double blink
  const float = Math.min(6.5, Math.max(1.6, size * 0.045));
  const v: Record<string, string> = {
    "--gm-size": `${size}px`,
    "--gm-float": `${float.toFixed(2)}px`,
    "--gm-blink-dur": `${blinkDur.toFixed(2)}s`,
    "--gm-blink-delay": `${(-r() * blinkDur).toFixed(2)}s`,
    "--gm-d-float": `${(-r() * 4).toFixed(2)}s`,
    "--gm-d-breathe": `${(-r() * 3.4).toFixed(2)}s`,
    "--gm-d-tilt": `${(-r() * 6.4).toFixed(2)}s`,
    "--gm-d-glow": `${(-r() * 3.4).toFixed(2)}s`,
    "--gm-d-sway-l": `${(-r() * 4.2).toFixed(2)}s`,
    "--gm-d-sway-r": `${(-r() * 4.2).toFixed(2)}s`,
  };
  return v as unknown as CSSProperties;
}

/** Plain static logo: one <img>, the right pre-scaled frame for its size. Use for tiny/list/inline usage. */
export function GhostLogo({
  size = 24,
  className,
  style,
  title,
  alt = DEFAULT_ALT,
  onClick,
}: {
  size?: number;
  className?: string;
  style?: CSSProperties;
  title?: string;
  alt?: string;
  onClick?: (e: MouseEvent<HTMLImageElement>) => void;
}) {
  const dpr = useSyncExternalStore(subscribeDpr, getDpr, getServerDpr);
  return (
    <img
      src={pickStatic(size, dpr)}
      width={size}
      height={size}
      alt={alt}
      title={title}
      className={className}
      style={{ display: "inline-block", flex: "none", userSelect: "none", ...style }}
      draggable={false}
      onClick={onClick}
    />
  );
}

export function GhostMascot({
  size = 64,
  variant = "idle",
  animated = true,
  blink = true,
  className,
  style,
  title,
  onClick,
  alt,
  "aria-label": ariaLabel,
}: GhostMascotProps) {
  const id = useId();
  const reduced = useSyncExternalStore(subscribeReducedMotion, getReducedMotion, () => false);
  useEffect(bindVisibilityOnce, []);

  const eff: GhostVariant = size <= CALM_MAX_SIZE ? "calm" : variant;
  const motion = animated && !reduced;
  const wantsFull = motion && eff !== "calm";
  const status = useAnimAssets(wantsFull);
  const full = wantsFull && status === "ready";
  const dpr = useSyncExternalStore(subscribeDpr, getDpr, getServerDpr);
  const staticSrc = pickStatic(size, dpr);

  const vars = useMemo(() => makeVars(id, size), [id, size]);
  const label = ariaLabel ?? alt ?? DEFAULT_ALT;
  const decorative = alt === "" && !ariaLabel && !onClick;
  const clickable = !!onClick;

  const cls = ["gm", motion ? `gm--${eff}` : "gm--static", clickable ? "gm--clickable" : "", className || ""]
    .filter(Boolean)
    .join(" ");
  const state = !motion ? "static" : eff === "calm" ? "calm" : full ? "full" : status === "failed" ? "static-fallback" : "loading";

  const a11y = clickable
    ? {
        role: "button" as const,
        tabIndex: 0,
        "aria-label": label,
        onClick: (e: MouseEvent<HTMLElement>) => onClick?.(e),
        onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onClick?.(e);
          }
        },
      }
    : decorative
      ? { "aria-hidden": true as const }
      : { role: "img" as const, "aria-label": label };

  // not animated / reduced motion / asset failure: the still logo (same box, same framing)
  if (!motion || (wantsFull && status === "failed")) {
    return (
      <div className={cls} style={{ ...vars, ...style }} title={title} data-gm-state={state} {...a11y}>
        <img className="gm-static" src={staticSrc} alt="" draggable={false} />
      </div>
    );
  }

  const withHop = eff !== "calm";
  const stack = (
    <div className="gm-body">
      {full && size >= GLOW_MIN_SIZE && (
        <div className="gm-glow" aria-hidden="true">
          <img src={animGlow} alt="" draggable={false} />
        </div>
      )}
      {full ? (
        <>
          <img className="gm-base" src={animBase} alt="" draggable={false} />
          <div className="gm-layer gm-arm gm-arm--l" aria-hidden="true">
            <img className="gm-strip" src={animArmL} alt="" draggable={false} />
          </div>
          <div className="gm-layer gm-arm gm-arm--r" aria-hidden="true">
            <img className="gm-strip" src={animArmR} alt="" draggable={false} />
          </div>
        </>
      ) : (
        <img className="gm-static" src={staticSrc} alt="" draggable={false} />
      )}
      {blink && (full || eff === "calm") && (
        <div className="gm-layer gm-eyes" aria-hidden="true">
          <img className="gm-strip" src={animEyes} alt="" draggable={false} />
        </div>
      )}
      {full && (
        <div className="gm-mouth" aria-hidden="true">
          <img src={animMouth} alt="" draggable={false} />
        </div>
      )}
    </div>
  );

  return (
    <div className={cls} style={{ ...vars, ...style }} title={title} data-gm-state={state} {...a11y}>
      {withHop ? (
        <div className="gm-hover">
          <div className="gm-hop">{stack}</div>
        </div>
      ) : (
        stack
      )}
    </div>
  );
}

export default GhostMascot;
