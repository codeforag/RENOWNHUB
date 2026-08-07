import { motion } from 'framer-motion'
import TiltCard from './TiltCard.jsx'

const streams = [
  { label: 'Subscriptions', detail: 'Monthly membership tiers' },
  { label: 'Direct messaging', detail: 'Paid 1:1 conversations' },
  { label: 'Live streaming', detail: 'Tips & live gifting' },
  { label: 'Freelance gigs', detail: 'Brand & fan commissions' },
]

export default function Income() {
  return (
    <section id="income" className="relative py-32 px-6 border-t border-white/5">
      <div className="max-w-6xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.7 }}
          className="max-w-xl mb-16"
        >
          <p className="font-mono text-xs tracking-[0.3em] text-gold uppercase mb-5">
            Recurring income
          </p>
          <h2 className="font-display text-4xl sm:text-5xl leading-tight text-balance">
            Income that doesn't stop{' '}
            <span className="italic text-gold">when you log off.</span>
          </h2>
        </motion.div>

        <div className="grid md:grid-cols-4 gap-5 mb-16">
          {streams.map((s, i) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ duration: 0.6, delay: i * 0.08 }}
            >
              <TiltCard className="rounded-2xl border border-white/10 bg-bgAlt p-6 h-48 flex flex-col justify-between">
                <span className="font-mono text-xs text-coral">
                  0{i + 1}
                </span>
                <div>
                  <div className="font-display text-xl mb-1">{s.label}</div>
                  <div className="text-sm text-muted">{s.detail}</div>
                </div>
              </TiltCard>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.7 }}
          className="flex flex-wrap gap-16 border-t border-white/10 pt-10"
        >
          <div>
            <div className="font-display text-5xl text-gold">$5M+</div>
            <div className="text-sm text-muted mt-1">paid out to creators</div>
          </div>
          <div>
            <div className="font-display text-5xl text-gold">10,000+</div>
            <div className="text-sm text-muted mt-1">creators earning</div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
