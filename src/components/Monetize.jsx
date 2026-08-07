import { motion } from 'framer-motion'
import TiltCard from './TiltCard.jsx'

const content = [
  { label: 'Photo sets', height: 'h-64' },
  { label: 'Video drops', height: 'h-80' },
  { label: 'Live sessions', height: 'h-72' },
  { label: 'Mini courses', height: 'h-60' },
]

export default function Monetize() {
  return (
    <section className="relative py-32 px-6 border-t border-white/5">
      <div className="max-w-6xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.7 }}
          className="max-w-xl mb-16"
        >
          <p className="font-mono text-xs tracking-[0.3em] text-gold uppercase mb-5">
            Monetize your creative work
          </p>
          <h2 className="font-display text-4xl sm:text-5xl leading-tight text-balance">
            Make what your audience wants —{' '}
            <span className="italic text-gold">not what's trending.</span>
          </h2>
        </motion.div>

        <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-5">
          {content.map((c, i) => (
            <motion.div
              key={c.label}
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.6, delay: i * 0.1 }}
              className={i % 2 === 1 ? 'sm:translate-y-8' : ''}
            >
              <TiltCard
                intensity={8}
                className={`rounded-2xl border border-white/10 bg-gradient-to-b from-bgAlt to-bgSoft p-5 flex flex-col justify-end ${c.height}`}
              >
                <div className="h-10 w-10 rounded-full bg-coral/20 border border-coral/40 mb-4" />
                <div className="font-display text-lg">{c.label}</div>
              </TiltCard>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
