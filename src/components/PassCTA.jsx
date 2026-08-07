import { useState } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import PassCard from './PassCard.jsx'

export default function PassCTA() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')

  function handleSubmit(e) {
    e.preventDefault()
    navigate('/signup', { state: { prefillEmail: email } })
  }

  return (
    <section id="pass" className="relative py-32 px-6 border-t border-white/5 overflow-hidden">
      <div
        className="absolute left-1/2 top-1/2 -z-0 h-[700px] w-[700px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-20 blur-3xl"
        style={{ background: 'radial-gradient(circle, #F0B429, transparent 70%)' }}
      />

      <div className="relative max-w-6xl mx-auto grid md:grid-cols-2 gap-16 items-center">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.7 }}
        >
          <p className="font-mono text-xs tracking-[0.3em] text-gold uppercase mb-5">
            Get your pass
          </p>
          <h2 className="font-display text-4xl sm:text-5xl leading-tight mb-6 text-balance">
            Let your influence{' '}
            <span className="italic text-gold">fund your passion.</span>
          </h2>
          <p className="text-muted text-lg max-w-md mb-10">
            Your pass is your key to the stage — a free page, a place for
            your fans, and every tool you need to get paid for what you
            already make.
          </p>

          <form
            onSubmit={handleSubmit}
            className="flex flex-col sm:flex-row gap-3 max-w-md"
          >
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="flex-1 rounded-full bg-bgAlt border border-white/15 px-5 py-3.5 text-sm placeholder:text-muted focus:outline-none focus:border-gold/60 transition-colors"
            />
            <button
              type="submit"
              className="rounded-full bg-gold text-bg font-semibold px-6 py-3.5 hover:bg-cream transition-colors whitespace-nowrap"
            >
              Get my pass
            </button>
          </form>
          <p className="text-xs text-muted/70 mt-4">
            Free to join. No credit card required.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        >
          <PassCard />
        </motion.div>
      </div>
    </section>
  )
}
