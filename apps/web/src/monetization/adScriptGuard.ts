/**
 * Ad-network loader scripts are meant to load once per page (#246):
 * GameScreen mounts/unmounts `<AdSlot placement="between-turns"/>` once per
 * AI turn, and without a guard each remount would re-fetch and re-execute
 * the loader — some networks double-initialize or flag it as an invalid
 * refresh. Tracked at module scope (not component state) so it survives
 * across every `<AdSlot/>` instance for the life of the page, the standard
 * pattern ad SDKs expect (load once; the SDK itself fills any ad container
 * that appears later).
 */
const injectedScriptUrls = new Set<string>()
const failedScriptUrls = new Set<string>()

/** Returns true the first time `scriptUrl` is claimed; false on every call
 * after, whether or not that first attempt goes on to succeed. */
export function claimScriptInjection(scriptUrl: string): boolean {
  if (injectedScriptUrls.has(scriptUrl)) return false
  injectedScriptUrls.add(scriptUrl)
  return true
}

export function markScriptFailed(scriptUrl: string): void {
  failedScriptUrls.add(scriptUrl)
}

export function hasScriptFailed(scriptUrl: string): boolean {
  return failedScriptUrls.has(scriptUrl)
}

/** Test-only: clear guard state between test cases. */
export function resetAdScriptGuard(): void {
  injectedScriptUrls.clear()
  failedScriptUrls.clear()
}
