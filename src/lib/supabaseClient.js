import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

// Persistent session config — sessions survive refresh and never auto-logout
// until the user explicitly signs out. Auto-refresh tokens in the background.
const SESSION_OPTIONS = {
  persistSession: true,         // Store session in localStorage (survives refresh)
  autoRefreshToken: true,        // Refresh tokens before they expire
  detectSessionInUrl: true,       // Auto-handle magic-link redirects in URL
  flowType: 'pkce',              // PKCE flow — more secure than implicit
  storage: typeof window !== 'undefined' ? window.localStorage : undefined,
  storageKey: 'renownhub.auth.session', // Unique key — won't collide with other apps
  sessionTimeout: 0,             // No inactivity timeout (0 = never)
  realtime: { params: { eventsPerSecond: 1 } },
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
    storageKey: 'renownhub.auth.session',
  },
}

let supabase = null
if (url && key) {
  supabase = createClient(url, key, SESSION_OPTIONS)
} else {
  console.warn(
    'VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is not set. ' +
    'Auth and database calls will fail. Create a .env file (see .env.example).'
  )
}

export default supabase
