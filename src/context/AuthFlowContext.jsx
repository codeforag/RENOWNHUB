import { createContext, useContext, useEffect, useState, useRef } from 'react'
import supabase from '../lib/supabaseClient.js'

const STORAGE_KEY = 'renownhub.authFlow'

const defaultState = {
  flow: null, // 'signin' | 'signup'
  identifier: '', // email or username used to sign in
  signupEmail: '',
  signupUsername: '',

  fullName: '',
  bio: 'Welcome to my official app. Connect with me 1 on 1 and join my super fan club. I am excited to meet you all',
  themeColor: '#f1a2b5',
  services: [],
  memberships: [
    {
      id: 'm1',
      title: 'My Inner Circle',
      description:
        "Get access to my pro tips, exclusive discounts and content which I don't post anywhere else on the internet. Sneak peaks from my personal life, behind the scenes and more.",
      price: '499/-',
      subscribers: [],
    },
  ],
  liveEvents: [],
  gender: '',
  dob: '',
  categories: [],
  socials: {
    instagram: '',
    facebook: '',
    snapchat: '',
    youtube: '',
    x: '',
    threads: '',
    linkedin: '',
  },
}
const AuthFlowContext = createContext(null)

export function AuthFlowProvider({ children }) {
  const [state, setState] = useState(defaultState)
  const [session, setSession] = useState(null)
  const [authReady, setAuthReady] = useState(false)
  const userRef = useRef(null)

  // ---- INITIAL LOAD: read Supabase session (survives refresh) ----
  useEffect(() => {
    let mounted = true

    async function load() {
      // Load from sessionStorage first (instant paint)
      try {
        const raw = sessionStorage.getItem(STORAGE_KEY)
        if (raw && mounted) {
          setState((s) => ({ ...s, ...JSON.parse(raw) }))
        }
      } catch {
        // ignore
      }

      if (!supabase) {
        if (mounted) setAuthReady(true)
        return
      }

      try {
        // ---- CRITICAL: getSession() reads from localStorage — survives refresh ----
        const { data: { session: existingSession }, error: sessionErr } = await supabase.auth.getSession()
        if (sessionErr) {
          console.warn('getSession error:', sessionErr.message)
        }
        if (mounted) {
          setSession(existingSession)
          setAuthReady(true)
        }

        if (existingSession?.user) {
          userRef.current = existingSession.user
          // Try to load saved state from app_user_state table
          try {
            const { data, error } = await supabase
              .from('app_user_state')
              .select('state')
              .eq('user_id', existingSession.user.id)
              .maybeSingle()
            if (!error && data?.state && mounted) {
              setState((s) => ({ ...s, ...data.state }))
            }
            // Also load creator profile if available
            const { data: creator } = await supabase
              .from('creators')
              .select('username, display_name, bio, theme_color, social, categories')
              .eq('user_id', existingSession.user.id)
              .maybeSingle()
            if (creator && mounted) {
              setState((s) => ({
                ...s,
                signupUsername: creator.username || s.signupUsername,
                fullName: creator.display_name || s.fullName,
                bio: creator.bio || s.bio,
                themeColor: creator.theme_color || s.themeColor,
                socials: { ...s.socials, ...(creator.social || {}) },
                categories: creator.categories || s.categories,
              }))
            }
          } catch (e) {
            console.warn('app_user_state load failed:', e.message)
          }
        }
      } catch (e) {
        console.warn('AuthFlowProvider load error:', e.message)
        if (mounted) setAuthReady(true)
      }
    }
    load()

    // ---- LISTEN FOR SESSION CHANGES (auto-refresh, sign-in, sign-out) ----
    let unsubscribe
    if (supabase) {
      const { data: sub } = supabase.auth.onAuthStateChange(async (event, newSession) => {
        console.log('Auth state changed:', event)
        if (!mounted) return
        setSession(newSession)
        userRef.current = newSession?.user ?? null

        if (event === 'SIGNED_OUT') {
          // Clear local state on sign-out
          setState(defaultState)
          try { sessionStorage.removeItem(STORAGE_KEY) } catch {}
        } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          // Session is alive — make sure AuthFlowContext knows about the user
          if (newSession?.user && !userRef.current) {
            userRef.current = newSession.user
            // Trigger a reload of app_user_state
            try {
              const { data } = await supabase
                .from('app_user_state')
                .select('state')
                .eq('user_id', newSession.user.id)
                .maybeSingle()
              if (data?.state && mounted) {
                setState((s) => ({ ...s, ...data.state }))
              }
            } catch {}
          }
        }
      })
      unsubscribe = sub?.subscription?.unsubscribe
    }

    return () => {
      mounted = false
      if (unsubscribe) unsubscribe()
    }
  }, [])

  // ---- PERSIST STATE: to Supabase when user available, otherwise sessionStorage ----
  useEffect(() => {
    let mounted = true
    async function persist() {
      // Always write to sessionStorage (instant load next refresh)
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state))
      } catch {
        // ignore
      }

      if (!supabase || !session?.user) return

      try {
        await supabase.from('app_user_state').upsert({
          user_id: session.user.id,
          state,
        }, { onConflict: 'user_id' })
      } catch (e) {
        console.warn('app_user_state upsert failed:', e.message)
      }
    }
    // Debounce slightly to avoid excessive writes
    const id = setTimeout(() => { if (mounted) persist() }, 400)
    return () => { mounted = false; clearTimeout(id) }
  }, [state, session])

  function update(patch) {
    setState((prev) => ({ ...prev, ...patch }))
  }

  async function reset() {
    setState(defaultState)
    try { sessionStorage.removeItem(STORAGE_KEY) } catch {}
    if (supabase && session?.user) {
      try {
        await supabase.from('app_user_state').delete().eq('user_id', session.user.id)
      } catch {}
    }
  }

  async function signOut() {
    if (!supabase) return
    try {
      await supabase.auth.signOut()
    } catch (e) {
      console.warn('signOut error:', e.message)
    }
    setState(defaultState)
    try { sessionStorage.removeItem(STORAGE_KEY) } catch {}
    setSession(null)
    userRef.current = null
  }

  return (
    <AuthFlowContext.Provider value={{
      ...state,
      session,
      user: session?.user ?? null,
      authReady,
      update,
      reset,
      signOut,
    }}>
      {children}
    </AuthFlowContext.Provider>
  )
}

export function useAuthFlow() {
  const ctx = useContext(AuthFlowContext)
  if (!ctx) throw new Error('useAuthFlow must be used inside AuthFlowProvider')
  return ctx
}
