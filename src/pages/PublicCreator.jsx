import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import supabase from '../lib/supabaseClient.js'
import { bookFreeEvent, getPosts, createPostUnlockOrder, verifyPostUnlock } from '../lib/edgeApi.js'
import { enableSecurityWall } from '../lib/securityWall.js'
import PageTransition from '../components/PageTransition.jsx'

export default function PublicCreator() {
  const { username } = useParams()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState(null)
  const [events, setEvents] = useState([])
  const [posts, setPosts] = useState([])
  const [message, setMessage] = useState('')
  const [activeTab, setActiveTab] = useState('posts')
  const [unlockingPostId, setUnlockingPostId] = useState(null)

  // Security wall on mount
  useEffect(() => { enableSecurityWall() }, [])

  useEffect(() => {
    if (!supabase) { setLoading(false); return }
    let mounted = true
    ;(async () => {
      try {
        const { data: profileData } = await supabase.from('creators').select('*').eq('username', username).single()
        if (mounted) setProfile(profileData)

        const [eventsRes, postsRes] = await Promise.all([
          supabase.from('live_events').select('*').eq('creator_username', username).in('status', ['scheduled', 'live']).order('event_when', { ascending: true }),
          getPosts({ username }).catch(() => ({ posts: [] })),
        ])
        if (mounted) {
          setEvents(eventsRes.data || [])
          setPosts(postsRes.posts || [])
        }
      } catch { /* fallback */ } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => (mounted = false)
  }, [username])

  const handleUnlockPost = useCallback(async (post) => {
    setMessage('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        navigate('/signin', { state: { role: 'user', redirect: window.location.pathname } })
        return
      }

      setUnlockingPostId(post.id)
      const order = await createPostUnlockOrder({ post_id: post.id })

      if (order.already_unlocked) {
        const refreshed = await getPosts({ username })
        setPosts(refreshed.posts || [])
        setMessage('Already unlocked!')
        setUnlockingPostId(null)
        return
      }

      const options = {
        key: order.key,
        amount: order.amount,
        currency: order.currency,
        name: 'MALLU CUPID',
        description: `Unlock post by @${post.creator_username}`,
        order_id: order.order_id,
        handler: async function (response) {
          try {
            await verifyPostUnlock({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              post_id: post.id,
            })
            const refreshed = await getPosts({ username })
            setPosts(refreshed.posts || [])
            setMessage('Post unlocked!')
          } catch (err) {
            setMessage(err.message || 'Payment verification failed')
          } finally {
            setUnlockingPostId(null)
          }
        },
        prefill: {
          name: '',
          email: '',
        },
        theme: { color: '#7c3aed' },
        modal: { ondismiss: () => setUnlockingPostId(null) },
      }

      if (window.Razorpay) {
        const rzp = new window.Razorpay(options)
        rzp.open()
      }
    } catch (err) {
      setMessage(err.message || 'Failed to unlock')
      setUnlockingPostId(null)
    }
  }, [username, navigate, supabase])

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
          <p className="text-sm text-slate-500 mt-3">Sorry, we couldn't find this creator.</p>
        </div>
      </PageTransition>
    )

  return (
    <PageTransition>
      <div className="min-h-screen bg-gradient-to-b from-pink-50 via-white to-violet-50">
        <div className="max-w-lg mx-auto p-4">
          <div className="rounded-2xl overflow-hidden shadow-xl bg-white">
            {/* Profile Header */}
            <div className="p-6 text-center" style={{ background: profile.theme_color || '#f9f7ff' }}>
              {profile.avatar_url ? (
                <img src={profile.avatar_url} alt="avatar" className="mx-auto h-20 w-20 rounded-full object-cover border-4 border-white shadow" />
              ) : (
                <div className="mx-auto h-20 w-20 rounded-full bg-white/60 border-4 border-white flex items-center justify-center">
                  <svg className="h-10 w-10 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4z"/><path d="M6 20v-1a4 4 0 014-4h4a4 4 0 014 4v1"/></svg>
                </div>
              )}
              <h1 className="mt-4 text-2xl font-bold text-slate-900">{profile.display_name || username}</h1>
              <p className="text-sm text-slate-700 mt-2 line-clamp-3">{profile.bio}</p>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-slate-200">
              <button
                type="button"
                onClick={() => setActiveTab('posts')}
                className={`flex-1 py-3 text-sm font-semibold text-center border-b-2 transition ${activeTab === 'posts' ? 'border-violet-600 text-violet-600' : 'border-transparent text-slate-500'}`}
              >Posts</button>
              <button
                type="button"
                onClick={() => setActiveTab('events')}
                className={`flex-1 py-3 text-sm font-semibold text-center border-b-2 transition ${activeTab === 'events' ? 'border-violet-600 text-violet-600' : 'border-transparent text-slate-500'}`}
              >Events</button>
            </div>

            {/* Posts Feed */}
            {activeTab === 'posts' && (
              <div className="p-4">
                {posts.length === 0 && <p className="text-sm text-slate-400 text-center py-8">No posts yet.</p>}
                <div className="space-y-4">
                  {posts.map(post => (
                    <div key={post.id} className="rounded-xl border border-slate-200 overflow-hidden bg-white">
                      {/* Post Image with Paywall */}
                      {post.content_type !== 'text' && (
                        <div className="relative">
                          {post.is_unlocked && post.media_url ? (
                            <img
                              src={post.media_url}
                              alt={post.caption || ''}
                              className="w-full max-h-96 object-cover"
                              onContextMenu={e => e.preventDefault()}
                              draggable={false}
                            />
                          ) : (
                            <div className="relative w-full h-64 bg-slate-200">
                              {/* Blurred placeholder / locked overlay */}
                              {post.media_url ? (
                                <img
                                  src={post.media_url}
                                  alt=""
                                  className="w-full h-full object-cover"
                                  style={{ filter: 'blur(25px) saturate(0.3)', transform: 'scale(1.1)' }}
                                  onContextMenu={e => e.preventDefault()}
                                  draggable={false}
                                />
                              ) : null}
                              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 backdrop-blur-sm">
                                <svg className="h-12 w-12 text-white/80 mb-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                  <path d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                                </svg>
                                <span className="text-white font-semibold text-sm">Paid Content</span>
                                <span className="text-white/70 text-xs mt-1">Unlock to view</span>
                              </div>
                            </div>
                          )}
                          {/* Post Type Badge */}
                          <span className={`absolute top-3 left-3 rounded-full px-2.5 py-1 text-[11px] font-bold ${post.post_type === 'paid' ? 'bg-amber-500 text-white' : 'bg-emerald-500 text-white'}`}>
                            {post.post_type === 'paid' ? `₹${post.price}` : 'FREE'}
                          </span>
                        </div>
                      )}

                      {/* Caption / Text Post */}
                      <div className="p-4">
                        {post.content_type === 'text' && !post.is_unlocked && post.post_type === 'paid' ? (
                          <div className="text-center py-4">
                            <p className="text-sm text-slate-400 line-clamp-2">This content is locked</p>
                          </div>
                        ) : (
                          <p className="text-sm text-slate-800 whitespace-pre-wrap">{post.caption || ''}</p>
                        )}

                        {/* Unlock Button */}
                        {post.post_type === 'paid' && !post.is_unlocked && (
                          <button
                            type="button"
                            onClick={() => handleUnlockPost(post)}
                            disabled={unlockingPostId === post.id}
                            className="mt-3 w-full rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 py-3 text-sm font-semibold text-white shadow hover:from-violet-700 hover:to-purple-700 disabled:opacity-50 transition flex items-center justify-center gap-2"
                          >
                            {unlockingPostId === post.id ? (
                              <><div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Processing...</>
                            ) : (
                              <><svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" /></svg> Unlock for ₹{post.price}</>
                            )}
                          </button>
                        )}

                        {/* Unlocked Badge */}
                        {post.is_unlocked && post.post_type === 'paid' && (
                          <div className="mt-3 flex items-center gap-1.5 text-xs text-emerald-600">
                            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" /></svg>
                            Unlocked
                          </div>
                        )}

                        {/* Stats */}
                        <div className="mt-3 flex items-center gap-4 text-xs text-slate-400">
                          {post.post_type === 'paid' && <span>{post.unlocks_count || 0} unlocks</span>}
                          <span>{new Date(post.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Events Tab */}
            {activeTab === 'events' && (
              <div className="p-4">
                {events.length === 0 && <p className="text-sm text-slate-400 text-center py-8">No upcoming events.</p>}
                <div className="space-y-3">
                  {events.map(ev => (
                    <div key={ev.id} className="rounded-xl border p-4 bg-white shadow-sm">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-semibold text-sm">{ev.title || 'Live Session'}</div>
                          <div className="text-xs text-slate-400 mt-1">{new Date(ev.event_when).toLocaleString()}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleBookEvent(ev)}
                          className="px-3 py-2 rounded-lg bg-violet-600 text-white text-xs font-semibold"
                        >
                          {ev.price_type === 'paid' ? `₹${ev.price}` : 'Free'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {message && <div className="px-4 pb-4 text-center text-sm text-emerald-600 font-medium">{message}</div>}

            <div className="p-4 text-center">
              <Link to="/signup" state={{ role: 'user', redirect: window.location.pathname }} className="inline-block px-6 py-3 bg-violet-600 text-white rounded-full font-semibold text-sm shadow hover:bg-violet-700 transition">
                Create Account to Access More
              </Link>
            </div>
          </div>
        </div>
      </div>
    </PageTransition>
  )
}
