import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import AuthLayout from '../components/AuthLayout.jsx'
import PageTransition from '../components/PageTransition.jsx'
import TextField from '../components/TextField.jsx'
import { useAuthFlow } from '../context/AuthFlowContext.jsx'
import { checkUsernameAvailability } from '../lib/mockApi.js'
import { sendMagicLink } from '../lib/authClient.js'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const USERNAME_RE = /^[a-zA-Z0-9_.]{3,20}$/

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4 text-muted" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  )
}

export default function SignUp() {
  const navigate = useNavigate()
  const location = useLocation()
  const { update } = useAuthFlow()
  const roleFromState = location.state?.role || 'creator'

  const [email, setEmail] = useState(location.state?.prefillEmail || '')
  const [emailError, setEmailError] = useState('')

  const [username, setUsername] = useState('')
  const [usernameError, setUsernameError] = useState('')
  const [usernameStatus, setUsernameStatus] = useState('idle') // idle | checking | available | taken
  const debounceRef = useRef(null)

  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    clearTimeout(debounceRef.current)
    if (!username) {
      setUsernameStatus('idle')
      setUsernameError('')
      return
    }
    if (!USERNAME_RE.test(username)) {
      setUsernameStatus('idle')
      setUsernameError('3–20 characters: letters, numbers, underscores or dots.')
      return
    }
    setUsernameError('')
    setUsernameStatus('checking')
    debounceRef.current = setTimeout(async () => {
      const { available } = await checkUsernameAvailability(username)
      setUsernameStatus(available ? 'available' : 'taken')
    }, 500)
    return () => clearTimeout(debounceRef.current)
  }, [username])

  async function handleSubmit(e) {
    e.preventDefault()
    let hasError = false

    if (!EMAIL_RE.test(email)) {
      setEmailError("That doesn't look like a valid email address.")
      hasError = true
    }
    if (!USERNAME_RE.test(username)) {
      setUsernameError('3–20 characters: letters, numbers, underscores or dots.')
      hasError = true
    } else if (usernameStatus === 'taken') {
      hasError = true
    } else if (usernameStatus === 'checking') {
      // wait for the in-flight check rather than submitting early
      return
    }
    if (hasError) return

    setSubmitting(true)
    try {
      await sendMagicLink({ email })
      window.localStorage.setItem('mallucupid.lastAuthEmail', email)
      update({ flow: 'signup', signupEmail: email, signupUsername: username, signupRole: roleFromState })
      navigate('/check-email', { state: { email } })
    } catch (err) {
      setError(err.message || 'Signup failed')
    } finally {
      setSubmitting(false)
    }
  }

  const usernameTrailing =
    usernameStatus === 'checking' ? (
      <Spinner />
    ) : usernameStatus === 'available' ? (
      <span className="text-xs font-mono text-emerald-400">available</span>
    ) : usernameStatus === 'taken' ? (
      <span className="text-xs font-mono text-coral">taken</span>
    ) : null

  return (
    <PageTransition>
      <AuthLayout
        showBack
        backTo="/"
        eyebrow="Join MALLU CUPID"
        title="Create your account"
        subtitle="Free forever. Set up your creator page in minutes."
      >
        <form onSubmit={handleSubmit} noValidate className="space-y-6">
          <TextField
            label="Email address"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value)
              if (emailError) setEmailError('')
            }}
            error={emailError}
            autoFocus
          />

          <TextField
            label="Username"
            placeholder="yourname"
            value={username}
            onChange={(e) => setUsername(e.target.value.trim())}
            error={usernameStatus === 'taken' ? 'That username is already taken.' : usernameError}
            hint={
              usernameStatus === 'idle' && !usernameError
                ? 'This becomes your MALLU CUPID page link.'
                : undefined
            }
            trailing={usernameTrailing}
          />

          <button
            type="submit"
            disabled={submitting || usernameStatus === 'checking'}
            className="w-full rounded-full bg-gold text-bg font-semibold py-3.5 hover:bg-cream transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {submitting ? 'Sending email…' : 'Continue'}
          </button>
        </form>

        <p className="text-center text-sm text-muted mt-8">
          Already have an account?{' '}
          <Link to="/signin" className="text-gold font-medium hover:text-cream transition-colors">
            Sign in
          </Link>
        </p>
      </AuthLayout>
    </PageTransition>
  )
}
