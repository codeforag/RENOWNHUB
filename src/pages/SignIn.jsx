import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import AuthLayout from '../components/AuthLayout.jsx'
import PageTransition from '../components/PageTransition.jsx'
import TextField from '../components/TextField.jsx'
import { useAuthFlow } from '../context/AuthFlowContext.jsx'
import supabase from '../lib/supabaseClient.js'

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
  const location = useLocation()
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
    if (!supabase) {
      setError('Supabase not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.')
      return
    }
    setSubmitting(true)
    try {
      // Use Supabase magic link for sign-in
      await supabase.auth.signInWithOtp({ email: identifier })
      update({ flow: 'signin', identifier })
      navigate('/check-email', { state: { email: identifier } })
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
          New to MALLU CUPID?{' '}
          <Link to="/signup" className="text-gold font-medium hover:text-cream transition-colors">
            Create an account
          </Link>
        </p>
      </AuthLayout>
    </PageTransition>
  )
}
