import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import AuthLayout from '../components/AuthLayout.jsx'
import PageTransition from '../components/PageTransition.jsx'
import TextField from '../components/TextField.jsx'
import OtpInput from '../components/OtpInput.jsx'
import { useAuthFlow } from '../context/AuthFlowContext.jsx'
import { checkUsernameAvailability, sendOtp, verifyOtp } from '../lib/edgeApi.js'
import supabase from '../lib/supabaseClient.js'

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

function GreenTickIcon() {
  return (
    <svg
      className="h-5 w-5 text-emerald-400"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-label="Username is available"
    >
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  )
}

function RedCrossIcon() {
  return (
    <svg
      className="h-5 w-5 text-coral"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-label="Username is taken"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  )
}

export default function SignUp() {
  const navigate = useNavigate()
  const location = useLocation()
  const { signupEmail, signupUsername, fullName, update } = useAuthFlow()
  const roleFromState = location.state?.role || 'creator'

  const [email, setEmail] = useState(signupEmail || location.state?.prefillEmail || '')
  const [emailError, setEmailError] = useState('')
  const [username, setUsername] = useState(signupUsername || '')
  const [usernameError, setUsernameError] = useState('')
  const [usernameStatus, setUsernameStatus] = useState('idle') // idle | checking | available | taken
  const debounceRef = useRef(null)
  const [submitting, setSubmitting] = useState(false)

  // Terms + age acceptance (required to submit)
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [acceptedAge, setAcceptedAge] = useState(false)
  const [termsError, setTermsError] = useState('')

  // OTP step state
  const [step, setStep] = useState('form') // form | otp
  const [otp, setOtp] = useState('')
  const [otpError, setOtpError] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [resendTimer, setResendTimer] = useState(0)

  // Username check via server-side edge function (never trust frontend)
  useEffect(() => {
    clearTimeout(debounceRef.current)
    if (!username) {
      setUsernameStatus('idle')
      setUsernameError('')
      return
    }
    if (!USERNAME_RE.test(username)) {
      setUsernameStatus('idle')
      setUsernameError('3-20 characters: letters, numbers, underscores or dots.')
      return
    }
    setUsernameError('')
    setUsernameStatus('checking')
    debounceRef.current = setTimeout(async () => {
      try {
        const result = await checkUsernameAvailability(username)
        setUsernameStatus(result.available ? 'available' : 'taken')
      } catch {
        setUsernameStatus('idle')
      }
    }, 500)
    return () => clearTimeout(debounceRef.current)
  }, [username])

  // Resend countdown timer
  useEffect(() => {
    if (resendTimer <= 0) return
    const t = setTimeout(() => setResendTimer((p) => p - 1), 1000)
    return () => clearTimeout(t)
  }, [resendTimer])

  async function handleSendOtp(e) {
    e?.preventDefault()
    let hasError = false

    // Email validation
    if (!EMAIL_RE.test(email)) {
      setEmailError("That doesn't look like a valid email address.")
      hasError = true
    }

    // Username validation
    if (!USERNAME_RE.test(username)) {
      setUsernameError('3-20 characters: letters, numbers, underscores or dots.')
      hasError = true
    } else if (usernameStatus === 'taken') {
      hasError = true
    } else if (usernameStatus === 'checking') {
      return // wait for the check to complete
    } else if (usernameStatus === 'idle') {
      // Force a fresh availability check before submit
      setUsernameStatus('checking')
      try {
        const result = await checkUsernameAvailability(username)
        setUsernameStatus(result.available ? 'available' : 'taken')
        if (!result.available) {
          setUsernameError(result.reason || 'This username is already taken.')
          return
        }
      } catch (err) {
        setUsernameError(`Could not verify username availability: ${err.message}`)
        return
      }
    }

    // Terms + age acceptance validation
    if (!acceptedTerms || !acceptedAge) {
      setTermsError('You must accept the Terms of Service, Privacy Policy, and confirm you are at least 18 years old to create an account.')
      hasError = true
    } else {
      setTermsError('')
    }

    if (hasError) return

    setSubmitting(true)
    try {
      // Send acceptance flags to the backend so they're recorded server-side
      await sendOtp({
        email,
        purpose: 'signup',
        role: roleFromState,
        username,
        acceptedTerms,
        acceptedAge,
      })
      window.localStorage.setItem('mallucupid.lastAuthEmail', email)
      update({
        flow: 'signup',
        signupEmail: email,
        signupUsername: username,
        signupRole: roleFromState,
        acceptedTerms,
        acceptedAge,
      })
      setStep('otp')
      setResendTimer(60)
    } catch (err) {
      console.error('send-otp signup error:', err)
      // Map known error codes to specific fields
      if (err.code === 'username_taken' || err.code === 'username_reserved') {
        setUsernameError(err.message)
        setUsernameStatus('taken')
      } else if (err.code === 'email_already_registered' || err.code === 'email_taken') {
        setEmailError(err.message)
      } else if (err.code === 'terms_not_accepted' || err.code === 'age_not_confirmed') {
        setTermsError(err.message)
      } else if (err.code === 'rate_limited_per_email') {
        setEmailError(`Too many codes requested. Please wait ${err.retry_after_seconds || 120} seconds before trying again.`)
      } else if (err.code === 'rate_limited_global') {
        setEmailError('Our email service is currently at capacity. Please try again in a few minutes.')
      } else {
        setEmailError(err.message || 'Failed to send verification code. Please try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  async function handleVerifyOtp() {
    if (otp.length !== 6) {
      setOtpError('Enter the 6-digit code from your email.')
      return
    }
    setVerifying(true)
    setOtpError('')
    try {
      const result = await verifyOtp({ email, otp, purpose: 'signup' })
      if (result.success) {
        // ---- CRITICAL: persist the session so the user is actually logged in ----
        if (result.access_token && result.refresh_token && supabase) {
          const { error: sessionErr } = await supabase.auth.setSession({
            access_token: result.access_token,
            refresh_token: result.refresh_token,
          })
          if (sessionErr) {
            console.error('setSession failed after signup:', sessionErr)
            setOtpError('Your account was created, but we could not sign you in automatically. Please sign in.')
            return
          }
          // Refresh the AuthFlowContext so it picks up the logged-in user
          update({
            flow: 'signup',
            signupEmail: email,
            signupUsername: result.username || username,
            signupRole: roleFromState,
            fullName: fullName || '',
          })
        }
        navigate('/onboarding/profile', {
          state: {
            role: result.role || roleFromState,
            username: result.username || username,
          },
        })
      } else {
        setOtpError(result.message || 'Verification failed. Please try again.')
      }
    } catch (err) {
      console.error('signup verify error:', err)
      // Specific handling for username conflict that happens at verify time
      // (race condition: another user grabbed the username between OTP-send and OTP-verify)
      if (err.code === 'username_taken' || err.code === 'username_reserved') {
        setOtpError(`${err.message} Go back to the form, pick a new username, and try again.`)
        // Also reset to the form step so they can pick a new username
        setTimeout(() => {
          setStep('form')
          setUsernameStatus('taken')
          setUsernameError(err.message)
          setOtp('')
        }, 2500)
        return
      }
      setOtpError(err.message || 'Verification failed. Please check your code and try again.')
    } finally {
      setVerifying(false)
    }
  }

  async function handleResend() {
    if (resendTimer > 0) return
    setOtpError('')
    try {
      await sendOtp({
        email,
        purpose: 'signup',
        role: roleFromState,
        username,
        acceptedTerms,
        acceptedAge,
      })
      setResendTimer(60)
      setOtpError('A new code has been sent. Check your inbox and spam folder.')
    } catch (err) {
      console.error('resend error:', err)
      if (err.code === 'rate_limited_per_email') {
        setOtpError(`Too many codes requested. Please wait ${err.retry_after_seconds || 120} seconds.`)
      } else if (err.code === 'username_taken' || err.code === 'username_reserved') {
        setOtpError(`${err.message} Go back to the form to pick a new username.`)
      } else {
        setOtpError(err.message || 'Could not resend the code. Please try again in a moment.')
      }
    }
  }

  // Trailing widget for the username field:
  // - idle: nothing
  // - checking: spinner
  // - available: GREEN TICK (large, prominent)
  // - taken: red cross + "taken" label
  const usernameTrailing =
    usernameStatus === 'checking' ? (
      <Spinner />
    ) : usernameStatus === 'available' ? (
      <span className="inline-flex items-center gap-1.5">
        <GreenTickIcon />
        <span className="text-xs font-mono text-emerald-400">available</span>
      </span>
    ) : usernameStatus === 'taken' ? (
      <span className="inline-flex items-center gap-1.5">
        <RedCrossIcon />
        <span className="text-xs font-mono text-coral">taken</span>
      </span>
    ) : null

  // ---- OTP STEP ----
  if (step === 'otp') {
    return (
      <PageTransition>
        <AuthLayout
          showBack
          backTo="/signup"
          eyebrow="Verify your email"
          title="Enter the 6-digit code"
          subtitle={`We sent it to ${email}`}
        >
          <div className="space-y-6">
            <OtpInput
              value={otp}
              onChange={(val) => { setOtp(val); if (otpError) setOtpError('') }}
              error={otpError}
              length={6}
            />

            <button
              onClick={handleVerifyOtp}
              disabled={verifying || otp.length !== 6}
              className="w-full rounded-full bg-gold text-bg font-semibold py-3.5 hover:bg-cream transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {verifying ? 'Verifying...' : 'Verify & Continue'}
            </button>

            <div className="text-center">
              <button
                type="button"
                onClick={handleResend}
                disabled={resendTimer > 0}
                className="text-sm text-muted hover:text-cream transition-colors disabled:opacity-50"
              >
                {resendTimer > 0 ? `Resend in ${resendTimer}s` : 'Resend code'}
              </button>
            </div>
          </div>
        </AuthLayout>
      </PageTransition>
    )
  }

  // ---- FORM STEP ----
  return (
    <PageTransition>
      <AuthLayout
        showBack
        backTo="/"
        eyebrow="Join RENOWNHUB"
        title="Create your account"
        subtitle="Free forever. Set up your creator page in minutes."
      >
        <form onSubmit={handleSendOtp} noValidate className="space-y-6">
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
            hint={usernameStatus === 'idle' && !usernameError ? 'This becomes your RENOWNHUB page link.' : undefined}
            trailing={usernameTrailing}
          />

          {/* Prominent availability banner (extra feedback when green tick is shown) */}
          {usernameStatus === 'available' && (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-2.5 text-emerald-400">
              <GreenTickIcon />
              <span className="text-sm font-medium">
                Great! <strong className="font-semibold">@{username}</strong> is available.
              </span>
            </div>
          )}

          {/* Terms + Privacy + 18+ acceptance checkboxes */}
          <div className={`rounded-xl border px-4 py-3.5 space-y-3 ${
            termsError
              ? 'border-coral/60 bg-coral/5'
              : 'border-white/15 bg-white/5'
          }`}>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={acceptedTerms}
                onChange={(e) => {
                  setAcceptedTerms(e.target.checked)
                  if (termsError) setTermsError('')
                }}
                className="mt-0.5 h-4 w-4 rounded border-white/30 bg-transparent text-gold focus:ring-gold/60"
              />
              <span className="text-xs text-muted leading-relaxed">
                I have read and agree to the{' '}
                <a
                  href="/terms"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gold font-medium hover:text-cream underline underline-offset-2"
                >
                  Terms of Service
                </a>{' '}and{' '}
                <a
                  href="/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gold font-medium hover:text-cream underline underline-offset-2"
                >
                  Privacy Policy
                </a>.
              </span>
            </label>

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={acceptedAge}
                onChange={(e) => {
                  setAcceptedAge(e.target.checked)
                  if (termsError) setTermsError('')
                }}
                className="mt-0.5 h-4 w-4 rounded border-white/30 bg-transparent text-gold focus:ring-gold/60"
              />
              <span className="text-xs text-muted leading-relaxed">
                I confirm that I am at least <strong className="text-cream">18 years old</strong>.
                RENOWNHUB is strictly for adults only.
              </span>
            </label>
          </div>
          {termsError && (
            <p className="text-xs text-coral -mt-3">{termsError}</p>
          )}

          <button
            type="submit"
            disabled={submitting || usernameStatus === 'checking' || !acceptedTerms || !acceptedAge}
            className="w-full rounded-full bg-gold text-bg font-semibold py-3.5 hover:bg-cream transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {submitting ? 'Sending OTP...' : 'Continue'}
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
