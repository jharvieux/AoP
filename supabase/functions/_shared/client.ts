import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@aop/shared'
import { AppError } from './http.ts'

// deno-lint-ignore no-explicit-any
const env = (key: string): string => {
  const value = (globalThis as any).Deno?.env.get(key)
  if (!value) throw new AppError('INTERNAL', `Missing environment variable ${key}`)
  return value
}

export type Db = SupabaseClient<Database>

/**
 * Service-role client — bypasses RLS by design (§4: every game-state write goes
 * through Edge Functions using the service role). Never expose this key or a
 * client built from it to a browser.
 */
export function serviceClient(): Db {
  return createClient<Database>(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/**
 * The authenticated caller's user id, derived server-side from the JWT — never
 * trusted from the request body (§5). A missing or invalid token is `FORBIDDEN`.
 */
export async function requireUserId(req: Request): Promise<string> {
  const authorization = req.headers.get('Authorization')
  if (!authorization) throw new AppError('FORBIDDEN', 'Missing Authorization header')
  const scoped = createClient<Database>(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await scoped.auth.getUser()
  if (error || !data.user) throw new AppError('FORBIDDEN', 'Invalid or expired session')
  return data.user.id
}

/**
 * Guards server-only functions (e.g. the turn-timer sweep, §8) that have no
 * user JWT to derive a seat from. By convention such callers (cron, another
 * trusted backend job) authenticate as the service role itself, bearing the
 * same key `serviceClient()` uses to bypass RLS.
 */
export function requireServiceRole(req: Request): void {
  const authorization = req.headers.get('Authorization')
  if (authorization !== `Bearer ${env('SUPABASE_SERVICE_ROLE_KEY')}`) {
    throw new AppError('FORBIDDEN', 'Service role required')
  }
}

/** Persist (or refresh) the caller's profile row so match FKs to `profiles` resolve. */
export async function ensureProfile(db: Db, userId: string, displayName: string): Promise<void> {
  const { error } = await db
    .from('profiles')
    .upsert({ id: userId, display_name: displayName }, { onConflict: 'id', ignoreDuplicates: true })
  if (error) throw new AppError('INTERNAL', `Could not persist profile: ${error.message}`)
}
