import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'

export default function Nav() {
  return (
    <>
      <motion.header
        initial={{ y: -40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        className="fixed top-0 inset-x-0 z-50 backdrop-blur-md bg-bg/60 border-b border-white/5"
      >
        <nav className="max-w-6xl mx-auto flex items-center justify-between px-6 py-4">
          <a href="#top" className="flex items-center gap-2 font-display text-xl tracking-tight">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-gold shadow-glow animate-pulse-glow" />
            MALLU CUPID
          </a>
          <div className="hidden md:flex items-center gap-8 text-sm text-muted font-medium">
            <a href="#how-it-works" className="hover:text-cream transition-colors">
              How it works
            </a>
            <a href="#for-creators" className="hover:text-cream transition-colors">
              For creators
            </a>
            <a href="#income" className="hover:text-cream transition-colors">
              Earnings
            </a>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/signin"
              className="text-sm font-semibold bg-gold text-bg px-4 py-2 rounded-full hover:bg-cream transition-colors"
            >
              Get Started
            </Link>
          </div>
        </nav>
      </motion.header>
    </>
  )
}
