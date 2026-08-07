import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import AuthLayout from '../components/AuthLayout.jsx'
import PageTransition from '../components/PageTransition.jsx'
import TextField from '../components/TextField.jsx'
import { useAuthFlow } from '../context/AuthFlowContext.jsx'
import { sendMagicLink } from '../lib/authClient.js'

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

  async function handleSubmit(e) {
    e.preventDefault()
    const validationError = validateEmail(email)
    if (validationError) {
      setError(validationError)
      return
    }
    setSubmitting(true)
    try {
      await sendMagicLink({ email })
      window.localStorage.setItem('mallucupid.lastAuthEmail', email)
      update({ flow: 'signin', identifier: email })
      navigate('/check-email', { state: { email } })
    } catch (err) {
      setError(err.message || 'Sign-in failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <PageTransition>
      <AuthLayout
        showBack
        backTo="/"
        eyebrow="Welcome back"
        title="Sign in to MALLU CUPID"
        subtitle="Enter the email or username on your account."
      >
        <form onSubmit={handleSubmit} noValidate className="space-y-6">
          <TextField
              label="Email address"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
            }}
            error={error}
            autoFocus
          />

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-full bg-gold text-bg font-semibold py-3.5 hover:bg-cream transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {submitting ? 'Sending email…' : 'Send email'}
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
