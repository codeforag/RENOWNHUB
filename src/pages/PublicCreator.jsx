import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import supabase from '../lib/supabaseClient.js'
import { bookFreeEvent } from '../lib/edgeApi.js'
import PageTransition from '../components/PageTransition.jsx'

export default function PublicCreator() {
  const { username } = useParams()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState(null)
  const [events, setEvents] = useState([])
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }

    let mounted = true
    ;(async () => {
      try {
        const { data: profileData } = await supabase.from('creators').select('*').eq('username', username).single()
        if (mounted) setProfile(profileData)

        const { data: liveEvents } = await supabase
          .from('live_events')
          .select('*')
          .eq('creator_username', username)
          .in('status', ['scheduled', 'live'])
          .order('event_when', { ascending: true })
        if (mounted) setEvents(liveEvents || [])
      } catch {
        // show fallback
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => (mounted = false)
  }, [username])

  async function handleBookEvent(ev) {
    setMessage('')
    if (ev.price_type === 'paid') {
      navigate('/signin', { state: { role: 'user', redirect: window.location.pathname } })
      return
    }
    try {
      await bookFreeEvent({ event_id: ev.id })
      setMessage('Booked successfully!')
    } catch (err) {
      setMessage(err.message || 'Booking failed')
    }
  }

  if (loading) return <PageTransition><div className="p-6">Loading...</div></PageTransition>

  if (!profile)
    return (
      <PageTransition>
        <div className="p-6 text-center">
          <h2 className="text-xl font-semibold">Creator not found</h2>
          <p className="text-sm text-muted mt-3">Sorry, we couldn't find this creator.</p>
        </div>
      </PageTransition>
    )

  return (
    <PageTransition>
      <div className="min-h-screen bg-gradient-to-b from-pink-50 via-white to-violet-50 p-4">
        <div className="max-w-md mx-auto">
          <div className="rounded-2xl overflow-hidden shadow-xl bg-white">
            <div className="p-6 text-center" style={{ background: profile.theme_color || '#f9f7ff' }}>
              {profile.avatar_url ? (
                <img src={profile.avatar_url} alt="avatar" className="mx-auto h-20 w-20 rounded-full object-cover border-4 border-white shadow" />
              ) : (
                <div className="mx-auto h-20 w-20 rounded-full bg-white/60 border-4 border-white flex items-center justify-center">
                  <svg className="h-10 w-10 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4z"/><path d="M6 20v-1a4 4 0 014-4h4a4 4 0 014 4v1"/></svg>
                </div>
              )}
              <h1 className="mt-4 text-2xl font-bold text-slate-900">{profile.display_name || username}</h1>
              <p className="text-sm text-slate-700 mt-2">{profile.bio}</p>
            </div>

            <div className="p-4">
              <h3 className="text-lg font-semibold mb-3">Upcoming Events</h3>
              {events.length === 0 && <p className="text-sm text-muted">No upcoming events.</p>}
              <div className="space-y-3">
                {events.map((ev) => (
                  <div key={ev.id} className="rounded-lg border p-4 bg-white shadow-sm">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-semibold">{ev.title || 'Live Session'}</div>
                        <div className="text-xs text-muted">{new Date(ev.event_when).toLocaleString()}</div>
                      </div>
                      <div>
                        <button
                          onClick={() => handleBookEvent(ev)}
                          className="px-3 py-2 rounded bg-violet-600 text-white text-sm"
                        >
                          {ev.price_type === 'paid' ? `Book Now @ \u20b9${ev.price}` : 'Book Now'}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {message && <div className="mb-3 text-center text-sm text-emerald-600">{message}</div>}
              <div className="mt-6 text-center">
                <Link to="/signup" state={{ role: 'user', redirect: window.location.pathname }} className="inline-block px-6 py-3 bg-gold text-bg rounded-full font-semibold">
                  Create Account to Access More
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </PageTransition>
  )
}
