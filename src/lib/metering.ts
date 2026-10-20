// Metered interview sessions (v4): free accounts get their free minutes, paid plans run without a limit.
//
// The SERVER counts the time (api.ghotlyai.in /sessions/*): start when the interview screen opens, a heartbeat
// every `heartbeat_every` seconds, end when it closes. Between beats the countdown shown here is only a display;
// whatever the server answers wins. If the server says stop (free time used up, PC limit, blocked), the interview
// stops and the upgrade sheet opens.
//
// Offline: a plan we last saw as paid and not yet expired keeps working (an interview must not die over a network
// blip). Free time never runs without the server - otherwise blocking the network would mean unlimited free use.
import { useCallback, useEffect, useRef, useState } from "react";
import { useStore } from "../store/useStore";
import { API_BASE, ApiError, apiFetch, currentToken } from "./api";

export type StopReason = "no_time" | "device_limit" | "free_used_on_device" | "blocked" | "session_ended" | "offline" | "signed_out";

export interface MeterState {
  status: "starting" | "running" | "stopped";
  paid: boolean;
  /** Free seconds left (null for a paid plan). */
  secondsLeft: number | null;
  reason: StopReason | null;
  offline: boolean;
}

interface SessionAnswer {
  allowed: boolean;
  reason: StopReason | null;
  paid: boolean;
  seconds_left: number | null;
  session_id: string | null;
  heartbeat_every: number;
}

const HEARTBEAT_FALLBACK_S = 30;

function paidOffline(): boolean {
  const access = useStore.getState().access;
  if (!access?.paid) return false;
  return !access.expires_at || new Date(access.expires_at).getTime() > Date.now();
}

export function reasonText(reason: StopReason | null): string {
  switch (reason) {
    case "no_time": return "Your free minutes are used up. Pick a plan to keep going.";
    case "device_limit": return "Your plan is already in use on 2 PCs. Write to support to free one of them.";
    case "free_used_on_device": return "This PC already used its free minutes with another account. Pick a plan to continue.";
    case "blocked": return "This account has been blocked. Contact support if this is a mistake.";
    case "offline": return "Can't reach the Ghotly AI server. Check your internet connection and try again.";
    case "signed_out": return "Please sign in again.";
    case "session_ended": return "This session has ended.";
    default: return "";
  }
}

export function useMeteredSession(onStop: (reason: StopReason) => void): MeterState & { end: () => void } {
  const [state, setState] = useState<MeterState>({ status: "starting", paid: false, secondsLeft: null, reason: null, offline: false });
  const sessionId = useRef<string | null>(null);
  const beatTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopped = useRef(false);
  const onStopRef = useRef(onStop);
  onStopRef.current = onStop;

  const clearTimers = () => {
    if (beatTimer.current) clearTimeout(beatTimer.current);
    if (tick.current) clearInterval(tick.current);
    beatTimer.current = null;
    tick.current = null;
  };

  const stop = useCallback((reason: StopReason) => {
    if (stopped.current) return;
    stopped.current = true;
    clearTimers();
    setState((s) => ({ ...s, status: "stopped", reason, secondsLeft: reason === "no_time" ? 0 : s.secondsLeft }));
    onStopRef.current(reason);
  }, []);

  const apply = useCallback((a: SessionAnswer) => {
    if (!a.allowed) { stop((a.reason || "session_ended") as StopReason); return false; }
    setState({ status: "running", paid: a.paid, secondsLeft: a.paid ? null : a.seconds_left, reason: null, offline: false });
    if (a.paid && useStore.getState().access && !useStore.getState().access!.paid) {
      useStore.getState().setAccess({ ...useStore.getState().access!, paid: true, plan: "pro", show_ads: false });
    }
    return true;
  }, [stop]);

  const scheduleBeat = useCallback((everyS: number) => {
    if (beatTimer.current) clearTimeout(beatTimer.current);
    beatTimer.current = setTimeout(async () => {
      if (stopped.current || !sessionId.current) return;
      try {
        const a = await apiFetch<SessionAnswer>("/sessions/heartbeat", { body: { session_id: sessionId.current } });
        if (apply(a)) scheduleBeat(a.heartbeat_every || everyS);
      } catch (err) {
        if (err instanceof ApiError && (err.status === 401)) { stop("signed_out"); return; }
        if (err instanceof ApiError && err.status === 403) { stop("blocked"); return; }
        if (err instanceof ApiError && err.status === 404) { stop("session_ended"); return; }
        // network trouble: keep going on the local countdown (free) / the known plan (paid), retry soon
        setState((s) => ({ ...s, offline: true }));
        scheduleBeat(15);
      }
    }, everyS * 1000);
  }, [apply, stop]);

  useEffect(() => {
    stopped.current = false;
    const device = window.ghostly.getDevice();
    (async () => {
      try {
        const a = await apiFetch<SessionAnswer>("/sessions/start", {
          body: { device_id: device.id, device_label: device.label, app_version: window.ghostly.getVersion() },
        });
        sessionId.current = a.session_id;
        if (apply(a)) scheduleBeat(a.heartbeat_every || HEARTBEAT_FALLBACK_S);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) { stop("signed_out"); return; }
        if (err instanceof ApiError && err.status === 403) { stop("blocked"); return; }
        if (paidOffline()) {
          setState({ status: "running", paid: true, secondsLeft: null, reason: null, offline: true });
          return;
        }
        stop("offline");
      }
    })();
    // the visible countdown between beats (free time only)
    tick.current = setInterval(() => {
      setState((s) => {
        if (s.status !== "running" || s.paid || s.secondsLeft === null) return s;
        const next = Math.max(s.secondsLeft - 1, 0);
        if (next === 0 && s.offline) setTimeout(() => stop("no_time"), 0); // offline: the server can't stop us, the clock does
        return { ...s, secondsLeft: next };
      });
    }, 1000);
    return () => {
      clearTimers();
      endNow(sessionId.current);
      sessionId.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const end = useCallback(() => {
    clearTimers();
    stopped.current = true;
    endNow(sessionId.current);
    sessionId.current = null;
  }, []);

  return { ...state, end };
}

/** Fire-and-forget end; `keepalive` lets it finish even while the window is closing. */
function endNow(id: string | null): void {
  const token = currentToken();
  if (!id || !token) return;
  try {
    fetch(`${API_BASE}/sessions/end`, {
      method: "POST",
      keepalive: true,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ session_id: id }),
    }).catch(() => {});
  } catch {
    /* the server closes it after 5 minutes without a heartbeat anyway */
  }
}
