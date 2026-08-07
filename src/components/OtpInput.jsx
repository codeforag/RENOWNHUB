import { useEffect, useRef } from 'react'

export default function OtpInput({ value, onChange, length = 6, error = false }) {
  const refs = useRef([])

  useEffect(() => {
    refs.current[0]?.focus()
  }, [])

  function setDigit(index, digit) {
    const chars = value.split('')
    chars[index] = digit
    onChange(chars.join('').slice(0, length))
  }

  function handleChange(e, index) {
    const raw = e.target.value.replace(/\D/g, '')
    if (!raw) {
      setDigit(index, '')
      return
    }
    // handles fast typing of a single digit
    const digit = raw[raw.length - 1]
    setDigit(index, digit)
    if (index < length - 1) refs.current[index + 1]?.focus()
  }

  function handleKeyDown(e, index) {
    if (e.key === 'Backspace') {
      if (value[index]) {
        setDigit(index, '')
      } else if (index > 0) {
        refs.current[index - 1]?.focus()
        setDigit(index - 1, '')
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      refs.current[index - 1]?.focus()
    } else if (e.key === 'ArrowRight' && index < length - 1) {
      refs.current[index + 1]?.focus()
    }
  }

  function handlePaste(e) {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length)
    if (!pasted) return
    onChange(pasted.padEnd(length, '').slice(0, length))
    const nextIndex = Math.min(pasted.length, length - 1)
    refs.current[nextIndex]?.focus()
  }

  return (
    <div className="flex gap-2.5 sm:gap-3" onPaste={handlePaste}>
      {Array.from({ length }).map((_, i) => (
        <input
          key={i}
          ref={(el) => (refs.current[i] = el)}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={1}
          value={value[i] ?? ''}
          onChange={(e) => handleChange(e, i)}
          onKeyDown={(e) => handleKeyDown(e, i)}
          className={`w-11 h-12 sm:w-12 sm:h-14 text-center font-display text-xl rounded-xl bg-bg border transition-colors focus:outline-none ${
            error
              ? 'border-coral/70 text-coral'
              : 'border-white/15 focus:border-gold/60 text-cream'
          }`}
        />
      ))}
    </div>
  )
}
