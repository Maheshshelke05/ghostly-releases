import type { Settings } from "../store/useStore";

// "Deactivated" (double-click on Active in Settings) keeps the key saved but never uses it,
// not even as a quota/vision fallback; the list lives on Settings so older saves mean none deactivated.
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
