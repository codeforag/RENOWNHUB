import { createContext, useContext, useEffect, useState } from 'react'

const STORAGE_KEY = 'lumen.authFlow'

const defaultState = {
  flow: null, // 'signin' | 'signup'
  identifier: '', // email or username used to sign in
  signupEmail: '',
  signupUsername: '',
  otpVerified: false,
  fullName: '',
  bio: 'Welcome to my official app. Connect with me 1 on 1 and join my super fan club. I am excited to meet you all',
  themeColor: '#f1a2b5',
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

function loadInitial() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultState
    return { ...defaultState, ...JSON.parse(raw) }
  } catch {
    return defaultState
  }
}

const AuthFlowContext = createContext(null)

export function AuthFlowProvider({ children }) {
  const [state, setState] = useState(loadInitial)

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      // sessionStorage unavailable — non-fatal, flow just won't survive a refresh
    }
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
