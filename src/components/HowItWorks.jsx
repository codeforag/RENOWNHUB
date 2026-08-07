import { useRef } from 'react'
import { motion, useScroll, useSpring } from 'framer-motion'

const steps = [
  {
    n: '01',
    title: 'Sign up',
    body: 'Register and set up your free creator page — no waiting, no approval queue.',
  },
  {
    n: '02',
    title: 'Build your page',
    body: 'Add your info, set your membership tiers, and publish your first post, all in under a minute.',
  },
  {
    n: '03',
    title: 'Share & earn',
    body: 'Send your link out into the world. Most creators see their first sale within the day.',
  },
]

export default function HowItWorks() {
  const ref = useRef(null)
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start 0.8', 'end 0.3'],
  })
  const height = useSpring(scrollYProgress, { stiffness: 90, damping: 20 })

  return (
    <section id="how-it-works" className="relative py-32 px-6 border-t border-white/5">
      <div className="max-w-4xl mx-auto">
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.6 }}
          transition={{ duration: 0.6 }}
          className="font-mono text-xs tracking-[0.3em] text-gold uppercase mb-5"
        >
          How it works
        </motion.p>
        <motion.h2
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.6 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="font-display text-4xl sm:text-5xl leading-tight mb-20 text-balance"
        >
          Three steps between you{' '}
          <span className="italic text-gold">and your first fan.</span>
        </motion.h2>

        <div ref={ref} className="relative pl-14">
          {/* track */}
          <div className="absolute left-4 top-2 bottom-2 w-px bg-white/10" />
          {/* animated fill */}
          <motion.div
            className="absolute left-4 top-2 w-px bg-gold origin-top"
            style={{ scaleY: height, height: 'calc(100% - 16px)' }}
          />

          <div className="space-y-20">
            {steps.map((s) => (
              <motion.div
                key={s.n}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.6 }}
                transition={{ duration: 0.6 }}
                className="relative"
              >
                <span className="absolute -left-14 top-0 h-8 w-8 rounded-full bg-bg border border-gold/50 flex items-center justify-center font-mono text-xs text-gold">
                  {s.n}
                </span>
                <h3 className="font-display text-2xl mb-2">{s.title}</h3>
                <p className="text-muted max-w-md">{s.body}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
