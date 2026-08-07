import { motion } from 'framer-motion'
import TiltCard from './TiltCard.jsx'

const platforms = [
  { name: 'Instagram', stat: 'Reels & Stories' },
  { name: 'TikTok', stat: 'Short-form video' },
  { name: 'YouTube', stat: 'Long-form & Shorts' },
  { name: 'Twitch', stat: 'Live streaming' },
]

export default function WhoFor() {
  return (
    <section id="for-creators" className="relative py-32 px-6">
      <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-16 items-center">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.7 }}
        >
          <p className="font-mono text-xs tracking-[0.3em] text-gold uppercase mb-5">
            Who it's for
          </p>
          <h2 className="font-display text-4xl sm:text-5xl leading-tight mb-6 text-balance">
            If people already show up for you,{' '}
            <span className="italic text-gold">you belong here.</span>
          </h2>
          <p className="text-muted text-lg max-w-md">
            It doesn't matter which platform grew your audience. If you've
            got a following that pays attention, MALLU CUPID turns it into
            something you can build a career on.
          </p>
        </motion.div>

        <div className="grid grid-cols-2 gap-5">
          {platforms.map((p, i) => (
            <motion.div
              key={p.name}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ duration: 0.6, delay: i * 0.1 }}
            >
              <TiltCard className="rounded-2xl border border-white/10 bg-bgAlt p-6 h-40 flex flex-col justify-between">
                <span className="h-8 w-8 rounded-full bg-gold/15 border border-gold/30" />
                <div>
                  <div className="font-display text-lg">{p.name}</div>
                  <div className="text-xs text-muted font-mono">{p.stat}</div>
                </div>
              </TiltCard>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
