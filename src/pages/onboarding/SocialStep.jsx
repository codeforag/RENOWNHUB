import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AuthLayout from '../../components/AuthLayout.jsx'
import PageTransition from '../../components/PageTransition.jsx'
import TextField from '../../components/TextField.jsx'
import { useAuthFlow } from '../../context/AuthFlowContext.jsx'

const HANDLE_RE = /^[a-zA-Z0-9_.]{1,30}$/

function isValidUrl(value, hosts) {
  try {
    const url = new URL(value)
    return hosts.some((h) => url.hostname.replace('www.', '').endsWith(h))
  } catch {
    return false
  }
}

const FIELDS = [
  {
    key: 'instagram',
    label: 'Instagram username',
    placeholder: 'yourname',
    validate: (v) => (HANDLE_RE.test(v.replace(/^@/, '')) ? '' : 'Enter a valid Instagram username.'),
    normalize: (v) => v.replace(/^@/, ''),
  },
  {
    key: 'facebook',
    label: 'Facebook URL',
    placeholder: 'https://facebook.com/yourname',
    validate: (v) => (isValidUrl(v, ['facebook.com']) ? '' : 'Enter a full facebook.com link.'),
  },
  {
    key: 'snapchat',
    label: 'Snapchat handle',
    placeholder: 'yourname',
    validate: (v) => (HANDLE_RE.test(v.replace(/^@/, '')) ? '' : 'Enter a valid Snapchat handle.'),
    normalize: (v) => v.replace(/^@/, ''),
  },
  {
    key: 'youtube',
    label: 'YouTube channel',
    placeholder: 'https://youtube.com/@yourname',
    validate: (v) => (isValidUrl(v, ['youtube.com', 'youtu.be']) ? '' : 'Enter a full youtube.com link.'),
  },
  {
    key: 'x',
    label: 'X profile',
    placeholder: 'yourname',
    validate: (v) => (HANDLE_RE.test(v.replace(/^@/, '')) ? '' : 'Enter a valid X handle.'),
    normalize: (v) => v.replace(/^@/, ''),
  },
  {
    key: 'threads',
    label: 'Threads handle',
    placeholder: 'yourname',
    validate: (v) => (HANDLE_RE.test(v.replace(/^@/, '')) ? '' : 'Enter a valid Threads handle.'),
    normalize: (v) => v.replace(/^@/, ''),
  },
]

export default function SocialStep() {
  const navigate = useNavigate()
  const { categories, socials, update } = useAuthFlow()

  useEffect(() => {
    if (!categories || categories.length === 0) {
      navigate('/onboarding/category', { replace: true })
    }
  }, [categories, navigate])

  const [values, setValues] = useState({
    instagram: '',
    facebook: '',
    snapchat: '',
    youtube: '',
    x: '',
    threads: '',
    ...socials,
  })
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)

  function handleChange(key, value) {
    setValues((prev) => ({ ...prev, [key]: value }))
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: '' }))
  }

  function handleSubmit(e) {
    e.preventDefault()
    const nextErrors = {}
    const normalized = { ...values }

    for (const field of FIELDS) {
      const raw = values[field.key].trim()
      if (!raw) continue // every field here is optional
      const error = field.validate(raw)
      if (error) {
        nextErrors[field.key] = error
      } else if (field.normalize) {
        normalized[field.key] = field.normalize(raw)
      }
    }

    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    setSubmitting(true)
    update({ socials: normalized })
    if (typeof window !== 'undefined' && window.innerWidth > 768) {
      debugger
    }
    navigate('/dashboard')
  }

  return (
    <PageTransition>
      <AuthLayout
        showBack
        backTo="/onboarding/category"
        step={{ current: 3, total: 3 }}
        eyebrow="Almost there"
        title="Link your socials"
        subtitle="Optional, but pages with linked socials get discovered faster. Leave any of these blank."
        width="max-w-xl"
      >
        <form onSubmit={handleSubmit} noValidate className="space-y-5">
          <div className="grid sm:grid-cols-2 gap-5">
            {FIELDS.map((field) => (
              <TextField
                key={field.key}
                label={field.label}
                placeholder={field.placeholder}
                value={values[field.key]}
                onChange={(e) => handleChange(field.key, e.target.value)}
                error={errors[field.key]}
              />
            ))}
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-full bg-gold text-bg font-semibold py-3.5 hover:bg-cream transition-colors disabled:opacity-60 mt-2"
          >
            {submitting ? 'Setting up your page…' : 'Next'}
          </button>
        </form>
      </AuthLayout>
    </PageTransition>
  )
}
