import { motion } from 'framer-motion'

const variants = {
  initial: { opacity: 0, x: 48, rotateY: 8 },
  animate: {
    opacity: 1,
    x: 0,
    rotateY: 0,
    transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
  },
  exit: {
    opacity: 0,
    x: -48,
    rotateY: -8,
    transition: { duration: 0.32, ease: [0.22, 1, 0.36, 1] },
  },
}

export default function PageTransition({ children }) {
  return (
    <motion.div
      variants={variants}
      initial="initial"
      animate="animate"
      exit="exit"
      style={{ transformStyle: 'preserve-3d' }}
      className="min-h-screen"
    >
      {children}
    </motion.div>
  )
}
