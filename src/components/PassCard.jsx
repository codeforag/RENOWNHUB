import { useState } from 'react'
import { motion } from 'framer-motion'

export default function PassCard() {
  const [flipped, setFlipped] = useState(false)

  return (
    <div className="[perspective:1600px] w-[300px] sm:w-[340px] h-[440px] mx-auto select-none">
      <motion.div
        className="relative w-full h-full [transform-style:preserve-3d] cursor-pointer"
        animate={{ rotateY: flipped ? 180 : 0 }}
        transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        onClick={() => setFlipped((f) => !f)}
        whileHover={{ scale: 1.02 }}
      >
        {/* front face */}
        <div
          className="absolute inset-0 rounded-[28px] p-8 flex flex-col justify-between border border-gold/30 bg-gradient-to-br from-bgAlt via-bgSoft to-bg shadow-glow"
          style={{ backfaceVisibility: 'hidden' }}
        >
          <div className="flex items-start justify-between">
            <div>
              <div className="font-mono text-[10px] tracking-[0.3em] text-gold uppercase mb-1">
                Lumen Access
              </div>
              <div className="font-display text-2xl">Creator Pass</div>
            </div>
            <span className="h-9 w-9 rounded-full bg-gold/15 border border-gold/40" />
          </div>

          <div>
            <div className="h-10 w-14 rounded-md bg-gradient-to-br from-gold to-coral mb-6 opacity-90" />
            <div className="font-mono text-sm tracking-widest text-cream/80 mb-1">
              •••• •••• •••• 0142
            </div>
            <div className="flex items-center justify-between text-xs text-muted font-mono">
              <span>MEMBER SINCE 2026</span>
              <span>ALL ACCESS</span>
            </div>
          </div>

          <div className="text-[11px] text-muted/70 font-mono">
            tap to flip
          </div>
        </div>

        {/* back face */}
        <div
          className="absolute inset-0 rounded-[28px] p-8 flex flex-col justify-between border border-white/10 bg-gradient-to-br from-gold to-coral text-bg"
          style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
        >
          <div className="font-display text-2xl mb-2">What it unlocks</div>
          <ul className="space-y-3 text-sm font-medium">
            <li>— A free personal fan page, live in minutes</li>
            <li>— Brand collaboration invites</li>
            <li>— Subscriptions, DMs & live tipping</li>
            <li>— Priority placement to new fans</li>
          </ul>
          <div className="text-[11px] font-mono opacity-70">tap to flip back</div>
        </div>
      </motion.div>
    </div>
  )
}
