import { useLocation, Link } from 'react-router-dom'
import PageTransition from '../components/PageTransition.jsx'
import AuthLayout from '../components/AuthLayout.jsx'

export default function CheckEmail() {
  const { state } = useLocation()
  const email = state?.email || ''

  return (
    <PageTransition>
      <AuthLayout eyebrow="Check your inbox" title="Magic link sent" subtitle={`We sent a sign-in link to ${email}. Check your email to continue.`}>
        <div className="p-4 text-center">
          <p className="text-sm text-muted">If you don't see the email, check your spam folder or try again.</p>
          <div className="mt-6">
            <Link to="/signin" className="text-gold font-medium">Back to sign in</Link>
          </div>
        </div>
      </AuthLayout>
    </PageTransition>
  )
}
