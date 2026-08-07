import { motion } from 'framer-motion'

const nodes = [
  { x: 50, y: 50, r: 22, core: true },
  { x: 15, y: 20, r: 7 },
  { x: 85, y: 15, r: 6 },
  { x: 10, y: 70, r: 5 },
  { x: 90, y: 65, r: 8 },
  { x: 30, y: 90, r: 6 },
  { x: 70, y: 88, r: 5 },
  { x: 50, y: 10, r: 6 },
  { x: 8, y: 45, r: 5 },
  { x: 92, y: 40, r: 6 },
]

export default function Fanbase() {
  return (
    <section className="relative py-32 px-6 border-t border-white/5">
      <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-16 items-center">
        <div className="order-2 md:order-1 relative aspect-square [perspective:1200px]">
          <motion.svg
            viewBox="0 0 100 100"
            className="w-full h-full"
            initial={{ opacity: 0, rotateX: 20, rotateY: -10 }}
            whileInView={{ opacity: 1, rotateX: 12, rotateY: -6 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 1 }}
            style={{ transformStyle: 'preserve-3d' }}
          >
            {nodes.slice(1).map((n, i) => (
              <line
                key={i}
                x1="50"
                y1="50"
                x2={n.x}
                y2={n.y}
                stroke="#F0B429"
                strokeOpacity="0.25"
                strokeWidth="0.4"
              />
            ))}
            {nodes.map((n, i) => (
              <circle
                key={i}
                cx={n.x}
                cy={n.y}
                r={n.r / 4}
                fill={n.core ? '#F0B429' : '#FF6B5B'}
                className="animate-pulse-glow"
                style={{ animationDelay: `${i * 0.3}s` }}
              />
            ))}
          </motion.svg>
        </div>

        <motion.div
          className="order-1 md:order-2"
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.7 }}
        >
          <p className="font-mono text-xs tracking-[0.3em] text-gold uppercase mb-5">
            Build a loyal fanbase
          </p>
          <h2 className="font-display text-4xl sm:text-5xl leading-tight mb-6 text-balance">
            Meet the people who{' '}
            <span className="italic text-gold">show up for you.</span>
          </h2>
          <p className="text-muted text-lg max-w-md">
            Not just another follower count — real, direct lines to the fans
            who care about your work and want to support where it goes next.
          </p>
        </motion.div>
      </div>
    </section>
  )
}
