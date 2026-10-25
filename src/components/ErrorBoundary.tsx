import React from "react";

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

// A render error here would unmount the whole tree and leave a fully blank transparent
// window with no on-screen hint of what happened.
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
      // Wrapper stays transparent and click-through so the overlay never blocks clicks during
      // an interview; only the toast is interactive, and the crashed subtree is not re-rendered (it would throw again).
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
