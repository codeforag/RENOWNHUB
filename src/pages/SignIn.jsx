import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AuthLayout from '../components/AuthLayout.jsx'
import PageTransition from '../components/PageTransition.jsx'
import TextField from '../components/TextField.jsx'
import { useAuthFlow } from '../context/AuthFlowContext.jsx'
import { sendOtp } from '../lib/mockApi.js'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const USERNAME_RE = /^[a-zA-Z0-9_.]{3,20}$/

function validateIdentifier(value) {
  if (!value.trim()) return 'Enter your email or username to continue.'
  if (value.includes('@') && !EMAIL_RE.test(value)) {
    return "That doesn't look like a valid email address."
  }
  if (!value.includes('@') && !USERNAME_RE.test(value)) {
    return '3–20 characters: letters, numbers, underscores or dots.'
  }
  return ''
}

export default function SignIn() {
  const navigate = useNavigate()
  const { update } = useAuthFlow()
  const [identifier, setIdentifier] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    const validationError = validateIdentifier(identifier)
    if (validationError) {
      setError(validationError)
      return
    }
    setSubmitting(true)
    await sendOtp(identifier)
    update({ flow: 'signin', identifier })
    setSubmitting(false)
    navigate(`/verify-otp?flow=signin&identifier=${encodeURIComponent(identifier)}`)
  }

  return (
    <PageTransition>
      <AuthLayout
        showBack
        backTo="/"
        eyebrow="Welcome back"
        title="Sign in to Lumen"
        subtitle="Enter the email or username on your account."
      >
        <form onSubmit={handleSubmit} noValidate className="space-y-6">
          <TextField
            label="Email or username"
            placeholder="you@example.com"
            value={identifier}
            onChange={(e) => {
              setIdentifier(e.target.value)
              if (error) setError('')
            }}
            error={error}
            autoFocus
          />

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-full bg-gold text-bg font-semibold py-3.5 hover:bg-cream transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {submitting ? 'Sending code…' : 'Next'}
          </button>
        </form>

        <p className="text-center text-sm text-muted mt-8">
          New to Lumen?{' '}
          <Link to="/signup" className="text-gold font-medium hover:text-cream transition-colors">
            Create an account
          </Link>
        </p>
      </AuthLayout>
    </PageTransition>
  )
}
