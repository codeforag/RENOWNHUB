import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'

const particles = Array.from({ length: 14 }, (_, i) => ({
  id: i,
  left: Math.round(Math.random() * 100),
  top: Math.round(Math.random() * 100),
  size: 2 + Math.round(Math.random() * 3),
  delay: Math.random() * 6,
  duration: 5 + Math.random() * 4,
}))

export default function Hero() {
  return (
    <section id="top" className="relative min-h-screen flex items-center overflow-hidden pt-24">
      {/* stage floor glow */}
      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-gold/10 via-transparent to-transparent" />

      {/* rotating spotlight cone, built from conic-gradient, tilted in 3D */}
      <div
        className="absolute left-1/2 top-1/2 -z-0 h-[900px] w-[900px] -translate-x-1/2 -translate-y-1/2 animate-spin-slow opacity-40"
        style={{
          background:
            'conic-gradient(from 90deg at 50% 50%, transparent 0deg, rgba(240,180,41,0.35) 8deg, transparent 20deg, transparent 340deg)',
          filter: 'blur(6px)',
          transform: 'perspective(700px) rotateX(55deg)',
        }}
      />

      {/* drifting particles */}
      {particles.map((p) => (
        <span
          key={p.id}
          className="absolute rounded-full bg-gold/70 animate-drift"
          style={{
            left: `${p.left}%`,
            top: `${p.top}%`,
            width: p.size,
            height: p.size,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            boxShadow: '0 0 10px rgba(240,180,41,0.8)',
          }}
        />
      ))}

      <div className="relative max-w-6xl mx-auto px-6 grid md:grid-cols-[1.2fr_0.8fr] gap-16 items-center">
        <div>
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.6 }}
            className="font-mono text-xs tracking-[0.3em] text-gold uppercase mb-6"
          >
            Creator OS
          </motion.p>

          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            className="font-display font-medium text-balance text-5xl sm:text-6xl lg:text-7xl leading-[1.02] mb-8"
          >
            Turn your
            <br />
            following into
            <br />
            <span className="italic text-gold">a living.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.7 }}
            className="text-muted text-lg max-w-md mb-10"
          >
            Lumen gives creators the stage, the tools and the fans to build a
            real career out of what they already love making.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.55, duration: 0.7 }}
            className="flex flex-wrap items-center gap-4"
          >
            <Link
              to="/signin"
              className="bg-gold text-bg font-semibold px-7 py-3.5 rounded-full hover:bg-cream transition-colors shadow-glow"
            >
              Get Started
            </Link>
            <a
              href="#how-it-works"
              className="text-cream/90 font-medium px-7 py-3.5 rounded-full border border-white/15 hover:border-white/40 transition-colors"
            >
              See how it works
            </a>
          </motion.div>
        </div>

        {/* floating stat card, tilted for depth */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9, rotateY: -10 }}
          animate={{ opacity: 1, scale: 1, rotateY: 0 }}
          transition={{ delay: 0.5, duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          className="hidden md:block [perspective:1200px]"
        >
          <div className="relative rounded-3xl border border-white/10 bg-gradient-to-br from-bgAlt to-bgSoft p-8 shadow-2xl [transform:rotateY(-8deg)_rotateX(4deg)]">
            <div className="font-mono text-xs text-muted uppercase tracking-widest mb-2">
              Live on stage
            </div>
            <div className="font-display text-4xl mb-1">10,412</div>
            <div className="text-sm text-muted mb-6">creators earning today</div>
            <div className="h-px bg-white/10 mb-6" />
            <div className="flex items-end gap-1.5 h-20">
              {[40, 65, 50, 80, 60, 95, 70].map((h, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-t-sm bg-gradient-to-t from-gold/40 to-gold"
                  style={{ height: `${h}%` }}
                />
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
