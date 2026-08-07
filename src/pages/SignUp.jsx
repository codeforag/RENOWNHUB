import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import AuthLayout from '../components/AuthLayout.jsx'
import PageTransition from '../components/PageTransition.jsx'
import TextField from '../components/TextField.jsx'
import OtpInput from '../components/OtpInput.jsx'
import { useAuthFlow } from '../context/AuthFlowContext.jsx'
import { checkUsernameAvailability, sendOtp, verifyOtp } from '../lib/edgeApi.js'

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
  const { signupEmail, signupUsername, update } = useAuthFlow()
  const roleFromState = location.state?.role || 'creator'

  const [email, setEmail] = useState(signupEmail || location.state?.prefillEmail || '')
  const [emailError, setEmailError] = useState('')
  const [username, setUsername] = useState(signupUsername || '')
  const [usernameError, setUsernameError] = useState('')
  const [usernameStatus, setUsernameStatus] = useState('idle')
  const debounceRef = useRef(null)
  const [submitting, setSubmitting] = useState(false)

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
    if (!EMAIL_RE.test(email)) {
      setEmailError("That doesn't look like a valid email address.")
      hasError = true
    }
    if (!USERNAME_RE.test(username)) {
      setUsernameError('3-20 characters: letters, numbers, underscores or dots.')
      hasError = true
    } else if (usernameStatus === 'taken') {
      hasError = true
    } else if (usernameStatus === 'checking') {
      return
    }
    if (hasError) return

    setSubmitting(true)
    try {
      await sendOtp({ email, purpose: 'signup', role: roleFromState, username })
      window.localStorage.setItem('mallucupid.lastAuthEmail', email)
      update({ flow: 'signup', signupEmail: email, signupUsername: username, signupRole: roleFromState })
      setStep('otp')
      setResendTimer(60)
    } catch (err) {
      setEmailError(err.message || 'Failed to send OTP')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleVerifyOtp() {
    if (otp.length !== 6) {
      setOtpError('Enter the 6-digit code')
      return
    }
    setVerifying(true)
    setOtpError('')
    try {
      const result = await verifyOtp({ email, otp, purpose: 'signup' })
      if (result.success) {
        // OTP verified, user created server-side
        navigate('/onboarding/profile')
      }
    } catch (err) {
      setOtpError(err.message || 'Verification failed')
    } finally {
      setVerifying(false)
    }
  }

  async function handleResend() {
    if (resendTimer > 0) return
    try {
      await sendOtp({ email, purpose: 'signup', role: roleFromState, username })
      setResendTimer(60)
    } catch (err) {
      setOtpError(err.message || 'Failed to resend')
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
        eyebrow="Join MALLU CUPID"
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
            hint={usernameStatus === 'idle' && !usernameError ? 'This becomes your MALLU CUPID page link.' : undefined}
            trailing={usernameTrailing}
          />

          <button
            type="submit"
            disabled={submitting || usernameStatus === 'checking'}
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
