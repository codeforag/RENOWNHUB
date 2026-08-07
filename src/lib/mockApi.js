// Mock backend calls. Swap these for real API requests once the backend
// exists — every function returns a Promise so the call sites don't change.

import supabase from './supabaseClient.js'

/**
 * Production-ready backend helpers. These functions require a configured
 * Supabase client via `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
 *
 * NOTE: All mock/demo fallbacks have been removed. If Supabase is not
 * configured these functions will throw — this ensures the app is not
 * running against demo data in production.
 */

if (!supabase) {
  const missing = new Error(
    'Supabase not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.'
  )
  missing.name = 'SupabaseNotConfigured'
  throw missing
}

export async function checkUsernameAvailability(username) {
  const name = (username || '').toLowerCase()
  const { data, error } = await supabase
    .from('users')
    .select('username')
    .ilike('username', name)
    .limit(1)

  if (error) throw error
  return { available: !data || data.length === 0 }
}

export async function isReservedUsername(name) {
  const { data, error } = await supabase
    .from('reserved_usernames')
    .select('username')
    .ilike('username', name)
    .limit(1)
  if (error) throw error
  return data && data.length > 0
}

export async function fetchSomeMockData() {
  // Keep a simple health check helper that reads app_health
  const { data, error } = await supabase.from('app_health').select('ok').limit(1)
  if (error) throw error
  return data?.[0] ?? { ok: true }
}

// OTP flows and demo SMS have been removed. Use Supabase auth (magic link)
// or implement your preferred SMS provider in a server-side function.
