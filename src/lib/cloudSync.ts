// Your data, kept on your Ghotly AI account: a new PC (or a reinstall) starts where the old one stopped.
//
//   profile   the resume details of the interview setup's Profile tab (12 fields)
//   settings  the preferences that are safe to share between PCs (provider, model, opacity...) - NEVER an API key:
//             keys have their own encrypted backup (lib/keySync.ts), and no API hands one back
//   history   the last interviews' text - screen captures stay on this PC
//
// The PC stays the working copy; the server copy follows it a few seconds after every change (main process ->
// "ghostly:data-changed"), and is read once at start-up and after sign-in. Two PCs are safe: every save names the
// version it started from, and a stale save gets the server's copy back (409) and is MERGED, never overwritten.
// Everything here is best-effort: it never throws, never blocks the app, and a failed save is retried at the next
// change or the next start (the `dirty` flag survives a restart).
//
// A different person on the same PC: the previous person's profile and history are cleared before the new person's
// copy is read (so nothing of theirs can land in someone else's account), and signing out first saves, then clears.
import { ApiError, apiFetch } from "./api";
import { useStore } from "../store/useStore";

export type DataKind = "profile" | "settings" | "history";
const KINDS: DataKind[] = ["profile", "settings", "history"];
const PUSH_DELAY_MS = 3000;
const HISTORY_MAX = 30;

const PROFILE_KEYS = [
  "fullName", "email", "phone", "location", "summary", "skills", "experience", "projects",
  "education", "certifications", "linkedin", "github",
] as const;
const SETTINGS_KEYS = [
  "activeProvider", "activeModel", "disabledProviders", "deepgramLanguage", "customInstructions",
  "autoSwitchProvider", "opacity", "autoAI", "autoScroll",
] as const;
const HISTORY_KEYS = [
  "id", "timestamp", "solution", "provider", "model", "interviewType", "language", "companyName", "position",
  "durationSeconds", "featuresUsed",
] as const;
const QA_KEYS = ["id", "question", "answer", "timestamp", "type", "role", "content"] as const;

interface Meta { version: number; dirty: boolean }
type MetaMap = Record<DataKind, Meta>
interface Remote { data: any; version: number; updated_at: string | null }

const LAST_USER_KEY = "ghostly:cloud:last-user";
const metaKey = (uid: string) => `ghostly:cloud:${uid}`;

function readMeta(uid: string): MetaMap {
  const empty: MetaMap = { profile: { version: 0, dirty: false }, settings: { version: 0, dirty: false }, history: { version: 0, dirty: false } };
  try {
    const raw = JSON.parse(localStorage.getItem(metaKey(uid)) || "null");
    if (!raw) return empty;
    for (const k of KINDS) if (raw[k]) empty[k] = { version: Number(raw[k].version) || 0, dirty: !!raw[k].dirty };
  } catch { /* unreadable: start clean */ }
  return empty;
}
function writeMeta(uid: string, meta: MetaMap): void {
  try { localStorage.setItem(metaKey(uid), JSON.stringify(meta)); } catch { /* storage full or off */ }
}

// ---------------------------------------------------------------------------
// what this PC holds, in the shape the server stores
// ---------------------------------------------------------------------------
const pick = (obj: any, keys: readonly string[]) => {
  const out: Record<string, any> = {};
  for (const k of keys) if (obj && obj[k] !== undefined && obj[k] !== null) out[k] = obj[k];
  return out;
};

function cleanHistory(list: any): any[] {
  if (!Array.isArray(list)) return [];
  return list.slice(0, HISTORY_MAX).filter((e) => e && typeof e === "object").map((e) => {
    const entry: Record<string, any> = pick(e, HISTORY_KEYS);
    if (Array.isArray(e.qaHistory)) entry.qaHistory = e.qaHistory.slice(0, 200).filter((q: any) => q && typeof q === "object").map((q: any) => pick(q, QA_KEYS));
    return entry;
  });
}

async function localSnapshot(kind: DataKind): Promise<any> {
  if (kind === "profile") {
    const p = await window.ghostly.getSavedProfile().catch(() => null);
    const out: Record<string, string> = {};
    for (const k of PROFILE_KEYS) out[k] = typeof p?.[k] === "string" ? p[k] : "";
    return out;
  }
  if (kind === "settings") return pick(await window.ghostly.getSettings().catch(() => ({})), SETTINGS_KEYS);
  return cleanHistory(await window.ghostly.getHistory().catch(() => []));
}

const hasContent = (kind: DataKind, data: any): boolean =>
  kind === "profile" ? PROFILE_KEYS.some((k) => !!data?.[k]) : kind === "history" ? Array.isArray(data) && data.length > 0 : Object.keys(data || {}).length > 0;

// ---------------------------------------------------------------------------
// merging (a PC and the server both changed)
// ---------------------------------------------------------------------------
function merge(kind: DataKind, local: any, remote: any): any {
  if (kind === "profile") {
    const out: Record<string, string> = {};
    for (const k of PROFILE_KEYS) out[k] = local?.[k] || remote?.[k] || "";   // this PC's text wins, gaps are filled
    return out;
  }
  if (kind === "settings") return { ...(remote || {}), ...(local || {}) };
  const byId = new Map<string, any>();
  for (const e of [...(Array.isArray(remote) ? remote : []), ...(Array.isArray(local) ? local : [])]) {
    byId.set(String(e.id ?? e.timestamp), e);                                  // the local copy replaces the server's
  }
  return [...byId.values()].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)).slice(0, HISTORY_MAX);
}

async function applyLocal(kind: DataKind, data: any): Promise<void> {
  const store = useStore.getState();
  // What this PC will read back after saving: remembered BEFORE the save, because the main process announces the save
  // ("data-changed") ahead of the save call returning - without this the app would send what it just received straight
  // back to the server.
  if (kind === "profile") {
    const full: Record<string, string> = {};
    for (const k of PROFILE_KEYS) full[k] = typeof data?.[k] === "string" ? data[k] : "";
    lastSynced.profile = JSON.stringify(full);
    await window.ghostly.saveProfile(data);
    store.setSavedProfile(data);
  } else if (kind === "settings") {
    const next = { ...store.settings, ...data };
    lastSynced.settings = JSON.stringify(pick(next, SETTINGS_KEYS));
    store.setSettings(next);
    await window.ghostly.saveSettings(next);
    if (typeof data.opacity === "number") window.ghostly.setOpacity(Math.min(Math.max(data.opacity, 0.2), 1));
  } else {
    lastSynced.history = JSON.stringify(cleanHistory(data));
    store.setHistory(data);
    await window.ghostly.saveHistory(data);
  }
}

// ---------------------------------------------------------------------------
// the sync itself
// ---------------------------------------------------------------------------
let active: string | null = null;
let offListener: (() => void) | null = null;
const timers: Partial<Record<DataKind, ReturnType<typeof setTimeout>>> = {};
const lastSynced: Partial<Record<DataKind, string>> = {};   // JSON of what the server holds (to ignore echoes and no-ops)
let chain: Promise<unknown> = Promise.resolve();            // one request at a time: pushes never overlap a pull

const enabled = () => useStore.getState().settings.cloudSync !== false;
const serial = <T>(fn: () => Promise<T>): Promise<T> => { const run = chain.then(fn, fn); chain = run.catch(() => undefined); return run; };

async function push(uid: string, kind: DataKind, retry = true): Promise<boolean> {
  if (uid !== active || !enabled()) return false;
  const meta = readMeta(uid);
  const data = await localSnapshot(kind);
  try {
    const saved = await apiFetch<{ version: number }>(`/me/data/${kind}`, {
      method: "PUT", body: { data, base_version: meta[kind].version }, timeoutMs: 20000,
    });
    meta[kind] = { version: saved.version, dirty: false };
    writeMeta(uid, meta);
    lastSynced[kind] = JSON.stringify(data);
    return true;
  } catch (err) {
    if (err instanceof ApiError && err.status === 409 && retry) {
      const current: Remote | undefined = err.body?.current;
      if (current) {
        const merged = merge(kind, data, current.data);
        await applyLocal(kind, merged);
        meta[kind] = { version: current.version, dirty: true };
        writeMeta(uid, meta);
        return push(uid, kind, false);
      }
    }
    meta[kind].dirty = true;   // offline, 5xx, rate-limited: the next change or start tries again
    writeMeta(uid, meta);
    return false;
  }
}

function schedulePush(uid: string, kind: DataKind): void {
  if (timers[kind]) clearTimeout(timers[kind]);
  timers[kind] = setTimeout(() => { delete timers[kind]; void serial(() => push(uid, kind)); }, PUSH_DELAY_MS);
}

async function onLocalChange(uid: string, kind: DataKind): Promise<void> {
  if (uid !== active || !enabled()) return;
  const snapshot = JSON.stringify(await localSnapshot(kind));
  if (snapshot === lastSynced[kind]) return;          // our own echo, or a save that changed nothing shareable
  const meta = readMeta(uid);
  meta[kind].dirty = true;
  writeMeta(uid, meta);
  schedulePush(uid, kind);
}

async function reconcile(uid: string): Promise<void> {
  let remote: Record<DataKind, Remote>;
  try {
    remote = await apiFetch<Record<DataKind, Remote>>("/me/data", { timeoutMs: 20000 });
  } catch {
    return;   // offline, or the sign-in is not valid (the app handles that elsewhere): work from this PC's copy
  }
  const meta = readMeta(uid);
  for (const kind of KINDS) {
    const server = remote[kind];
    const local = await localSnapshot(kind);
    if (!server || server.data === null || server.data === undefined) {
      if (hasContent(kind, local) || meta[kind].dirty) { meta[kind] = { version: 0, dirty: true }; writeMeta(uid, meta); await push(uid, kind); }
      continue;
    }
    if (server.version === meta[kind].version && !meta[kind].dirty) { lastSynced[kind] = JSON.stringify(local); continue; }
    const neverSynced = meta[kind].version === 0;
    const useServerOnly = kind === "settings" ? neverSynced && !meta[kind].dirty : !hasContent(kind, local) && !meta[kind].dirty;
    if (useServerOnly || (!meta[kind].dirty && !neverSynced)) {
      await applyLocal(kind, server.data);
      meta[kind] = { version: server.version, dirty: false };
      writeMeta(uid, meta);
      lastSynced[kind] = JSON.stringify(await localSnapshot(kind));
    } else {
      const merged = merge(kind, local, server.data);
      await applyLocal(kind, merged);
      meta[kind] = { version: server.version, dirty: true };
      writeMeta(uid, meta);
      await push(uid, kind);
    }
  }
}

async function clearPersonalData(): Promise<void> {
  const store = useStore.getState();
  await window.ghostly.saveProfile(null).catch(() => {});
  await window.ghostly.saveHistory([]).catch(() => {});
  store.setHistory([]);
  const empty: Record<string, string> = {};
  for (const k of PROFILE_KEYS) empty[k] = "";
  store.setSavedProfile(empty as any);
}

/** Starts (or restarts) the sync for the signed-in account; returns the stop function. Safe to call repeatedly. */
export async function startCloudSync(uid: string): Promise<() => void> {
  stopCloudSync();
  let previous: string | null = null;
  try { previous = localStorage.getItem(LAST_USER_KEY); } catch { /* ignore */ }
  if (previous && previous !== uid) await clearPersonalData();   // somebody else used this PC: none of it is this account's
  try { localStorage.setItem(LAST_USER_KEY, uid); } catch { /* ignore */ }
  active = uid;
  offListener = window.ghostly.onDataChanged?.((kind) => { void onLocalChange(uid, kind); }) ?? null;
  if (enabled()) await serial(() => reconcile(uid));
  return stopCloudSync;
}

export function stopCloudSync(): void {
  active = null;
  offListener?.();
  offListener = null;
  for (const k of KINDS) { if (timers[k]) clearTimeout(timers[k]); delete timers[k]; }
}

/** Before signing out: save what is waiting, then - only if everything reached the server - clear the personal data
 *  from this PC (the next sign-in, here or on another PC, brings it back). Never blocks sign-out for long. */
export async function prepareSignOut(): Promise<void> {
  const uid = active;
  if (!uid || !enabled()) return;
  try {
    const done = await Promise.race([
      serial(async () => {
        let ok = true;
        for (const kind of KINDS) {
          if (readMeta(uid)[kind].dirty || timers[kind]) { if (timers[kind]) clearTimeout(timers[kind]); delete timers[kind]; ok = (await push(uid, kind)) && ok; }
        }
        return ok;
      }),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 8000)),
    ]);
    if (done) await clearPersonalData();
  } catch { /* keep everything on this PC */ }
  stopCloudSync();
}

/** "Delete my saved data": forgets the server copy (this PC keeps its own until the next sign-out). */
export async function deleteServerCopy(): Promise<boolean> {
  try {
    await apiFetch("/me/data", { method: "DELETE" });
    const uid = active;
    if (uid) {   // the server starts again from nothing: the next save names version 0
      writeMeta(uid, { profile: { version: 0, dirty: false }, settings: { version: 0, dirty: false }, history: { version: 0, dirty: false } });
      for (const k of KINDS) delete lastSynced[k];
    }
    return true;
  } catch {
    return false;
  }
}
