import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import PageTransition from '../components/PageTransition.jsx'
import TextField from '../components/TextField.jsx'
import { useAuthFlow } from '../context/AuthFlowContext.jsx'

function displayName(fullName, signupUsername) {
  if (fullName) return fullName.split(' ')[0]
  if (signupUsername) return signupUsername
  return 'Creator'
}

const SOCIAL_FIELDS = [
  { key: 'instagram', label: 'Instagram username', placeholder: 'your_instagram', icon: 'instagram' },
  { key: 'snapchat', label: 'Snapchat handle', placeholder: '@yourhandle', icon: 'snapchat' },
  { key: 'x', label: 'Twitter handle', placeholder: '@abcd1234', icon: 'twitter' },
  { key: 'youtube', label: 'Youtube channel', placeholder: 'https://www.youtube.com/channel/channelId', icon: 'youtube' },
  { key: 'facebook', label: 'Facebook profile', placeholder: 'https://www.facebook.com/username', icon: 'facebook' },
  { key: 'linkedin', label: 'LinkedIn profile', placeholder: 'https://www.linkedin.com/in/username', icon: 'linkedin' },
]

function SocialIcon({ type }) {
  const map = {
    instagram: 'bg-gradient-to-br from-fuchsia-500 via-orange-400 to-yellow-300',
    snapchat: 'bg-yellow-300',
    twitter: 'bg-sky-500',
    youtube: 'bg-red-600',
    facebook: 'bg-blue-600',
    linkedin: 'bg-sky-700',
  }
  return <span className={`inline-flex h-8 w-8 items-center justify-center rounded-xl text-white ${map[type] || 'bg-slate-400'}`} />
}

export default function DashboardProfile() {
  const navigate = useNavigate()
  const { fullName, signupUsername, bio, themeColor, socials, update } = useAuthFlow()
  const name = displayName(fullName, signupUsername)

  const [displayNameValue, setDisplayNameValue] = useState(fullName || signupUsername || '')
  const [bioValue, setBioValue] = useState(bio)
  const [themeColorValue, setThemeColorValue] = useState(themeColor)
  const [socialValues, setSocialValues] = useState({
    instagram: socials.instagram || '',
    snapchat: socials.snapchat || '',
    x: socials.x || '',
    youtube: socials.youtube || '',
    facebook: socials.facebook || '',
    linkedin: socials.linkedin || '',
  })
  const [saved, setSaved] = useState(false)

  const shareUrl = useMemo(
    () => `https://creatorapp.club/${signupUsername || 'yourname'}`,
    [signupUsername],
  )

  useEffect(() => {
    setSaved(false)
  }, [displayNameValue, bioValue, themeColorValue, socialValues])

  function handleSocialChange(key, value) {
    setSocialValues((prev) => ({ ...prev, [key]: value }))
  }

  function handleSubmit(event) {
    event.preventDefault()
    update({
      fullName: displayNameValue,
      bio: bioValue,
      themeColor: themeColorValue,
      socials: {
        ...socials,
        ...socialValues,
      },
    })
    setSaved(true)
  }

  return (
    <PageTransition>
      <div className="min-h-screen bg-slate-100 text-slate-900 pb-28">
        <div className="max-w-md mx-auto px-4 py-4">
          <div className="mb-4 flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="inline-flex items-center rounded-2xl bg-violet-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-violet-700 transition"
            >
              <span className="mr-2">←</span>
              Back
            </button>
          </div>

          <section className="mb-4 rounded-[2rem] bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <div className="rounded-[1.75rem] bg-gradient-to-br from-fuchsia-500 via-sky-500 to-orange-400 p-4 shadow-inner shadow-fuchsia-200/40">
              <div className="h-44 rounded-[1.5rem] bg-white/90" />
            </div>
            <div className="-mt-16 flex justify-center">
              <div className="relative">
                <div className="h-24 w-24 rounded-full bg-slate-200 ring-4 ring-white shadow-sm" />
                <div className="absolute -bottom-2 right-0 inline-flex h-9 w-9 items-center justify-center rounded-full bg-violet-600 text-white shadow-lg">
                  ✎
                </div>
              </div>
            </div>
          </section>

          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Link
              to="/preview"
              className="rounded-full bg-violet-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-violet-700 transition"
            >
              Preview app
            </Link>
            <Link
              to="/share"
              className="rounded-full bg-slate-100 border border-slate-200 px-6 py-3 text-sm font-semibold text-slate-900 shadow-sm hover:bg-slate-200 transition"
            >
              Share
            </Link>
            <Link
              to="/dashboard/connect"
              className="rounded-full bg-slate-100 border border-slate-200 px-6 py-3 text-sm font-semibold text-slate-900 shadow-sm hover:bg-slate-200 transition"
            >
              Edit
            </Link>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5 rounded-[2rem] bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <div>
              <label className="block text-sm font-semibold text-slate-900 mb-2">Display Name</label>
              <input
                value={displayNameValue}
                onChange={(e) => setDisplayNameValue(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
                placeholder=""
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-semibold text-slate-900">Set an impressive bio!</label>
                <span className="text-xs text-slate-500">Normal</span>
              </div>
              <textarea
                value={bioValue}
                onChange={(e) => setBioValue(e.target.value)}
                rows={5}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
                placeholder="Welcome to my official app. Connect with me 1 on 1 and join my super fan club. I am excited to meet you all"
              />
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <label className="text-sm font-semibold text-slate-900">Select your APP Theme Color:</label>
              <input
                type="color"
                value={themeColorValue}
                onChange={(e) => setThemeColorValue(e.target.value)}
                className="h-12 w-20 rounded-xl border border-slate-200 bg-white p-1"
              />
            </div>

            <button
              type="submit"
              className="w-full rounded-full bg-violet-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-violet-700 transition"
            >
              Update Profile
            </button>
            {saved && <p className="text-center text-sm text-emerald-600">Profile updated successfully!</p>}
          </form>

          <section className="mt-5 rounded-[2rem] bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <h2 className="mb-5 text-center text-lg font-semibold text-slate-900">Social Profiles</h2>
            <div className="space-y-5">
              {SOCIAL_FIELDS.map((field) => (
                <div key={field.key}>
                  <div className="mb-3 flex items-center gap-3 text-sm font-semibold text-slate-900">
                    <SocialIcon type={field.key} />
                    {field.label}
                  </div>
                  <TextField
                    value={socialValues[field.key]}
                    onChange={(e) => handleSocialChange(field.key, e.target.value)}
                    placeholder={field.placeholder}
                    className="bg-white"
                  />
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={handleSubmit}
              className="mt-6 w-full rounded-full bg-violet-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-violet-700 transition"
            >
              Update Social Profiles
            </button>
          </section>

          <div className="pb-24" />
        </div>
      </div>
    </PageTransition>
  )
}
