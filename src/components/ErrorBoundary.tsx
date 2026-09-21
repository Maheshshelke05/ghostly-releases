import React from "react";

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

// A transparent, frameless window that fails to render looks identical to one that's
// simply "not visible" — there's no frame or chrome to hint anything is wrong. Without
// this, an uncaught render error unmounts the whole tree and leaves a fully blank
// window with no on-screen indication of what happened.
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[Ghostly] Renderer crashed:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      // Used to be a full h-screen w-full div with pointerEvents:"auto" — since
      // stealth (WDA_EXCLUDEFROMCAPTURE) applies to the whole window regardless
      // of what's rendered inside it, this was never actually visible to a
      // screen-share, but it DID eat every mouse click across the entire
      // ~700x600 overlay window the instant any render error occurred — during
      // a live interview, that's real screen space suddenly blocking clicks to
      // Zoom/Meet underneath it. (Not re-rendering this.props.children here —
      // the crashed subtree is in an inconsistent state and would very likely
      // throw again immediately, looping. The wrapper stays transparent and
      // click-through; only the small toast itself is interactive.)
      return (
        <div className="fixed inset-0" style={{ pointerEvents: "none", background: "transparent" }}>
          <div
            className="absolute bottom-3 right-3 max-w-[280px] rounded-2xl p-4 flex flex-col gap-2.5 shadow-2xl"
            style={{ background: "#ffffff", border: "1px solid #fecaca", pointerEvents: "auto" }}
          >
            <p className="text-[12px] font-bold" style={{ color: "#dc2626" }}>⚠ Ghostly hit an error</p>
            <p className="text-[10px] font-mono break-words leading-relaxed" style={{ color: "#6b7280" }}>
              {this.state.error.message}
            </p>
            <button
              onClick={() => this.setState({ error: null })}
              className="py-1.5 rounded-xl text-[10px] font-bold"
              style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#dc2626" }}
            >
              Try to recover
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
