import { useNavigate } from 'react-router-dom'
import { useAuthFlow } from '../context/AuthFlowContext.jsx'

export default function ShareApp() {
  const navigate = useNavigate()
  const { signupUsername, bio } = useAuthFlow()
  const shareUrl = `https://creatorapp.club/${signupUsername || 'yourname'}`

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <div className="bg-pink-200 px-4 py-3 text-sm font-semibold text-slate-900">
        <button onClick={() => navigate(-1)} className="rounded-xl bg-white/80 px-3 py-2 shadow-sm hover:bg-white">
          × Close Share
        </button>
      </div>

      <div className="px-4 py-6">
        <div className="mx-auto max-w-md rounded-[2rem] bg-white p-6 shadow-2xl ring-1 ring-slate-200">
          <h1 className="text-lg font-semibold text-slate-900">Share your app</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Share your creator page link with your fans and let them connect with you instantly.
          </p>

          <div className="mt-6 rounded-3xl bg-slate-50 p-4 ring-1 ring-slate-200">
            <p className="text-xs uppercase tracking-[0.35em] text-slate-500">Your share link</p>
            <div className="mt-3 flex items-center gap-2 rounded-3xl bg-white px-4 py-3 ring-1 ring-slate-200">
              <span className="text-sm text-slate-700 break-all">{shareUrl}</span>
            </div>
          </div>

          <div className="mt-6 space-y-4">
            <button className="w-full rounded-full bg-pink-500 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-pink-600 transition">
              Copy Link
            </button>
            <button className="w-full rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-900 shadow-sm hover:bg-slate-50 transition">
              Share via WhatsApp
            </button>
            <button className="w-full rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-900 shadow-sm hover:bg-slate-50 transition">
              Share via Instagram
            </button>
          </div>

          <div className="mt-8 rounded-3xl border border-pink-100 bg-pink-50 p-4 text-sm text-pink-700">
            <p className="font-medium">Share preview:</p>
            <p className="mt-2 text-sm text-slate-600">Use this page to show how your app looks before fans open it.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
