import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import supabase from '../../lib/supabaseClient.js'
import AuthLayout from '../../components/AuthLayout.jsx'
import PageTransition from '../../components/PageTransition.jsx'
import TextField from '../../components/TextField.jsx'
import { useAuthFlow } from '../../context/AuthFlowContext.jsx'

const GENDERS = ['Female', 'Male', 'Non-binary', 'Prefer not to say']

function calculateAge(dobString) {
  const dob = new Date(dobString)
  const today = new Date()
  let age = today.getFullYear() - dob.getFullYear()
  const monthDiff = today.getMonth() - dob.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    age -= 1
  }
  return age
}

export default function ProfileStep() {
  const navigate = useNavigate()
  const { fullName, gender, dob, update } = useAuthFlow()

  useEffect(() => {
    let mounted = true
    ;(async () => {
      if (!supabase) return
      try {
        const { data } = await supabase.auth.getUser()
        const user = data?.user ?? null
        if (!user && mounted) navigate('/signup', { replace: true })
      } catch (e) {
        if (mounted) navigate('/signup', { replace: true })
      }
    })()
    return () => (mounted = false)
  }, [navigate])

  const [name, setName] = useState(fullName || '')
  const [selectedGender, setSelectedGender] = useState(gender || '')
  const [dobValue, setDobValue] = useState(dob || '')
  const [errors, setErrors] = useState({})

  

  function handleSubmit(e) {
    e.preventDefault()
    const nextErrors = {}

    if (name.trim().length < 2) {
      nextErrors.name = 'Enter your full name.'
    }
    if (!selectedGender) {
      nextErrors.gender = 'Select an option to continue.'
    }
    if (!dobValue) {
      nextErrors.dob = 'Enter your date of birth.'
    } else {
      const age = calculateAge(dobValue)
      if (Number.isNaN(age)) {
        nextErrors.dob = 'Enter a valid date.'
      } else if (age < 18) {
        nextErrors.dob = 'You must be 18 or older to create a MALLU CUPID account.'
      } else if (age > 100) {
        nextErrors.dob = 'Enter a valid date of birth.'
      }
    }

    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    update({ fullName: name.trim(), gender: selectedGender, dob: dobValue })
    navigate('/onboarding/category')
  }

  return (
    <PageTransition>
      <AuthLayout
        showBack
        backTo="/signup"
        step={{ current: 1, total: 3 }}
        eyebrow="Tell us about you"
        title="Set up your profile"
        subtitle="This helps fans recognize you and keeps MALLU CUPID a safe space for creators."
      >
        <form onSubmit={handleSubmit} noValidate className="space-y-6">
          <TextField
            label="Full name"
            placeholder="Ishika Sharma"
            value={name}
            onChange={(e) => setName(e.target.value)}
            error={errors.name}
            autoFocus
          />

          <div>
            <span className="block text-xs font-medium text-muted mb-2">Gender</span>
            <div className="grid grid-cols-2 gap-2.5">
              {GENDERS.map((g) => (
                <button
                  type="button"
                  key={g}
                  onClick={() => setSelectedGender(g)}
                  className={`rounded-xl border px-4 py-2.5 text-sm text-left transition-colors ${
                    selectedGender === g
                      ? 'border-gold/70 bg-gold/10 text-cream'
                      : 'border-white/15 text-muted hover:border-white/30'
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
            {errors.gender && <p className="text-xs text-coral mt-1.5">{errors.gender}</p>}
          </div>

          <TextField
            label="Date of birth"
            type="date"
            value={dobValue}
            onChange={(e) => setDobValue(e.target.value)}
            error={errors.dob}
            max={new Date().toISOString().split('T')[0]}
            hint={!errors.dob ? 'You must be 18 or older to join MALLU CUPID.' : undefined}
          />

          <button
            type="submit"
            className="w-full rounded-full bg-gold text-bg font-semibold py-3.5 hover:bg-cream transition-colors"
          >
            Next
          </button>
        </form>
      </AuthLayout>
    </PageTransition>
  )
}
