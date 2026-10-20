// Runs the metered session for one interview (src/lib/metering.ts) and shows free users their time left.
// Remounting it (a new `key`) starts a new session - used after someone upgrades from inside the interview.
import React from "react";
import { formatMinutes } from "../lib/api";
import { type StopReason, useMeteredSession } from "../lib/metering";

export const SessionMeter: React.FC<{ onStop: (reason: StopReason) => void; hidden?: boolean }> = ({ onStop, hidden }) => {
  const meter = useMeteredSession(onStop);
  if (hidden || meter.status !== "running" || meter.paid || meter.secondsLeft === null) return null;
  const low = meter.secondsLeft <= 60;
  return (
    <div
      className="fixed bottom-3 left-1/2 -translate-x-1/2 z-[9000] px-3 py-1 rounded-full text-[10px] font-bold tracking-wide"
      style={{
        pointerEvents: "none",
        background: low ? "rgba(235,146,69,0.95)" : "rgba(10,10,14,0.85)",
        color: "#fff",
        border: "1px solid rgba(255,255,255,0.12)",
        backdropFilter: "blur(16px)",
      }}
    >
      Free · {formatMinutes(meter.secondsLeft)} left{meter.offline ? " · offline" : ""}
    </div>
  );
};
