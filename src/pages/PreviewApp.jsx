import { useNavigate } from 'react-router-dom'
import { useAuthFlow } from '../context/AuthFlowContext.jsx'

export default function PreviewApp() {
  const navigate = useNavigate()
  const { fullName, signupUsername } = useAuthFlow()
  const name = fullName || signupUsername || 'ISHIKA'

  return (
    <div className="min-h-screen bg-pink-50 text-slate-900">
      <div className="bg-pink-200 px-4 py-3 text-sm font-semibold text-slate-900">
        <button onClick={() => navigate(-1)} className="rounded-xl bg-white/80 px-3 py-2 shadow-sm hover:bg-white">
          × Close Preview
        </button>
      </div>

      <div className="px-4 py-6">
        <div className="overflow-hidden rounded-[2rem] bg-white shadow-2xl">
          <div className="relative h-56 bg-gradient-to-br from-pink-500 via-fuchsia-500 to-orange-400">
            <div className="absolute right-4 top-4 flex items-center gap-4 text-sm text-white">
              <button className="rounded-full bg-white/20 px-3 py-2 backdrop-blur-sm">Subscribe</button>
              <button className="rounded-full bg-white/20 px-3 py-2 backdrop-blur-sm">Login</button>
              <button className="rounded-full bg-white/20 px-3 py-2 backdrop-blur-sm">Follow</button>
            </div>
            <div className="absolute left-4 top-4 text-white text-xs uppercase tracking-[0.3em]">Preview</div>
          </div>

          <div className="px-6 py-8 text-center">
            <div className="mb-4 text-2xl font-semibold uppercase tracking-[0.25em] text-pink-500">Hi, I'm {name.toUpperCase()}</div>
            <div className="mx-auto max-w-xl text-sm leading-7 text-slate-600">
              Welcome to my official app. Connect with me 1 on 1 and join my super fan club. I am excited to meet you all
            </div>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
              <button className="rounded-full bg-pink-500 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-pink-600 transition">
                Brand Enquiry
              </button>
              <button className="rounded-full bg-white border border-pink-300 px-5 py-3 text-sm font-semibold text-pink-600 shadow-sm hover:bg-pink-50 transition">
                Chat Now
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
