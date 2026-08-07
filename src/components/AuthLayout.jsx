import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'

/**
 * Shared chrome for every sign-in / sign-up / onboarding screen:
 * the spotlight backdrop, the MALLU CUPID logo, an optional back button,
 * and an optional step indicator for multi-step flows.
 */
export default function AuthLayout({
  children,
  showBack = true,
  backTo = null,
  step = null, // { current: 1, total: 3 }
  eyebrow = '',
  title,
  subtitle,
  width = 'max-w-md',
}) {
  const navigate = useNavigate()

  function handleBack() {
    if (backTo) navigate(backTo)
    else navigate(-1)
  }

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center px-6 py-16 overflow-hidden">
      {/* ambient spotlight backdrop, echoes the landing page hero */}
      <div
        className="absolute left-1/2 top-0 -z-0 h-[700px] w-[900px] -translate-x-1/2 opacity-30 blur-3xl"
        style={{
          background:
            'radial-gradient(circle at 50% 0%, #F0B429, transparent 65%)',
        }}
      />
      <div className="absolute inset-0 -z-0 bg-[radial-gradient(circle_at_20%_100%,rgba(255,107,91,0.08),transparent_45%)]" />

      <div className="relative w-full flex items-center justify-between max-w-5xl mb-10">
        <Link to="/" className="flex items-center gap-2 font-display text-xl tracking-tight">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-gold shadow-glow animate-pulse-glow" />
          MALLU CUPID
        </Link>

        {step && (
          <div className="hidden sm:flex items-center gap-2">
            {Array.from({ length: step.total }).map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i < step.current ? 'bg-gold w-8' : 'bg-white/15 w-4'
                }`}
              />
            ))}
            <span className="ml-2 text-xs font-mono text-muted">
              {step.current}/{step.total}
            </span>
          </div>
        )}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className={`relative w-full ${width}`}
      >
        <div className="relative rounded-3xl border border-white/10 bg-bgAlt/80 backdrop-blur-xl p-8 sm:p-10 shadow-2xl [perspective:1200px]">
          {showBack && (
            <button
              type="button"
              onClick={handleBack}
              aria-label="Go back"
              className="absolute -top-5 -left-2 sm:left-0 h-10 w-10 rounded-full border border-white/15 bg-bg flex items-center justify-center text-cream/80 hover:text-gold hover:border-gold/50 transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path
                  d="M10 3L5 8L10 13"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          )}

          {eyebrow && (
            <p className="font-mono text-[11px] tracking-[0.3em] text-gold uppercase mb-3">
              {eyebrow}
            </p>
          )}
          {title && (
            <h1 className="font-display text-3xl sm:text-4xl leading-tight mb-2 text-balance">
              {title}
            </h1>
          )}
          {subtitle && <p className="text-muted text-sm mb-8">{subtitle}</p>}

          {children}
        </div>
      </motion.div>
    </div>
  )
}
