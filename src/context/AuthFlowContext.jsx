import { createContext, useContext, useEffect, useState, useRef } from 'react'
import supabase from '../lib/supabaseClient.js'

const STORAGE_KEY = 'mallucupid.authFlow'

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
  const userRef = useRef(null)

  // Load initial state: prefer Supabase when configured and user is signed in
  useEffect(() => {
    let mounted = true
    async function load() {
      if (!supabase) {
        try {
          const raw = sessionStorage.getItem(STORAGE_KEY)
          if (raw && mounted) setState((s) => ({ ...s, ...JSON.parse(raw) }))
        } catch {
          // ignore
        }
        return
      }

      try {
        const { data: userData } = await supabase.auth.getUser()
        const user = userData?.user ?? null
        userRef.current = user
        if (!user) {
          const raw = sessionStorage.getItem(STORAGE_KEY)
          if (raw && mounted) setState((s) => ({ ...s, ...JSON.parse(raw) }))
          return
        }

        const { data, error } = await supabase
          .from('app_user_state')
          .select('state')
          .eq('user_id', user.id)
          .single()

        if (!error && data?.state && mounted) {
          setState((s) => ({ ...s, ...data.state }))
        }
      } catch (e) {
        // fallback to sessionStorage
        try {
          const raw = sessionStorage.getItem(STORAGE_KEY)
          if (raw && mounted) setState((s) => ({ ...s, ...JSON.parse(raw) }))
        } catch {
          // ignore
        }
      }
    }
    load()
    return () => {
      mounted = false
    }
  }, [])

  // Persist state: to Supabase when user available, otherwise sessionStorage
  useEffect(() => {
    let mounted = true
    async function persist() {
      if (!supabase) {
        try {
          sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state))
        } catch {
          // ignore
        }
        return
      }

      try {
        const { data: userData } = await supabase.auth.getUser()
        const user = userData?.user ?? null
        if (!user) {
          // no user: fallback to sessionStorage
          try {
            sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state))
          } catch {}
          return
        }

        // upsert state into app_user_state table
        await supabase.from('app_user_state').upsert({ user_id: user.id, state })
      } catch (e) {
        try {
          sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state))
        } catch {}
      }
    }
    // debounce slightly to avoid excessive writes
    const id = setTimeout(() => {
      persist()
    }, 400)
    return () => clearTimeout(id)
  }, [state])

  function update(patch) {
    setState((prev) => ({ ...prev, ...patch }))
  }

  function reset() {
    setState(defaultState)
    try {
      sessionStorage.removeItem(STORAGE_KEY)
    } catch {
      // ignore
    }
    if (supabase) {
      ;(async () => {
        try {
          const { data: userData } = await supabase.auth.getUser()
          const user = userData?.user ?? null
          if (user) await supabase.from('app_user_state').delete().eq('user_id', user.id)
        } catch {}
      })()
    }
  }

  return (
    <AuthFlowContext.Provider value={{ ...state, update, reset }}>
      {children}
    </AuthFlowContext.Provider>
  )
}

export function useAuthFlow() {
  const ctx = useContext(AuthFlowContext)
  if (!ctx) throw new Error('useAuthFlow must be used inside AuthFlowProvider')
  return ctx
}
