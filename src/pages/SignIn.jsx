import { useState, useEffect } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import AuthLayout from '../components/AuthLayout.jsx'
import PageTransition from '../components/PageTransition.jsx'
import TextField from '../components/TextField.jsx'
import OtpInput from '../components/OtpInput.jsx'
import { useAuthFlow } from '../context/AuthFlowContext.jsx'
import { sendOtp, verifyOtp } from '../lib/edgeApi.js'
import supabase from '../lib/supabaseClient.js'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function validateEmail(value) {
  if (!value.trim()) return 'Enter your email address to continue.'
  if (!EMAIL_RE.test(value)) return "That doesn't look like a valid email address."
  return ''
}

export default function SignIn() {
  const navigate = useNavigate()
  const location = useLocation()
  const { update } = useAuthFlow()
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // OTP step state
  const [step, setStep] = useState('form') // form | otp
  const [otp, setOtp] = useState('')
  const [otpError, setOtpError] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [resendTimer, setResendTimer] = useState(0)

  // Resend countdown
  useEffect(() => {
    if (resendTimer <= 0) return
    const t = setTimeout(() => setResendTimer((p) => p - 1), 1000)
    return () => clearTimeout(t)
  }, [resendTimer])

  async function handleSendOtp(e) {
    e.preventDefault()
    const validationError = validateEmail(email)
    if (validationError) {
      setError(validationError)
      return
    }
    setSubmitting(true)
    setError('')
    try {
      await sendOtp({ email, purpose: 'signin' })
      window.localStorage.setItem('mallucupid.lastAuthEmail', email)
      update({ flow: 'signin', identifier: email })
      setStep('otp')
      setResendTimer(60)
    } catch (err) {
      setError(err.message || 'Failed to send OTP')
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
      const result = await verifyOtp({ email, otp, purpose: 'signin' })
      if (result.success) {
        // Set the Supabase session if tokens returned
        if (result.access_token && result.refresh_token) {
          await supabase.auth.setSession({
            access_token: result.access_token,
            refresh_token: result.refresh_token,
          })
        }
        // Redirect based on role or location state
        const redirect = location.state?.redirect
        if (redirect) {
          navigate(redirect)
        } else if (result.role === 'creator') {
          navigate('/dashboard')
        } else {
          navigate('/dashboard')
        }
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
      await sendOtp({ email, purpose: 'signin' })
      setResendTimer(60)
    } catch (err) {
      setOtpError(err.message || 'Failed to resend')
    }
  }

  // ---- OTP STEP ----
  if (step === 'otp') {
    return (
      <PageTransition>
        <AuthLayout
          showBack
          backTo="/signin"
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
              {verifying ? 'Verifying...' : 'Sign In'}
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
        eyebrow="Welcome back"
        title="Sign in to MALLU CUPID"
        subtitle="Enter the email on your account."
      >
        <form onSubmit={handleSendOtp} noValidate className="space-y-6">
          <TextField
            label="Email address"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={error}
            autoFocus
          />

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-full bg-gold text-bg font-semibold py-3.5 hover:bg-cream transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {submitting ? 'Sending OTP...' : 'Send OTP'}
          </button>
        </form>

        <p className="text-center text-sm text-muted mt-8">
          New to MALLU CUPID?{' '}
          <Link to="/signup" className="text-gold font-medium hover:text-cream transition-colors">
            Create an account
          </Link>
        </p>
      </AuthLayout>
    </PageTransition>
  )
}
