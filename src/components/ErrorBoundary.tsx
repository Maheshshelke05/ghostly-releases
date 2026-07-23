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
      return (
        <div
          className="h-screen w-full flex items-center justify-center px-6"
          style={{ background: "rgba(10,10,14,0.92)", pointerEvents: "auto" }}
        >
          <div
            className="max-w-md w-full rounded-2xl p-5 flex flex-col gap-3"
            style={{ background: "rgba(20,10,10,0.9)", border: "1px solid rgba(248,113,113,0.35)" }}
          >
            <p className="text-[13px] font-black text-red-400">⚠ Ghostly hit an error</p>
            <p className="text-[11px] font-mono text-white/70 break-words">
              {this.state.error.message}
            </p>
            <button
              onClick={() => this.setState({ error: null })}
              className="mt-1 py-2 rounded-xl text-[11px] font-bold text-white"
              style={{ background: "rgba(248,113,113,0.25)", border: "1px solid rgba(248,113,113,0.4)" }}
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
