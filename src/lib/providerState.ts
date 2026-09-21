import type { Settings } from "../store/useStore";

// A provider is "deactivated" when the user double-clicked its Active button in
// Settings: its key stays saved, but it is never used — not as the answering
// provider, and not as a quota/vision fallback either. Kept as a plain list on
// Settings (persisted with everything else) rather than a separate store so a
// missing field on older saved settings simply means "nothing deactivated".

export function isProviderDisabled(settings: Pick<Settings, "disabledProviders">, id: string): boolean {
  return !!settings.disabledProviders?.includes(id);
}

// The key for the provider that should answer right now, or null when the
// chosen provider has no key OR has been deactivated.
export function activeProviderKey(settings: Settings): string | null {
  const id = settings.activeProvider;
  if (isProviderDisabled(settings, id)) return null;
  const key = settings.apiKeys[id];
  return key && key.trim() ? key : null;
}

// Key map handed to streamWithFallback: deactivated providers are stripped so
// they can't be picked as a fallback either.
export function usableApiKeys(settings: Settings): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [id, key] of Object.entries(settings.apiKeys)) {
    if (key && key.trim() && !isProviderDisabled(settings, id)) out[id] = key;
  }
  return out;
}

// disabledProviders after making `id` active again.
export function withoutDisabled(settings: Pick<Settings, "disabledProviders">, id: string): string[] {
  return (settings.disabledProviders || []).filter((p) => p !== id);
}
