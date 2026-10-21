// "Pick a plan" sheet (v4): shown when free time runs out, a PC limit is hit, or from the plan badge.
// Payment happens on ghotlyai.in (Razorpay Checkout in the browser, signed in with the same Google account);
// "I've paid" re-reads the account, so the app unlocks without a restart.
import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useStore } from "../store/useStore";
import { type Access, type Plan, ACCOUNT_URL, PRICING_URL, apiFetch } from "../lib/api";
import { type StopReason, reasonText } from "../lib/metering";

const INK = "#1c1c1e";
const SUBTLE = "#6e6e73";
const ACCENT = "#eb9245";
const BORDER = "rgba(0,0,0,0.08)";

const FALLBACK_PLANS: Plan[] = [
  { code: "3m", name: "3 months", price_inr: 199, days: 90, per_month_inr: 66 },
  { code: "6m", name: "6 months", price_inr: 349, days: 180, per_month_inr: 58 },
  { code: "12m", name: "1 year", price_inr: 699, days: 365, per_month_inr: 58 },
];

export const UpgradeSheet: React.FC<{
  reason: StopReason | null;
  onClose: (unlocked: boolean) => void;
}> = ({ reason, onClose }) => {
  const [plans, setPlans] = useState<Plan[]>(FALLBACK_PLANS);
  const [checking, setChecking] = useState(false);
  const [note, setNote] = useState("");
  const setAccess = useStore((s) => s.setAccess);

  useEffect(() => {
    window.ghostly.enableMouse();
    apiFetch<{ plans: Plan[] }>("/plans", { auth: false })
      .then((d) => { if (Array.isArray(d.plans) && d.plans.length) setPlans(d.plans); })
      .catch(() => {});
  }, []);

  const buy = (code: string) => window.ghostly.openExternal(`${PRICING_URL}?plan=${encodeURIComponent(code)}&from=app`);

  const recheck = async () => {
    setChecking(true);
    setNote("");
    try {
      const access = await apiFetch<Access>("/me/access");
      setAccess(access);
      if (access.can_start_session) { onClose(true); return; }
      setNote("No active plan yet. If you just paid, wait a few seconds and try again.");
    } catch {
      setNote("Couldn't reach the server. Check your connection.");
    } finally {
      setChecking(false);
    }
  };

  const best = plans.reduce((a, b) => (b.per_month_inr < a.per_month_inr ? b : a), plans[0]);
  const canBuy = reason !== "blocked" && reason !== "device_limit";

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
      className="fixed inset-0 z-[10000] flex items-center justify-center"
      style={{ pointerEvents: "auto", background: "rgba(10,10,14,0.35)", backdropFilter: "blur(6px)" }}
      onMouseEnter={() => window.ghostly.enableMouse()}
    >
      <motion.div
        initial={{ scale: 0.94, y: 16, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.94, y: 16, opacity: 0 }} transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="w-[340px] rounded-[22px] overflow-hidden flex flex-col"
        style={{ background: "#ffffff", border: `1px solid ${BORDER}`, boxShadow: "0 24px 60px rgba(20,20,40,0.3)", fontFamily: "-apple-system, 'Segoe UI', system-ui, sans-serif" }}
      >
        <div className="p-5 flex flex-col gap-3">
          <div>
            <p className="text-[16px] font-bold leading-tight" style={{ color: INK }}>
              {reason === "no_time" || reason === "free_used_on_device" ? "Keep interviewing with a plan" : "Ghotly AI plans"}
            </p>
            {reasonText(reason) && (
              <p className="text-[11.5px] mt-1.5 leading-relaxed" style={{ color: SUBTLE }}>{reasonText(reason)}</p>
            )}
          </div>

          {canBuy && (
            <div className="flex flex-col gap-2">
              {plans.map((p) => (
                <button
                  key={p.code}
                  onClick={() => buy(p.code)}
                  className="flex items-center justify-between px-3.5 py-2.5 rounded-[14px] text-left transition-transform active:scale-[0.98]"
                  style={{ border: `1px solid ${p.code === best?.code ? ACCENT : BORDER}`, background: p.code === best?.code ? "#fff7ef" : "#fafafa" }}
                >
                  <span>
                    <span className="block text-[13px] font-semibold" style={{ color: INK }}>{p.name}</span>
                    <span className="block text-[10.5px]" style={{ color: SUBTLE }}>≈ ₹{p.per_month_inr}/month · no ads · 2 PCs · every job</span>
                  </span>
                  <span className="text-[15px] font-bold" style={{ color: INK }}>₹{p.price_inr}</span>
                </button>
              ))}
              <p className="text-[10px] text-center" style={{ color: SUBTLE }}>
                Opens ghotlyai.in to pay securely with Razorpay (UPI, cards, net banking).
              </p>
            </div>
          )}

          {note && <p className="text-[10.5px] text-center" style={{ color: "#b45309" }}>{note}</p>}

          <div className="flex gap-2 pt-1">
            <button
              onClick={() => onClose(false)}
              className="flex-1 py-2 rounded-full text-[12px] font-semibold"
              style={{ background: "#f2f2f7", color: INK }}
            >
              Not now
            </button>
            {canBuy ? (
              <button
                onClick={recheck}
                disabled={checking}
                className="flex-1 py-2 rounded-full text-[12px] font-semibold text-white disabled:opacity-60"
                style={{ background: "#0071e3" }}
              >
                {checking ? "Checking…" : "I've paid"}
              </button>
            ) : (
              <button
                onClick={() => window.ghostly.openExternal(reason === "device_limit" ? ACCOUNT_URL : "https://www.ghotlyai.in/support/")}
                className="flex-1 py-2 rounded-full text-[12px] font-semibold text-white"
                style={{ background: "#0071e3" }}
              >
                {reason === "device_limit" ? "My account" : "Support"}
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};
