// "Upload your resume" card for the Profile tab of Interview Setup.
//   - no usable AI key  -> locked: explains why and offers an inline "add a key" block (no navigation)
//   - key present       -> drag & drop / file picker
//   - working           -> Reading file > Analyzing with <Provider> > Filling your profile (+ Cancel)
//   - done / error      -> banner with Replace / Undo / Remove, or a friendly message + Try again
import React, { useRef, useState } from "react";
import { motion } from "framer-motion";
import { useStore } from "../../store/useStore";
import { AI_PROVIDERS, testApiKey } from "../../pages/ApiSetupPage";
import { withoutDisabled } from "../providerState";
import { MAX_RESUME_BYTES } from "./limits";
import { ACCEPT_ATTR } from "./types";
import type { ImportState } from "./useResumeImport";

// Same palette as the rest of the setup wizard (the tint is the one ApiSetupPage uses for its active provider).
const INK = "#15162b";
const SUBTLE = "#6b7280";
const BORDER = "#e8e8ee";
const PANEL_BG = "#f7f7fa";
const TINT_BG = "#f0f0fb";
const TINT_BORDER = "#c7c9f0";

export const PRIVACY_LINE =
  "Your resume is read on your device and sent only to the AI provider you chose, using your own key. It is not uploaded to Ghotly servers.";
export const KEY_SYNC_LINE = "Tested keys are saved (encrypted) to your Ghotly AI account.";

export function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ───────────────────────── small pieces ─────────────────────────

const SmallButton: React.FC<{
  onClick: () => void; children: React.ReactNode; testId?: string; primary?: boolean; disabled?: boolean; title?: string;
}> = ({ onClick, children, testId, primary, disabled, title }) => (
  <button
    type="button" onClick={onClick} disabled={disabled} data-testid={testId} title={title}
    className="text-[8.5px] font-extrabold px-2.5 py-1.5 rounded-lg whitespace-nowrap"
    style={{
      background: primary ? INK : "#fff", color: primary ? "#fff" : INK,
      border: primary ? "1px solid " + INK : `1px solid ${BORDER}`,
      opacity: disabled ? 0.45 : 1, cursor: disabled ? "not-allowed" : "pointer",
    }}
  >
    {children}
  </button>
);

const UndoIcon: React.FC = () => (
  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden
    style={{ display: "inline-block", marginRight: 4, verticalAlign: "-1px" }}>
    <path d="M3 7v6h6" /><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6.7 3L3 13" />
  </svg>
);

const StepRow: React.FC<{ state: "done" | "active" | "todo"; label: string; note?: string; testId: string }> = ({ state, label, note, testId }) => (
  <div className="flex items-start gap-2" data-testid={testId} data-state={state}>
    <span className="mt-px shrink-0 flex items-center justify-center" style={{ width: 16, height: 16 }}>
      {state === "done" ? (
        <span className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-black" style={{ background: "#16a34a", color: "#fff" }}>✓</span>
      ) : state === "active" ? (
        <span className="w-4 h-4 rounded-full animate-spin" style={{ border: `2px solid ${TINT_BORDER}`, borderTopColor: INK }} />
      ) : (
        <span className="w-4 h-4 rounded-full" style={{ border: `1.5px solid ${BORDER}`, background: "#fff" }} />
      )}
    </span>
    <div className="min-w-0">
      <p className="text-[10px] leading-[16px]" style={{ color: state === "todo" ? "#9ca3af" : INK, fontWeight: state === "active" ? 700 : 600 }}>{label}</p>
      {note && <p className="text-[8.5px] font-medium leading-tight" style={{ color: SUBTLE }}>{note}</p>}
    </div>
  </div>
);

// ───────────────────────── inline "add an API key" ─────────────────────────

const QuickAddKey: React.FC<{ onSaved: (providerLabel: string) => void }> = ({ onSaved }) => {
  const [providerId, setProviderId] = useState<string>("gemini");
  const [key, setKey] = useState("");
  const [show, setShow] = useState(false);
  const [status, setStatus] = useState<"idle" | "testing" | "invalid">("idle");
  const [message, setMessage] = useState("");
  const provider = AI_PROVIDERS.find((p) => p.id === providerId) ?? AI_PROVIDERS[0];

  const testAndSave = async () => {
    const k = key.trim();
    if (!k || status === "testing") return;
    setStatus("testing");
    setMessage("");
    const res = await testApiKey(provider.id, k, provider.models[0]);
    if (res.status !== "valid") {
      setStatus("invalid");
      setMessage(res.message || "That key didn't work.");
      return;
    }
    // Persist exactly like ApiSetupPage.handleSave: key -> store, make that provider the active one (re-enabling it
    // if it had been deactivated), then write settings to disk.
    const store = useStore.getState();
    store.setApiKey(provider.id, k);
    store.updateSettings({
      apiKeys: { ...useStore.getState().settings.apiKeys, [provider.id]: k },
      activeProvider: provider.id,
      activeModel: provider.models[0],
      disabledProviders: withoutDisabled(useStore.getState().settings, provider.id),
    });
    void window.ghostly.saveSettings(useStore.getState().settings);
    setKey("");
    setStatus("idle");
    onSaved(provider.label);
  };

  return (
    <div className="flex flex-col gap-1.5" data-testid="resume-quickadd">
      <div className="flex flex-col gap-1">
        <label className="text-[8px] font-black uppercase tracking-[0.12em]" style={{ color: SUBTLE }} htmlFor="resume-qa-provider">🤖 AI provider</label>
        <select
          id="resume-qa-provider" data-testid="resume-quickadd-provider" value={providerId}
          onChange={(e) => { setProviderId(e.target.value); setStatus("idle"); setMessage(""); }}
          className="w-full text-[10.5px] font-semibold rounded-xl px-2.5 py-2 focus:outline-none cursor-pointer"
          style={{ background: "#fff", border: `1px solid ${BORDER}`, color: INK }}
        >
          {AI_PROVIDERS.map((p) => <option key={p.id} value={p.id}>{p.icon} {p.label} · {p.badge}</option>)}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <label className="text-[8px] font-black uppercase tracking-[0.12em]" style={{ color: SUBTLE }} htmlFor="resume-qa-key">🔑 API key</label>
          <button
            type="button" data-testid="resume-quickadd-getkey" onClick={() => window.ghostly.openExternal(provider.url)}
            className="text-[8.5px] font-bold" style={{ color: INK }}
          >
            Get free key ↗
          </button>
        </div>
        <div className="relative">
          <input
            id="resume-qa-key" data-testid="resume-quickadd-key" type={show ? "text" : "password"} value={key}
            onChange={(e) => { setKey(e.target.value); if (status === "invalid") { setStatus("idle"); setMessage(""); } }}
            onKeyDown={(e) => { if (e.key === "Enter") void testAndSave(); }}
            placeholder={`Paste your ${provider.label} key (${provider.ph})`}
            autoComplete="off" spellCheck={false}
            className="w-full rounded-xl text-[10.5px] font-mono focus:outline-none"
            style={{ padding: "8px 34px 8px 10px", background: "#fff", color: INK, border: `1px solid ${status === "invalid" ? "#fca5a5" : BORDER}` }}
          />
          <button
            type="button" onClick={() => setShow((v) => !v)} data-testid="resume-quickadd-toggle"
            aria-label={show ? "Hide key" : "Show key"}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] opacity-60 hover:opacity-100"
          >
            {show ? "🙈" : "👁"}
          </button>
        </div>
      </div>

      <button
        type="button" data-testid="resume-quickadd-save" onClick={() => void testAndSave()} disabled={!key.trim() || status === "testing"}
        className="w-full py-2 rounded-xl text-[10.5px] font-bold"
        style={{ background: INK, color: "#fff", opacity: !key.trim() || status === "testing" ? 0.45 : 1, cursor: !key.trim() ? "not-allowed" : "pointer" }}
      >
        {status === "testing" ? "Testing…" : "Test & save"}
      </button>
      {status === "invalid" && message && (
        <p className="text-[8.5px] font-bold leading-snug" role="alert" data-testid="resume-quickadd-error" style={{ color: "#dc2626", overflowWrap: "anywhere" }}>⚠ {message}</p>
      )}
      <p className="text-[8px] font-medium leading-snug" data-testid="resume-quickadd-sync" style={{ color: SUBTLE }}>{KEY_SYNC_LINE}</p>
    </div>
  );
};

// ───────────────────────── the card ─────────────────────────

export interface ResumeCardProps {
  state: ImportState;
  /** At least one usable (saved, not deactivated) AI key exists. */
  hasKey: boolean;
  canUndo: boolean;
  canRemove: boolean;
  /** Neutral one-line status after Undo / Remove. */
  notice: { text: string; undo?: boolean } | null;
  onFile: (file: File) => void;
  onCancel: () => void;
  onRetry: () => void;
  onDismissError: () => void;
  onUndo: () => void;
  onRemove: () => void;
}

export const ResumeCard: React.FC<ResumeCardProps> = ({
  state, hasKey, canUndo, canRemove, notice, onFile, onCancel, onRetry, onDismissError, onUndo, onRemove,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [justSaved, setJustSaved] = useState<string | null>(null);
  const working = state.status === "working";
  const locked = !hasKey;
  const disabled = locked || working;

  const pick = () => { if (!disabled) inputRef.current?.click(); };
  const take = (file: File | undefined | null) => { if (file && !disabled) onFile(file); };

  return (
    <motion.div
      data-testid="resume-card" data-locked={locked ? "true" : "false"} data-status={state.status}
      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}
      className="rounded-2xl flex flex-col gap-2.5"
      style={{ background: TINT_BG, border: `1px solid ${TINT_BORDER}`, padding: "11px 11px 10px" }}
    >
      {/* header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[16px] leading-none">📄</span>
          <div className="min-w-0">
            <p className="text-[11.5px] font-bold leading-tight" style={{ color: INK }}>Upload your resume</p>
            <p className="text-[8.5px] font-medium leading-tight mt-0.5" style={{ color: SUBTLE }}>AI reads it and fills in your whole profile</p>
          </div>
        </div>
        <span
          className="text-[7px] font-black px-1.5 py-0.5 rounded-full shrink-0 tracking-wide"
          style={{ background: locked ? "#fff" : INK, color: locked ? SUBTLE : "#fff", border: locked ? `1px solid ${BORDER}` : "none" }}
        >
          {locked ? "🔒 NEEDS KEY" : "AI AUTO-FILL"}
        </span>
      </div>

      {/* locked: why, the (visibly disabled) upload control, then an inline "add a key" block */}
      {locked && (
        <div className="flex flex-col gap-2" data-testid="resume-locked">
          <div>
            <p className="text-[10.5px] font-bold leading-snug" style={{ color: INK }}>Resume analysis needs an AI API key</p>
            <p className="text-[8.5px] font-medium leading-snug mt-0.5" style={{ color: SUBTLE }}>
              Add one below — no need to leave this screen.
            </p>
          </div>
          <div
            data-testid="resume-dropzone" data-disabled="true" role="button" tabIndex={-1} aria-disabled="true"
            aria-label="Upload your resume (locked until you add an AI API key)"
            onDragEnter={(e) => e.preventDefault()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => e.preventDefault()}
            className="rounded-xl flex items-center gap-2.5"
            style={{ padding: "6px 10px", border: "1.5px dashed #d4d6e0", background: "#eeeef3", cursor: "not-allowed", opacity: 0.65 }}
          >
            <span className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-[11px]" style={{ background: "#c9ccd6", color: "#fff" }}>🔒</span>
            <div className="min-w-0">
              <p className="text-[10px] font-bold leading-tight" style={{ color: "#7b7f8e" }}>Upload is locked</p>
              <p className="text-[8px] font-medium leading-tight mt-0.5" style={{ color: SUBTLE }}>PDF · DOCX · TXT · PNG · JPG · WebP</p>
            </div>
          </div>
          <QuickAddKey onSaved={(label) => setJustSaved(label)} />
        </div>
      )}

      {/* just unlocked */}
      {!locked && justSaved && !working && state.status === "idle" && (
        <p className="text-[9px] font-bold leading-snug" role="status" data-testid="resume-key-saved" style={{ color: "#16a34a" }}>
          ✓ {justSaved} key saved — upload your resume below.
        </p>
      )}

      {/* working: file chip, steps, indeterminate bar, cancel */}
      {state.status === "working" && (
        <div className="flex flex-col gap-2" data-testid="resume-working" role="status" aria-live="polite">
          <div className="flex items-center gap-2 rounded-lg px-2 py-1.5" style={{ background: "#fff", border: `1px solid ${BORDER}` }}>
            <span className="text-[12px]">📄</span>
            <span className="text-[9.5px] font-bold truncate flex-1 min-w-0" title={state.fileName} style={{ color: INK }}>{state.fileName}</span>
            <span className="text-[8.5px] font-semibold shrink-0" style={{ color: SUBTLE }}>{fmtSize(state.fileSize)}</span>
          </div>
          <div className="flex flex-col gap-1.5 px-0.5" data-testid="resume-steps">
            <StepRow testId="resume-step-reading" label="Reading file" state={state.step === "reading" ? "active" : "done"} />
            <StepRow
              testId="resume-step-analyzing" label={`Analyzing with ${state.provider || "AI"}`}
              note={state.step === "analyzing" ? state.note || undefined : undefined}
              state={state.step === "reading" ? "todo" : state.step === "analyzing" ? "active" : "done"}
            />
            <StepRow testId="resume-step-filling" label="Filling your profile" state={state.step === "filling" ? "active" : "todo"} />
          </div>
          <div className="h-[3px] rounded-full overflow-hidden" data-testid="resume-progress" style={{ background: "#e0e1f3" }}>
            <motion.div
              className="h-full rounded-full" style={{ width: "38%", background: INK }}
              animate={{ x: ["-100%", "270%"] }} transition={{ repeat: Infinity, duration: 1.25, ease: "easeInOut" }}
            />
          </div>
          <div className="flex justify-end">
            <SmallButton testId="resume-cancel" onClick={onCancel}>Cancel</SmallButton>
          </div>
        </div>
      )}

      {/* done */}
      {state.status === "done" && (
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }}
          className="rounded-xl px-2.5 py-2 flex flex-col gap-2" data-testid="resume-done" role="status"
          style={{ background: "#f0fdf4", border: "1px solid #bbf7d0" }}
        >
          <div>
            <p className="text-[9.5px] font-bold leading-snug" style={{ color: "#15803d", overflowWrap: "anywhere" }}>
              ✓ Filled from {state.fileName} — review and edit anything
            </p>
            <p className="text-[8px] font-medium leading-tight mt-0.5" style={{ color: "#4b8a63" }}>Analyzed with {state.provider}</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <SmallButton testId="resume-replace" onClick={pick}>Replace resume</SmallButton>
            <SmallButton testId="resume-undo" onClick={onUndo} disabled={!canUndo} title="Restore the details you had before importing"><UndoIcon />Undo</SmallButton>
            <SmallButton testId="resume-remove" onClick={onRemove} disabled={!canRemove} title="Clear the details this resume filled in">Remove</SmallButton>
          </div>
        </motion.div>
      )}

      {/* error */}
      {state.status === "error" && (
        <motion.div
          initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }}
          className="rounded-xl px-2.5 py-2 flex flex-col gap-2" data-testid="resume-error" data-code={state.code} role="alert"
          style={{ background: "#fef2f2", border: "1px solid #fecaca" }}
        >
          <p className="text-[9.5px] font-bold leading-snug" style={{ color: "#b91c1c", overflowWrap: "anywhere" }}>⚠ {state.message}</p>
          <div className="flex flex-wrap gap-1.5">
            {state.retryable && <SmallButton testId="resume-retry" primary onClick={onRetry}>Try again</SmallButton>}
            <SmallButton testId="resume-choose-another" onClick={pick}>Choose another file</SmallButton>
            <SmallButton testId="resume-dismiss" onClick={onDismissError}>Dismiss</SmallButton>
          </div>
        </motion.div>
      )}

      {/* neutral notice after Undo / Remove */}
      {state.status === "idle" && notice && (
        <div className="rounded-xl px-2.5 py-1.5 flex items-center justify-between gap-2" data-testid="resume-notice" role="status" style={{ background: "#fff", border: `1px solid ${BORDER}` }}>
          <p className="text-[9px] font-semibold leading-snug" style={{ color: INK }}>{notice.text}</p>
          {notice.undo && canUndo && <SmallButton testId="resume-notice-undo" onClick={onUndo}><UndoIcon />Undo</SmallButton>}
        </div>
      )}

      {/* drop zone (not while locked — see above — nor while a run is in progress or a result banner is showing) */}
      {!locked && !working && state.status !== "done" && (
        <div
          data-testid="resume-dropzone" data-disabled="false" role="button" tabIndex={0}
          aria-label="Upload your resume"
          onClick={pick}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } }}
          onDragEnter={(e) => { e.preventDefault(); window.ghostly.enableMouse(); setDrag(true); }}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDrag(false); }}
          onDrop={(e) => { e.preventDefault(); setDrag(false); take(e.dataTransfer?.files?.[0]); }}
          className="rounded-xl flex flex-col items-center justify-center text-center transition-colors"
          style={{
            padding: "12px 10px",
            border: `1.5px dashed ${drag ? INK : TINT_BORDER}`,
            background: drag ? "#e8eaff" : "#fff",
            cursor: "pointer",
          }}
        >
          <span className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: INK, color: "#fff" }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
          </span>
          <p className="text-[10.5px] font-bold mt-1.5" style={{ color: INK }}>{drag ? "Release to upload" : "Drop your resume here"}</p>
          <p className="text-[9px] font-medium" style={{ color: SUBTLE }}>
            or <span style={{ color: INK, fontWeight: 700, textDecoration: "underline" }}>browse files</span>
          </p>
          <p className="text-[8px] font-medium mt-1" style={{ color: SUBTLE }}>PDF · DOCX · TXT · PNG · JPG · WebP — up to {Math.round(MAX_RESUME_BYTES / (1024 * 1024))} MB</p>
        </div>
      )}

      <input
        ref={inputRef} type="file" accept={ACCEPT_ATTR} data-testid="resume-file-input" className="hidden" disabled={disabled} tabIndex={-1}
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; take(f); }}
      />

      <p className="text-[8px] font-medium leading-snug flex gap-1" data-testid="resume-privacy" style={{ color: SUBTLE }}>
        <span aria-hidden>🔒</span><span>{PRIVACY_LINE}</span>
      </p>
    </motion.div>
  );
};
