import { useEffect } from "react";

// While minimized the window keeps its full size and capture mode, so go click-through on
// collapse and re-capture only while a mouse-move hit-test finds the logo.
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
      // Send on every change; while over the logo also re-assert periodically so a stray
      // disable (late mouseleave, another handler) can never leave the logo unclickable.
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
