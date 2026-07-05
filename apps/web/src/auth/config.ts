import type { SupabaseConfig } from './supabaseAuth'

/**
 * Reads the public Supabase config from Vite env. Returns null when unset so
 * single-player stays playable as a guest with no backend configured — the
 * account UI shows a "not configured" state instead of crashing the app.
 */
export function resolveSupabaseConfig(): SupabaseConfig | null {
  const url = import.meta.env.VITE_SUPABASE_URL
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  if (!url || !anonKey) return null
  return { url, anonKey }
}
