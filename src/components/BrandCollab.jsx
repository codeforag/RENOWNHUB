import { useEffect, useRef, useState } from 'react'
import { motion, useInView } from 'framer-motion'

function CountUp({ to, suffix = '', duration = 1.6 }) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, amount: 0.6 })
  const [value, setValue] = useState(0)

  useEffect(() => {
    if (!inView) return
    let start = null
    function step(ts) {
      if (start === null) start = ts
      const progress = Math.min((ts - start) / (duration * 1000), 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setValue(Math.round(to * eased))
      if (progress < 1) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }, [inView, to, duration])

  return (
    <span ref={ref}>
      {value.toLocaleString()}
      {suffix}
    </span>
  )
}

const brandChips = [
  'Nova Skincare',
  'Wanderlust Travel',
  'Fitbyte',
  'Cedar & Co.',
  'Lumen Gaming',
  'Verve Audio',
  'Petal Studio',
  'Alt Coffee',
]

export default function BrandCollab() {
  return (
    <section className="relative py-32 border-t border-white/5 overflow-hidden">
      <div className="max-w-6xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.7 }}
          className="grid md:grid-cols-2 gap-12 items-end mb-16"
        >
          <div>
            <p className="font-mono text-xs tracking-[0.3em] text-gold uppercase mb-5">
              Collaborate with brands
            </p>
            <h2 className="font-display text-4xl sm:text-5xl leading-tight text-balance">
              Tell the stories of brands{' '}
              <span className="italic text-gold">you actually believe in.</span>
            </h2>
          </div>
          <div className="flex gap-10">
            <div>
              <div className="font-display text-5xl text-cream">
                <CountUp to={120} suffix="+" />
              </div>
              <div className="text-sm text-muted mt-1">brand partners</div>
            </div>
            <div>
              <div className="font-display text-5xl text-cream">
                <CountUp to={5} suffix="M+" />
              </div>
              <div className="text-sm text-muted mt-1">monthly visitors</div>
            </div>
          </div>
        </motion.div>
      </div>

      {/* scrolling brand marquee */}
      <div className="relative w-full overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)]">
        <div className="flex w-max gap-4 animate-[marquee_28s_linear_infinite]">
          {[...brandChips, ...brandChips].map((name, i) => (
            <span
              key={i}
              className="shrink-0 rounded-full border border-white/10 bg-bgAlt px-6 py-3 text-sm text-muted font-medium"
            >
              {name}
            </span>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes marquee {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
      `}</style>
    </section>
  )
}
