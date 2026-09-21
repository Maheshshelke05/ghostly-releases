import { useEffect } from "react";

// While the overlay is collapsed to its logo, everything except the logo must let
// clicks fall through to whatever is underneath (the browser, the meeting app...).
//
// The window keeps its full size — only the logo is drawn — and it stays in "capture
// the mouse" mode from when the card was on screen. Relying on the logo's own
// mouseenter/mouseleave is not enough: when the collapse is triggered from somewhere
// else (the login timer, a button far from where the logo lands) the pointer is never
// on the logo, so no event fires and the whole window keeps swallowing clicks.
//
// So: go click-through the instant we collapse, then follow the pointer — the main
// process forwards mouse-move events while click-through, which lets us hit-test and
// re-capture the mouse only while the pointer is actually over the logo.
export function useMinimizedClickThrough(minimized: boolean) {
  useEffect(() => {
    if (!minimized) return;

    window.ghostly.disableMouse();
    let overLogo = false;
    let lastSent = 0;

    const onMove = (e: MouseEvent) => {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const now = !!el?.closest("[data-minimized-logo]");
      const t = performance.now();
      // Send on every change; while hovering the logo also re-assert now and then, so a
      // stray disable from elsewhere (a late mouseleave, another screen's handler) can
      // never leave the logo unclickable.
      if (now === overLogo && !(now && t - lastSent > 300)) return;
      overLogo = now;
      lastSent = t;
      if (now) window.ghostly.enableMouse();
      else window.ghostly.disableMouse();
    };

    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, [minimized]);
}
