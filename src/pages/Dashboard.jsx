import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import PageTransition from '../components/PageTransition.jsx'
import { useAuthFlow } from '../context/AuthFlowContext.jsx'

const STAT_CARDS = [
  { label: 'EARNED', value: '₹0' },
  { label: 'PAID', value: '₹0' },
  { label: 'BALANCE', value: '₹0' },
]

const DETAIL_ITEMS = [
  { label: 'Pending Orders', value: '0' },
  { label: 'Amount', value: '₹ 0/-' },
  { label: 'Your last post was', value: 'NA.' },
  { label: 'Your app has got', value: '0 visits so far' },
  { label: "0 fans have enabled your app's push notification", value: '' },
]

const FOOTER_ITEMS = [
  { label: 'Home', icon: 'M3 12h3m12 0h3M12 3v3m0 12v3', route: '/dashboard' },
  { label: 'Feed', icon: 'M4 7h16M4 12h16M4 17h16', route: null },
  { label: 'Post', icon: 'M12 5v14M5 12h14', route: '/dashboard/posts' },
  { label: 'Notifications', icon: 'M15 17h5l-1.405-1.405A2.032 2.032 0 0 1 18 14.158V11a6 6 0 1 0-12 0v3.159c0 .538-.214 1.055-.595 1.436L4 17h5', route: null },
  { label: 'Profile', icon: 'M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z', route: '/dashboard/profile' },
]

function displayName(fullName, signupUsername, sessionUser) {
  if (fullName) return fullName.split(' ')[0]
  if (signupUsername) return signupUsername
  if (sessionUser?.email) return sessionUser.email.split('@')[0]
  return 'Creator'
}

export default function Dashboard() {
  const navigate = useNavigate()
  const { fullName, signupUsername, session, user, authReady, signOut } = useAuthFlow()
  const [copied, setCopied] = useState(false)
  const [signingOut, setSigningOut] = useState(false)

  const name = displayName(fullName, signupUsername, user)
  const shareUrl = useMemo(
    () => (signupUsername ? `https://renownhub.bzeadecommerce.workers.dev/u/${signupUsername}` : ''),
    [signupUsername],
  )

  useEffect(() => {
    if (!authReady) return
    if (!user) {
      // Not signed in — redirect to sign in (preserve redirect)
      navigate('/signin', { replace: true, state: { redirect: '/dashboard' } })
      return
    }
  }, [authReady, user, navigate])

  async function handleSignOut() {
    setSigningOut(true)
    try {
      await signOut()
      navigate('/signin', { replace: true })
    } catch (err) {
      console.error('signOut error:', err)
      alert(`Sign out failed: ${err.message}`)
    } finally {
      setSigningOut(false)
    }
  }

  function copyLink() {
    if (!shareUrl) return
    navigator.clipboard.writeText(shareUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  // Wait for auth to be ready before rendering protected content
  if (!authReady) {
    return (
      <PageTransition>
        <div className="min-h-screen bg-slate-100 flex items-center justify-center px-4">
          <div className="text-center">
            <div className="animate-spin h-8 w-8 border-4 border-violet-600 border-t-transparent rounded-full mx-auto mb-4" />
            <p className="text-sm text-slate-500">Loading your dashboard…</p>
          </div>
        </div>
      </PageTransition>
    )
  }

  if (!user) {
    return null  // useEffect will redirect
  }

  return (
    <PageTransition>
      <div className="min-h-screen bg-slate-100 text-slate-900 pb-28">
        <div className="max-w-2xl mx-auto px-4 py-4 md:py-8">
          <header className="mb-4 flex items-center justify-between">
            <button
              type="button"
              className="rounded-3xl bg-white p-3 shadow-sm ring-1 ring-slate-200"
              aria-label="Menu"
            >
              <span className="block h-0.5 w-5 bg-slate-900 mb-1" />
              <span className="block h-0.5 w-5 bg-slate-900 mb-1" />
              <span className="block h-0.5 w-5 bg-slate-900" />
            </button>

            <div className="flex items-center gap-2">
              <span className="rounded-full bg-violet-700 px-3 py-2 text-[11px] font-semibold text-white">Live</span>
              <span className="rounded-full bg-orange-500 px-3 py-2 text-[11px] font-semibold text-white">Inbox</span>
              <button
                type="button"
                onClick={handleSignOut}
                disabled={signingOut}
                title="Sign out"
                className="rounded-3xl bg-white p-3 shadow-sm ring-1 ring-slate-200 hover:bg-red-50 transition disabled:opacity-50"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5 text-slate-900" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
              </button>
            </div>
          </header>

          <section className="mb-4 rounded-[2rem] bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <h2 className="text-lg font-semibold mb-3">How it works?</h2>
            <ul className="space-y-3 text-sm leading-6 text-slate-600">
              <li className="flex gap-3"><span className="mt-1 h-2.5 w-2.5 rounded-full bg-slate-900" />Copy the below link and put it in your Instagram Bio</li>
              <li className="flex gap-3"><span className="mt-1 h-2.5 w-2.5 rounded-full bg-slate-900" />Put a story everyday and promote your app on all social platforms</li>
              <li className="flex gap-3"><span className="mt-1 h-2.5 w-2.5 rounded-full bg-slate-900" />Let's start making some money!</li>
            </ul>
            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="break-words rounded-3xl bg-slate-100 px-4 py-3 text-sm text-slate-700 ring-1 ring-slate-200">
                {shareUrl || 'Set up your username to get your shareable link.'}
              </div>
              <button
                type="button"
                onClick={copyLink}
                disabled={!shareUrl}
                className="rounded-full bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {copied ? 'Copied!' : 'Copy Link'}
              </button>
            </div>
          </section>

          <section className="mb-4 overflow-hidden rounded-[2rem] bg-gradient-to-b from-sky-200 via-sky-100 to-slate-100 p-5 shadow-sm ring-1 ring-slate-200 relative">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.85),transparent_60%)]" />
            <div className="relative">
              <div className="flex items-center justify-between gap-3 mb-5">
                <div className="flex items-center gap-3">
                  <div className="h-16 w-16 rounded-full bg-slate-300" />
                  <div>
                    <div className="text-sm uppercase tracking-[0.35em] text-slate-700">{name.toUpperCase()}</div>
                    <Link
                      to="/dashboard/profile"
                      className="mt-1 text-sm font-semibold text-slate-800 underline-offset-4 hover:underline"
                    >
                      Edit Profile
                    </Link>
                  </div>
                </div>
                <div className="rounded-3xl bg-white/90 px-3 py-2 text-xs font-semibold text-slate-900">Live</div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                {STAT_CARDS.map((item) => (
                  <div key={item.label} className="rounded-3xl bg-slate-900/90 p-4 text-center text-white shadow-sm">
                    <div className="text-sm uppercase tracking-[0.25em] text-slate-300 mb-2">{item.label}</div>
                    <div className="text-xl font-semibold">{item.value}</div>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-center text-xs uppercase tracking-[0.3em] text-slate-600">
                Your next payout day is Sunday
              </p>
            </div>
          </section>

          <section className="mb-4 rounded-[2rem] bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <ul className="space-y-4 text-sm text-slate-700">
              {DETAIL_ITEMS.map((item) => (
                <li key={item.label} className="flex items-center gap-3">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-2xl bg-slate-100 text-slate-900">
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 6h16M4 10h16M4 14h8" />
                    </svg>
                  </span>
                  <div className="flex-1">
                    <div className="text-sm text-slate-500">{item.label}</div>
                    {item.value ? <div className="font-medium text-slate-900">{item.value}</div> : null}
                  </div>
                </li>
              ))}
            </ul>
            <div className="mt-5 border-t border-slate-200 pt-4 text-sm text-slate-600">
              <div className="font-semibold text-slate-900 mb-2">INSIGHTS</div>
              <p className="mb-2">See how you performed yesterday</p>
              <p>Analytics for the last one week</p>
            </div>
          </section>

          <section className="mb-6 rounded-[2rem] bg-emerald-600 p-5 text-white shadow-sm ring-1 ring-emerald-500/30">
            <div className="text-xs uppercase tracking-[0.35em] text-white/80 mb-3">WHATSAPP NOTIFICATIONS</div>
            <p className="text-sm leading-6">
              Enable whatsapp notifications to receive important updates directly on your whatsapp
            </p>
            <button
              type="button"
              className="mt-5 inline-flex rounded-full bg-white px-4 py-2 text-sm font-semibold text-emerald-600 shadow-sm hover:bg-slate-100"
            >
              Know More
            </button>
          </section>
        </div>

        <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-slate-200 bg-white/95 backdrop-blur-xl py-3">
          <div className="mx-auto flex max-w-md items-center justify-between px-4 text-slate-600">
            {FOOTER_ITEMS.map((item) => (
              <button key={item.label} type="button" onClick={() => item.route && navigate(item.route)} className="inline-flex flex-col items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-600 hover:text-violet-600 transition">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d={item.icon} />
                </svg>
                {item.label}
              </button>
            ))}
          </div>
        </nav>
      </div>
    </PageTransition>
  )
}
