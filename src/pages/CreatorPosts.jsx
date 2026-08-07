import { useEffect, useState, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import PageTransition from '../components/PageTransition.jsx'
import supabase from '../lib/supabaseClient.js'
import { createPost, getPosts, deletePost } from '../lib/edgeApi.js'

export default function CreatorPosts() {
  const navigate = useNavigate()
  const fileRef = useRef(null)
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState('')
  const [caption, setCaption] = useState('')
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [postType, setPostType] = useState('free')
  const [price, setPrice] = useState('')
  const [creator, setCreator] = useState(null)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      if (!supabase) {
        if (mounted) { setLoading(false); setMessage('Backend not configured.'); setMessageType('error') }
        return
      }
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          navigate('/signin', { replace: true, state: { redirect: '/dashboard/posts' } })
          return
        }
        if (mounted) setCreator({ id: user.id })
        await loadPosts(user.id)
      } catch (err) {
        console.error('CreatorPosts init error:', err)
        if (mounted) {
          setMessage(`Failed to load: ${err.message}`)
          setMessageType('error')
          setLoading(false)
        }
      }
    })()
    return () => { mounted = false }
  }, [navigate])

  async function loadPosts(creatorUserId) {
    try {
      // Pass creator_user_id so the edge function can filter; include_drafts=true so we see our own drafts
      const data = await getPosts({ creator_user_id: creatorUserId, include_drafts: true })
      setPosts(data.posts || [])
    } catch (err) {
      console.error('loadPosts error:', err)
      setMessage(`Failed to load posts: ${err.message}`)
      setMessageType('error')
    } finally {
      setLoading(false)
    }
  }

  function flash(msg, type = 'info') {
    setMessage(msg)
    setMessageType(type)
  }

  function handleFileChange(e) {
    const f = e.target.files[0]
    if (!f) return
    setFile(f)
    const reader = new FileReader()
    reader.onload = () => setPreview(reader.result)
    reader.readAsDataURL(f)
  }

  async function handleUpload() {
    setMessage('')
    if (!caption.trim() && !file) {
      flash('Add a caption or upload an image/video to publish a post.', 'error')
      return
    }
    if (postType === 'paid') {
      const p = parseFloat(price)
      if (isNaN(p) || p <= 0) {
        flash('Set a valid price for paid posts (must be greater than ₹0).', 'error')
        return
      }
      if (p < 1 || p > 10000) {
        flash(`Price must be between ₹1 and ₹10,000 (you entered ₹${p}).`, 'error')
        return
      }
    }

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('caption', caption.trim())
      formData.append('content_type', file ? (file.type.startsWith('video') ? 'video' : 'image') : 'text')
      formData.append('post_type', postType)
      if (postType === 'paid') formData.append('price', price)
      if (file) formData.append('file', file)

      const result = await createPost(formData)
      flash(result.message || 'Post published successfully!', 'success')
      setCaption('')
      setFile(null)
      setPreview(null)
      setPostType('free')
      setPrice('')
      if (fileRef.current) fileRef.current.value = ''
      if (creator?.id) await loadPosts(creator.id)
    } catch (err) {
      console.error('upload error:', err)
      flash(`Upload failed: ${err.message}`, 'error')
    } finally {
      setUploading(false)
    }
  }

  async function handleDelete(postId) {
    if (!confirm('Delete this post? This cannot be undone. Anyone who unlocked it will lose access.')) return
    try {
      const result = await deletePost({ post_id: postId })
      flash(result.message || 'Post deleted.', 'success')
      setPosts(prev => prev.filter(p => p.id !== postId))
    } catch (err) {
      console.error('delete error:', err)
      flash(`Delete failed: ${err.message}`, 'error')
    }
  }

  return (
    <PageTransition>
      <div className="min-h-screen bg-slate-100 text-slate-900 pb-8">
        <div className="max-w-2xl mx-auto px-4 py-4 md:py-8">
          {/* Header */}
          <header className="mb-6 flex items-center justify-between">
            <button type="button" onClick={() => navigate('/dashboard')} className="rounded-3xl bg-white p-3 shadow-sm ring-1 ring-slate-200">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 19l-7-7 7-7" /></svg>
            </button>
            <h1 className="text-lg font-semibold">My Posts</h1>
            <div className="w-11" />
          </header>

          {/* Upload Section */}
          <section className="mb-6 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <h2 className="text-base font-semibold mb-4">New Post</h2>

            {/* Image Preview */}
            {preview && (
              <div className="relative mb-4 rounded-xl overflow-hidden bg-slate-100">
                <img src={preview} alt="preview" className="w-full max-h-64 object-cover" />
                <button
                  type="button"
                  onClick={() => { setFile(null); setPreview(null); if (fileRef.current) fileRef.current.value = '' }}
                  className="absolute top-2 right-2 rounded-full bg-black/60 p-1.5 text-white"
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
                </button>
              </div>
            )}

            {/* File Input */}
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm" onChange={handleFileChange} className="hidden" />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="mb-4 w-full rounded-xl border-2 border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 hover:border-violet-400 hover:text-violet-600 transition"
            >
              <svg viewBox="0 0 24 24" className="h-8 w-8 mx-auto mb-2" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 16V8m0 0l-3 3m3-3l3 3M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5" /></svg>
              Tap to add photo or video
            </button>

            {/* Caption */}
            <textarea
              value={caption}
              onChange={e => setCaption(e.target.value)}
              placeholder="Write a caption..."
              rows={3}
              className="w-full rounded-xl border border-slate-200 p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-violet-500 mb-4"
            />

            {/* Post Type Toggle */}
            <div className="flex items-center gap-3 mb-4">
              <span className="text-sm font-medium">Free</span>
              <button
                type="button"
                onClick={() => setPostType(postType === 'free' ? 'paid' : 'free')}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${postType === 'paid' ? 'bg-violet-600' : 'bg-slate-300'}`}
              >
                <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${postType === 'paid' ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
              <span className="text-sm font-medium">Paid</span>
            </div>

            {/* Price Input */}
            {postType === 'paid' && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-700 mb-1">Price (INR)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">₹</span>
                  <input
                    type="number"
                    value={price}
                    onChange={e => setPrice(e.target.value)}
                    placeholder="99"
                    min="1"
                    max="10000"
                    className="w-full rounded-xl border border-slate-200 py-2.5 pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>
              </div>
            )}

            {/* Upload Button */}
            <button
              type="button"
              onClick={handleUpload}
              disabled={uploading}
              className="w-full rounded-xl bg-violet-600 py-3 text-sm font-semibold text-white shadow hover:bg-violet-700 disabled:opacity-50 transition"
            >
              {uploading ? 'Uploading...' : 'Post'}
            </button>

            {message && (
              <p className={`mt-3 text-center text-sm ${
                messageType === 'success' ? 'text-emerald-600' :
                messageType === 'error' ? 'text-red-600' :
                'text-slate-600'
              }`}>{message}</p>
            )}
          </section>

          {/* Posts List */}
          <section>
            <h2 className="text-base font-semibold mb-3">Your Posts</h2>
            {loading && <p className="text-sm text-slate-500">Loading...</p>}
            {!loading && posts.length === 0 && (
              <div className="rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-200">
                <svg viewBox="0 0 24 24" className="h-12 w-12 mx-auto text-slate-300 mb-3" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" /></svg>
                <p className="text-sm text-slate-500">No posts yet. Create your first post above!</p>
              </div>
            )}
            <div className="space-y-3">
              {posts.map(post => (
                <div key={post.id} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
                  <div className="flex items-start gap-3">
                    {post.media_url ? (
                      <img src={post.media_url} alt={post.title || ''} className="h-16 w-16 rounded-lg object-cover flex-shrink-0" />
                    ) : (
                      <div className="h-16 w-16 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                        <svg viewBox="0 0 24 24" className="h-6 w-6 text-slate-400" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 011.037-.443 48.282 48.282 0 005.68-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" /></svg>
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${post.post_type === 'paid' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                          {post.post_type === 'paid' ? `₹${post.price}` : 'FREE'}
                        </span>
                        {!post.is_published && (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">DRAFT</span>
                        )}
                      </div>
                      <p className="text-sm text-slate-800 mt-1 line-clamp-2">{post.caption || 'No caption'}</p>
                      <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-400">
                        <span>{post.unlocks_count || 0} unlocks</span>
                        <span>{new Date(post.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDelete(post.id)}
                      className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 transition flex-shrink-0"
                    >
                      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </PageTransition>
  )
}