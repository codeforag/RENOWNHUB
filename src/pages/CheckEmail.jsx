import { useEffect, useState } from 'react'
import { useLocation, Link } from 'react-router-dom'
import PageTransition from '../components/PageTransition.jsx'
import AuthLayout from '../components/AuthLayout.jsx'
import { sendMagicLink } from '../lib/authClient.js'

export default function CheckEmail() {
  const { state } = useLocation()
  const initialEmail = state?.email || window.localStorage.getItem('mallucupid.lastAuthEmail') || ''
  const [email, setEmail] = useState(initialEmail)
  const [resendStatus, setResendStatus] = useState('idle')
  const [error, setError] = useState('')

  useEffect(() => {
    if (state?.email) {
      window.localStorage.setItem('mallucupid.lastAuthEmail', state.email)
    }
  }, [state?.email])

  async function handleResend() {
    if (!email) {
      setError('No email available to resend.')
      return
    }
    setResendStatus('sending')
    setError('')
    try {
      await sendMagicLink({ email })
      setResendStatus('sent')
      window.localStorage.setItem('mallucupid.lastAuthEmail', email)
    } catch (err) {
      setError(err.message || 'Failed to resend email.')
      setResendStatus('error')
    }
  }

  return (
    <PageTransition>
      <AuthLayout eyebrow="Check your inbox" title="Email sent" subtitle={`We sent a sign-in email to ${email}. Check your inbox to continue.`}>
        <div className="p-4 text-center space-y-4">
          <p className="text-sm text-muted">If you don't see the email, check your spam folder or tap resend.</p>
          {error ? <p className="text-sm text-red-400">{error}</p> : null}
          <button
            type="button"
            onClick={handleResend}
            disabled={resendStatus === 'sending' || !email}
            className="w-full rounded-full bg-gold text-bg font-semibold py-3.5 hover:bg-cream transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {resendStatus === 'sending'
              ? 'Resending…'
              : resendStatus === 'sent'
              ? 'Resent email'
              : 'Resend email'}
          </button>
          <div className="mt-6">
            <Link to="/signin" className="text-gold font-medium">Back to sign in</Link>
          </div>
        </div>
      </AuthLayout>
    </PageTransition>
  )
}
