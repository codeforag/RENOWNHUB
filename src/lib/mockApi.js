// All backend calls now go through edge functions.
// This module re-exports the edge API for backward compatibility.
// NEVER trust the frontend — all validation is server-side.

export { checkUsernameAvailability } from './edgeApi.js'

/**
 * Health check — reads app_health table.
 * Kept for monitoring but all real data flows through edge functions.
 */
export async function fetchHealthCheck() {
  try {
    const { default: supabase } = await import('./supabaseClient.js')
    if (!supabase) return { ok: true }
    const { data } = await supabase.from('app_health').select('ok').limit(1)
    return data?.[0] ?? { ok: true }
  } catch {
    return { ok: false }
  }
}
