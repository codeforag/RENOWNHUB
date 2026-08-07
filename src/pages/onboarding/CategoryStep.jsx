import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AuthLayout from '../../components/AuthLayout.jsx'
import PageTransition from '../../components/PageTransition.jsx'
import { useAuthFlow } from '../../context/AuthFlowContext.jsx'

const CATEGORIES = [
  { id: 'fitness', label: 'Fitness', icon: '\u{1F4AA}' },
  { id: 'photographer', label: 'Photographer', icon: '\u{1F4F8}' },
  { id: 'singer', label: 'Singer', icon: '\u{1F3A4}' },
  { id: 'dancer', label: 'Dancer', icon: '\u{1F483}' },
  { id: 'teacher', label: 'Teacher', icon: '\u{1F4DA}' },
  { id: 'personal-coach', label: 'Personal Coach', icon: '\u{1F3AF}' },
  { id: 'wellness-coach', label: 'Wellness Coach', icon: '\u{1F9D8}' },
  { id: 'artist', label: 'Visual Artist', icon: '\u{1F3A8}' },
  { id: 'gamer', label: 'Gamer', icon: '\u{1F3AE}' },
  { id: 'chef', label: 'Chef', icon: '\u{1F373}' },
  { id: 'comedian', label: 'Comedian', icon: '\u{1F3AD}' },
  { id: 'exclusive', label: 'Exclusive', icon: '\u{2728}' },
]

const MAX_SELECT = 3

export default function CategoryStep() {
  const navigate = useNavigate()
  const { fullName, categories, update } = useAuthFlow()
  const [selected, setSelected] = useState(categories || [])
  const [error, setError] = useState('')

  useEffect(() => {
    if (!fullName) navigate('/onboarding/profile', { replace: true })
  }, [fullName, navigate])

  function toggle(id) {
    setError('')
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((c) => c !== id)
      if (prev.length >= MAX_SELECT) return prev
      return [...prev, id]
    })
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (selected.length === 0) {
      setError('Pick at least one category that fits you.')
      return
    }
    update({ categories: selected })
    navigate('/onboarding/social')
  }

  return (
    <PageTransition>
      <AuthLayout
        showBack
        backTo="/onboarding/profile"
        step={{ current: 2, total: 3 }}
        eyebrow="Your niche"
        title="What defines you best?"
        subtitle={`Pick up to ${MAX_SELECT}. You can always change this later.`}
        width="max-w-xl"
      >
        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-2">
            {CATEGORIES.map((cat) => {
              const isSelected = selected.includes(cat.id)
              return (
                <button
                  type="button"
                  key={cat.id}
                  onClick={() => toggle(cat.id)}
                  aria-pressed={isSelected}
                  className={`group relative rounded-2xl border px-4 py-5 text-left transition-all duration-200 [transform-style:preserve-3d] hover:-translate-y-0.5 ${
                    isSelected
                      ? 'border-gold/70 bg-gold/10 shadow-glow'
                      : 'border-white/10 bg-bg hover:border-white/25'
                  }`}
                >
                  <span className="text-2xl mb-3 block">{cat.icon}</span>
                  <span className="text-sm font-medium block">{cat.label}</span>
                  {isSelected && (
                    <span className="absolute top-3 right-3 h-4 w-4 rounded-full bg-gold flex items-center justify-center">
                      <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                        <path d="M1 4L3 6L7 1.5" stroke="#15111F" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          {error && <p className="text-xs text-coral mb-4">{error}</p>}

          <button
            type="submit"
            className="w-full rounded-full bg-gold text-bg font-semibold py-3.5 hover:bg-cream transition-colors mt-4"
          >
            Next
          </button>
        </form>
      </AuthLayout>
    </PageTransition>
  )
}
