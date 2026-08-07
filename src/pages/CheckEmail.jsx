import { useLocation, useNavigate } from 'react-router-dom'
import PageTransition from '../components/PageTransition.jsx'
import AuthLayout from '../components/AuthLayout.jsx'

export default function CheckEmail() {
  const { state } = useLocation()
  const navigate = useNavigate()
  const email = state?.email || window.localStorage.getItem('mallucupid.lastAuthEmail') || ''

  // The OTP flow is now inline in SignIn/SignUp. This page is a fallback redirect.
  // If a user lands here (e.g., old bookmark), redirect to signin with OTP step.
  return (
    <PageTransition>
      <AuthLayout
        eyebrow="Check your email"
        title="Email sent"
        subtitle={`We sent a 6-digit code to ${email}.`}
      >
        <div className="p-4 text-center space-y-4">
          <p className="text-sm text-muted">
            Enter the code on the sign-in page to continue.
          </p>
          <button
            type="button"
            onClick={() => navigate('/signin')}
            className="w-full rounded-full bg-gold text-bg font-semibold py-3.5 hover:bg-cream transition-colors"
          >
            Go to Sign In
          </button>
          <div className="mt-6">
            <button
              type="button"
              onClick={() => navigate('/signin')}
              className="text-gold font-medium"
            >
              Back to sign in
            </button>
          </div>
        </div>
      </AuthLayout>
    </PageTransition>
  )
}
