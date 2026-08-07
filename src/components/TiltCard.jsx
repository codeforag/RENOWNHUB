import { useRef, useState } from 'react'

/**
 * Wraps its children in a card that tilts in 3D toward the cursor.
 * Pure CSS transforms — no dependency needed beyond React.
 */
export default function TiltCard({ children, className = '', intensity = 10 }) {
  const ref = useRef(null)
  const [transform, setTransform] = useState(
    'perspective(1000px) rotateX(0deg) rotateY(0deg) translateZ(0px)'
  )
  const [glow, setGlow] = useState({ x: 50, y: 50 })
  const [hovering, setHovering] = useState(false)

  function handleMouseMove(e) {
    const rect = ref.current.getBoundingClientRect()
    const px = (e.clientX - rect.left) / rect.width
    const py = (e.clientY - rect.top) / rect.height
    const rx = (py - 0.5) * -intensity
    const ry = (px - 0.5) * intensity
    setTransform(
      `perspective(1000px) rotateX(${rx}deg) rotateY(${ry}deg) translateZ(12px)`
    )
    setGlow({ x: px * 100, y: py * 100 })
    setHovering(true)
  }

  function handleLeave() {
    setTransform(
      'perspective(1000px) rotateX(0deg) rotateY(0deg) translateZ(0px)'
    )
    setHovering(false)
  }

  return (
    <div
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleLeave}
      style={{ transform }}
      className={`relative will-change-transform transition-transform duration-200 ease-out [transform-style:preserve-3d] ${className}`}
    >
      <div
        className="pointer-events-none absolute -inset-px rounded-[inherit] transition-opacity duration-300"
        style={{
          opacity: hovering ? 1 : 0,
          background: `radial-gradient(220px circle at ${glow.x}% ${glow.y}%, rgba(240,180,41,0.16), transparent 70%)`,
        }}
      />
      {children}
    </div>
  )
}
