// State machine for "upload a resume -> read it -> analyze it -> fill the profile".
// Lives in the PAGE (not in the Profile tab) so switching tabs mid-analysis neither loses progress nor
// leaves a result with nowhere to go.
import { useCallback, useEffect, useRef, useState } from "react";
import { useStore } from "../../store/useStore";
import type { CandidateProfile } from "../../store/useStore";
import { analyzeResume } from "./analyze";
import { extractResume } from "./extract";
import type { ResumeErrorCode } from "./types";
import { isResumeError } from "./types";

export type ImportStep = "reading" | "analyzing" | "filling";

export type ImportState =
  | { status: "idle" }
  | { status: "working"; step: ImportStep; fileName: string; fileSize: number; provider: string; note: string }
  | { status: "done"; fileName: string; provider: string }
  | { status: "error"; fileName: string; code: ResumeErrorCode; message: string; retryable: boolean };

export interface ImportInfo {
  fileName: string;
  provider: string;
}

const FILL_STEP_MS = 700; // long enough for "Filling your profile" and the field highlight to register
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function useResumeImport(onImported: (profile: CandidateProfile, info: ImportInfo) => void) {
  const [state, setState] = useState<ImportState>({ status: "idle" });
  const runId = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const lastFile = useRef<File | null>(null);
  const onImportedRef = useRef(onImported);
  onImportedRef.current = onImported;

  const start = useCallback(async (file: File) => {
    controller.current?.abort();
    const ctl = new AbortController();
    controller.current = ctl;
    const id = ++runId.current;
    const live = () => runId.current === id && !ctl.signal.aborted;
    const whileWorking = (patch: Partial<Extract<ImportState, { status: "working" }>>) =>
      setState((s) => (s.status === "working" ? { ...s, ...patch } : s));

    lastFile.current = file;
    setState({ status: "working", step: "reading", fileName: file.name, fileSize: file.size, provider: "", note: "" });
    try {
      const extracted = await extractResume(file, { signal: ctl.signal });
      if (!live()) return;
      whileWorking({ step: "analyzing", note: "" });
      const result = await analyzeResume(extracted, {
        settings: useStore.getState().settings, // read at call time: a key saved a moment ago must count
        signal: ctl.signal,
        onProvider: (p) => { if (live()) whileWorking({ provider: p.label }); },
        onNote: (note) => { if (live()) whileWorking({ note }); },
      });
      if (!live()) return;
      whileWorking({ step: "filling", provider: result.provider.label, note: "" });
      onImportedRef.current(result.profile, { fileName: file.name, provider: result.provider.label });
      await sleep(FILL_STEP_MS);
      if (!live()) return;
      setState({ status: "done", fileName: file.name, provider: result.provider.label });
    } catch (e) {
      if (!live()) return;
      if (isResumeError(e)) {
        if (e.code === "cancelled") setState({ status: "idle" });
        else setState({ status: "error", fileName: file.name, code: e.code, message: e.message, retryable: e.retryable });
        return;
      }
      // Anything unexpected: never leave the card stuck on a spinner, and never show a raw stack/message.
      setState({
        status: "error", fileName: file.name, code: "ai_failed", retryable: true,
        message: "Something went wrong while reading that file. Please try again.",
      });
    }
  }, []);

  const cancel = useCallback(() => {
    controller.current?.abort();
    runId.current++; // invalidate the run so a late result is ignored
    setState({ status: "idle" });
  }, []);

  const retry = useCallback(() => {
    if (lastFile.current) void start(lastFile.current);
  }, [start]);

  // Leaving the page cancels any in-flight analysis (and its network request).
  useEffect(() => () => { controller.current?.abort(); runId.current++; }, []);

  return { state, start, cancel, retry, reset: cancel };
}
