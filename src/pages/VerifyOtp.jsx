import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import AuthLayout from '../components/AuthLayout.jsx'
import PageTransition from '../components/PageTransition.jsx'
import OtpInput from '../components/OtpInput.jsx'
import { useAuthFlow } from '../context/AuthFlowContext.jsx'
import { sendOtp, verifyOtp } from '../lib/mockApi.js'

const RESEND_SECONDS = 60

export default function VerifyOtp() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { update } = useAuthFlow()

  const flow = searchParams.get('flow') === 'signup' ? 'signup' : 'signin'
  const identifier = searchParams.get('identifier') || ''

  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [resending, setResending] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState(RESEND_SECONDS)

  // redirect back if this page was opened without going through sign in/up
  useEffect(() => {
    if (!identifier) navigate(flow === 'signup' ? '/signup' : '/signin', { replace: true })
  }, [identifier, flow, navigate])

  useEffect(() => {
    if (secondsLeft <= 0) return
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000)
    return () => clearTimeout(t)
  }, [secondsLeft])

  async function handleResend() {
    setResending(true)
    setError('')
    await sendOtp(identifier)
    setResending(false)
    setSecondsLeft(RESEND_SECONDS)
    setCode('')
  }

  async function handleVerify(e) {
    e.preventDefault()
    if (code.length !== 6) {
      setError('Enter all 6 digits.')
      return
    }
    setVerifying(true)
    const { valid } = await verifyOtp(identifier, code)
    setVerifying(false)

    if (!valid) {
      setError('The code you entered is incorrect. Try again.')
      return
    }

    update({ otpVerified: true, flow })
    if (flow === 'signup') {
      navigate('/onboarding/profile')
    } else {
      navigate('/dashboard')
    }
  }

  const mins = String(Math.floor(secondsLeft / 60)).padStart(1, '0')
  const secs = String(secondsLeft % 60).padStart(2, '0')

  return (
    <PageTransition>
      <AuthLayout
        showBack
        backTo={flow === 'signup' ? '/signup' : '/signin'}
        eyebrow="Verify it's you"
        title="Enter the code"
        subtitle={identifier ? `We sent a 6-digit code to ${identifier}.` : 'Enter your 6-digit code.'}
      >
        <form onSubmit={handleVerify} noValidate className="space-y-6">
          <OtpInput
            value={code}
            onChange={(v) => {
              setCode(v)
              if (error) setError('')
            }}
            error={!!error}
          />
          {error && <p className="text-xs text-coral -mt-3">{error}</p>}

          <button
            type="submit"
            disabled={verifying}
            className="w-full rounded-full bg-gold text-bg font-semibold py-3.5 hover:bg-cream transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {verifying ? 'Verifying…' : 'Verify OTP'}
          </button>
        </form>

        <div className="text-center text-sm text-muted mt-8">
          {secondsLeft > 0 ? (
            <span>
              Resend OTP in{' '}
              <span className="font-mono text-cream/80">
                {mins}:{secs}
              </span>
            </span>
          ) : (
            <button
              type="button"
              onClick={handleResend}
              disabled={resending}
              className="text-gold font-medium hover:text-cream transition-colors disabled:opacity-60"
            >
              {resending ? 'Resending…' : 'Resend OTP'}
            </button>
          )}
        </div>
      </AuthLayout>
    </PageTransition>
  )
}
