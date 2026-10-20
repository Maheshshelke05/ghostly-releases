// The plan line on the home screen (v4): what the account has right now, and the way to more.
import React from "react";
import { useStore } from "../store/useStore";
import { PRICING_URL } from "../lib/api";

const SUBTLE = "#6e6e73";

export const PlanStrip: React.FC<{ onUpgrade: () => void }> = ({ onUpgrade }) => {
  const access = useStore((s) => s.access);
  if (!access) return null;

  let tone: "good" | "warn" | "plain" = "plain";
  let text = "";
  let action: { label: string; run: () => void } | null = null;
  const renew = () => window.ghostly.openExternal(`${PRICING_URL}?from=app`);

  if (access.paid) {
    if (access.days_left === null) {
      tone = "good"; text = "Pro plan";
    } else if (access.days_left <= 7) {
      tone = "warn"; text = access.days_left <= 1 ? "Pro plan ends today" : `Pro plan ends in ${access.days_left} days`;
      action = { label: "Renew", run: renew };
    } else {
      tone = "good"; text = `Pro plan · ${access.days_left} days left`;
    }
  } else if (access.expired) {
    tone = "warn"; text = "Your plan has ended"; action = { label: "Renew", run: onUpgrade };
  } else if (access.free_seconds_left > 0) {
    const min = Math.ceil(access.free_seconds_left / 60);
    text = `Free · ${min} min left`; action = { label: "Upgrade", run: onUpgrade };
  } else {
    tone = "warn"; text = access.free_seconds_total > 0 ? "Free minutes used" : "No plan yet"; action = { label: "See plans", run: onUpgrade };
  }

  const colors = {
    good: { bg: "#f0fdf4", fg: "#15803d", dot: "#22c55e" },
    warn: { bg: "#fff7ed", fg: "#c2410c", dot: "#eb9245" },
    plain: { bg: "#f2f3f6", fg: SUBTLE, dot: "#a1a1aa" },
  }[tone];

  return (
    <div className="flex items-center justify-between px-3 py-2 rounded-xl" style={{ background: colors.bg }}>
      <span className="flex items-center gap-2 text-[11px] font-semibold" style={{ color: colors.fg }}>
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: colors.dot }} />
        {text}
      </span>
      {action && (
        <button
          onClick={action.run}
          className="px-2.5 py-1 rounded-full text-[10px] font-bold text-white transition-transform active:scale-95"
          style={{ background: "#0071e3" }}
        >
          {action.label}
        </button>
      )}
    </div>
  );
};
