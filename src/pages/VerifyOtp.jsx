import PageTransition from '../components/PageTransition.jsx'
import AuthLayout from '../components/AuthLayout.jsx'
import { Link } from 'react-router-dom'

export default function VerifyOtp() {
  return (
    <PageTransition>
      <AuthLayout eyebrow="Use magic link" title="Verification moved to email" subtitle="This application uses email magic links for authentication. Check your email for the sign-in link.">
        <div className="p-4 text-center">
          <p className="text-sm text-muted">OTP-based sign-in has been removed. If you expected an OTP, please use the sign in form which sends a magic link.</p>
          <div className="mt-6">
            <Link to="/signin" className="text-gold font-medium">Back to sign in</Link>
          </div>
        </div>
      </AuthLayout>
    </PageTransition>
  )
}
