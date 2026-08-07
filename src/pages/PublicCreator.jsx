import { useEffect, useState, useCallback, useRef } from 'react'
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
  const [messageType, setMessageType] = useState('') // 'success' | 'error' | 'info'
  const [activeTab, setActiveTab] = useState('posts')
  const [unlockingPostId, setUnlockingPostId] = useState(null)
  const [bookingEventId, setBookingEventId] = useState(null)
  const pollingRef = useRef(null)

  // Security wall on mount (anti-inspect, anti-right-click for paid content)
  useEffect(() => { enableSecurityWall() }, [])

  // Flash a message that auto-dismisses after 6s
  const flash = useCallback((msg, type = 'info') => {
    setMessage(msg)
    setMessageType(type)
    if (pollingRef.current) clearTimeout(pollingRef.current)
    pollingRef.current = setTimeout(() => setMessage(''), 6000)
  }, [])

  useEffect(() => {
    if (!supabase || !username) {
      setLoading(false)
      return
    }
    let mounted = true
    ;(async () => {
      setLoading(true)
      try {
        const { data: profileData, error: profileErr } = await supabase
          .from('creators')
          .select('*')
          .eq('username', username)
          .maybeSingle()

        if (profileErr) throw profileErr
        if (mounted) setProfile(profileData)
        if (!profileData) {
          if (mounted) setLoading(false)
          return
        }

        const [eventsRes, postsRes] = await Promise.all([
          supabase
            .from('live_events')
            .select('*')
            .eq('creator_username', username)
            .in('status', ['scheduled', 'live'])
            .order('event_when', { ascending: true }),
          getPosts({ username }).catch((e) => {
            console.warn('getPosts failed:', e.message)
            return { posts: [] }
          }),
        ])
        if (mounted) {
          if (eventsRes.error) console.warn('events fetch error:', eventsRes.error.message)
          setEvents(eventsRes.data || [])
          setPosts(postsRes.posts || [])
        }
      } catch (err) {
        console.error('PublicCreator load error:', err)
        if (mounted) flash(`Failed to load this creator's page: ${err.message}`, 'error')
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => { mounted = false }
  }, [username, flash])

  // Cleanup polling on unmount
  useEffect(() => () => { if (pollingRef.current) clearTimeout(pollingRef.current) }, [])

  const refreshPosts = useCallback(async () => {
    try {
      const refreshed = await getPosts({ username })
      setPosts(refreshed.posts || [])
    } catch (err) {
      console.warn('refreshPosts failed:', err.message)
    }
  }, [username])

  const handleUnlockPost = useCallback(async (post) => {
    setMessage('')
    try {
      // Check Razorpay SDK loaded
      if (!window.Razorpay) {
        flash('Payment SDK failed to load. Please refresh the page and try again. If the issue persists, disable any content blockers.', 'error')
        return
      }

      // Check auth
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        flash('Please sign in to unlock this post.', 'info')
        navigate('/signin', { state: { role: 'user', redirect: window.location.pathname } })
        return
      }

      setUnlockingPostId(post.id)
      const order = await createPostUnlockOrder({ post_id: post.id })

      // Already unlocked — refresh posts and exit
      if (order.already_unlocked) {
        await refreshPosts()
        flash('You already have access to this post!', 'success')
        setUnlockingPostId(null)
        return
      }

      // Open Razorpay checkout
      const options = {
        key: order.key,
        amount: order.amount,
        currency: order.currency || 'INR',
        name: 'RENOWNHUB',
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
            await refreshPosts()
            flash('Payment verified — post unlocked! Enjoy the content.', 'success')
          } catch (err) {
            console.error('post unlock verify error:', err)
            flash(`Payment verification failed: ${err.message}. If you were charged, please contact support with order ID ${response.razorpay_order_id}.`, 'error')
          } finally {
            setUnlockingPostId(null)
          }
        },
        prefill: {},
        theme: { color: '#7c3aed' },
        modal: {
          ondismiss: () => {
            setUnlockingPostId(null)
            flash('Payment cancelled. You can try again anytime.', 'info')
          },
        },
      }

      const rzp = new window.Razorpay(options)
      rzp.on('payment.failed', function (resp) {
        console.error('Razorpay payment.failed:', resp.error)
        flash(`Payment failed: ${resp.error?.description || 'Unknown error'}. Please try a different payment method.`, 'error')
        setUnlockingPostId(null)
      })
      rzp.open()
    } catch (err) {
      console.error('unlock post error:', err)
      flash(`Could not start payment: ${err.message}`, 'error')
      setUnlockingPostId(null)
    }
  }, [username, navigate, flash, refreshPosts])

  async function handleBookEvent(ev) {
    setMessage('')
    if (ev.price_type === 'paid') {
      // Paid event → must be signed in to use payment flow
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        flash('Please sign in to book this paid event.', 'info')
        navigate('/signin', { state: { role: 'user', redirect: window.location.pathname } })
        return
      }
      // Payment flow would go through create-razorpay-order; for now, route to sign-in
      flash('Paid event booking is being prepared. Please sign in to continue.', 'info')
      navigate('/signin', { state: { role: 'user', redirect: window.location.pathname } })
      return
    }
    // Free event
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        flash('Please sign in to book this event.', 'info')
        navigate('/signin', { state: { role: 'user', redirect: window.location.pathname } })
        return
      }
      setBookingEventId(ev.id)
      const result = await bookFreeEvent({ event_id: ev.id })
      if (result.already_booked) {
        flash("You've already booked this event.", 'info')
      } else {
        flash(result.message || 'Booked successfully! See you there.', 'success')
      }
    } catch (err) {
      console.error('book event error:', err)
      flash(`Booking failed: ${err.message}`, 'error')
    } finally {
      setBookingEventId(null)
    }
  }

  if (loading) {
    return (
      <PageTransition>
        <div className="min-h-screen bg-slate-100 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin h-8 w-8 border-4 border-violet-600 border-t-transparent rounded-full mx-auto mb-3" />
            <p className="text-sm text-slate-600">Loading creator's page…</p>
          </div>
        </div>
      </PageTransition>
    )
  }

  if (!profile) {
    return (
      <PageTransition>
        <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6 text-center">
          <div>
            <h2 className="text-2xl font-semibold text-slate-900">Creator not found</h2>
            <p className="text-sm text-slate-600 mt-3 max-w-md mx-auto">
              The creator <code className="px-1.5 py-0.5 rounded bg-slate-200">@{username}</code> doesn't exist on RENOWNHUB.
              They may have changed their username or removed their account.
            </p>
            <Link to="/" className="inline-block mt-6 px-6 py-3 bg-violet-600 text-white rounded-full font-semibold text-sm">
              Back to Home
            </Link>
          </div>
        </div>
      </PageTransition>
    )
  }

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
              {profile.is_verified && (
                <span className="inline-block mt-1 text-xs font-semibold text-emerald-700 bg-emerald-100 rounded-full px-2 py-0.5">
                  ✓ Verified
                </span>
              )}
              <p className="text-sm text-slate-700 mt-2 line-clamp-3">{profile.bio}</p>
              {profile.categories && profile.categories.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1 justify-center">
                  {profile.categories.map((c) => (
                    <span key={c} className="inline-block text-xs bg-white/70 rounded-full px-2 py-0.5 text-slate-700">{c}</span>
                  ))}
                </div>
              )}
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

            {/* Flash Message */}
            {message && (
              <div className={`px-4 py-3 text-sm font-medium border-b ${
                messageType === 'success' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                messageType === 'error' ? 'bg-red-50 text-red-700 border-red-200' :
                'bg-blue-50 text-blue-700 border-blue-200'
              }`}>
                {message}
              </div>
            )}

            {/* Posts Feed */}
            {activeTab === 'posts' && (
              <div className="p-4">
                {posts.length === 0 && (
                  <p className="text-sm text-slate-400 text-center py-8">No posts yet. Check back soon!</p>
                )}
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
                            <div className="relative w-full h-64 bg-slate-900 overflow-hidden">
                              {/* Blurred placeholder / locked overlay */}
                              {post.media_thumbnail ? (
                                <img
                                  src={post.media_thumbnail}
                                  alt=""
                                  aria-hidden="true"
                                  className="w-full h-full object-cover"
                                  style={{ filter: 'blur(30px) saturate(0.4) brightness(0.7)', transform: 'scale(1.2)' }}
                                  onContextMenu={e => e.preventDefault()}
                                  draggable={false}
                                />
                              ) : null}
                              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 backdrop-blur-md">
                                <svg className="h-12 w-12 text-white/90 mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                  <path d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                                </svg>
                                <span className="text-white font-bold text-base">Paid Content</span>
                                <span className="text-white/80 text-xs mt-1">Unlock to view full quality</span>
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
                            <p className="text-sm text-slate-400 line-clamp-2">{post.caption || 'This content is locked.'}</p>
                            <p className="text-xs text-slate-400 mt-2">Unlock to read the full text.</p>
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
                              <><div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Opening payment…</>
                            ) : (
                              <><svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" /></svg> Unlock for ₹{post.price}</>
                            )}
                          </button>
                        )}

                        {/* Unlocked Badge */}
                        {post.is_unlocked && post.post_type === 'paid' && (
                          <div className="mt-3 flex items-center gap-1.5 text-xs text-emerald-600">
                            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" /></svg>
                            Unlocked — thank you for supporting this creator!
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
                          {ev.max_attendees && (
                            <div className="text-xs text-slate-400 mt-0.5">Capacity: {ev.max_attendees}</div>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleBookEvent(ev)}
                          disabled={bookingEventId === ev.id}
                          className="px-3 py-2 rounded-lg bg-violet-600 text-white text-xs font-semibold disabled:opacity-50"
                        >
                          {bookingEventId === ev.id ? 'Booking…' : (ev.price_type === 'paid' ? `₹${ev.price}` : 'Free')}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="p-4 text-center border-t border-slate-200">
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
