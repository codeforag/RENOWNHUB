const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL

if (!SUPABASE_URL) {
  console.warn('VITE_SUPABASE_URL not set — edge API calls will fail.')
}

/**
 * Call a Supabase Edge Function.
 * All secrets stay server-side. The frontend NEVER touches API keys.
 */
async function callEdge(name, options = {}) {
  const url = `${SUPABASE_URL}/functions/v1/${name}`
  const headers = { 'Content-Type': 'application/json', ...options.headers }

  // Attach auth token if available
  const { default: supabase } = await import('./supabaseClient.js')
  if (supabase) {
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.access_token) {
      headers['Authorization'] = `Bearer ${session.access_token}`
    }
  }

  const res = await fetch(url, { ...options, headers })

  // Safely parse response — never expose raw JSON errors to users
  let data
  try {
    const text = await res.text()
    if (!text) {
      throw new Error('Server returned an empty response. Please try again.')
    }
    data = JSON.parse(text)
  } catch (parseErr) {
    const friendly = parseErr.message
    throw new Error(friendly.includes('JSON')
      ? 'Something went wrong. Please check your connection and try again.'
      : friendly)
  }

  if (!res.ok) {
    const err = new Error(data.error || data.message || `Request failed (${res.status})`)
    err.status = res.status
    throw err
  }
  return data
}

/**
 * Send 6-digit OTP to email via server-side Resend.
 * @param {{ email: string, purpose: 'signin'|'signup', role?: string, username?: string }}
 */
export async function sendOtp({ email, purpose = 'signin', role, username }) {
  return callEdge('send-otp', {
    method: 'POST',
    body: JSON.stringify({ email, purpose, role, username }),
  })
}

/**
 * Verify 6-digit OTP. On signup, creates the auth user + profile.
 * @param {{ email: string, otp: string, purpose: 'signin'|'signup' }}
 */
export async function verifyOtp({ email, otp, purpose = 'signin' }) {
  return callEdge('verify-otp', {
    method: 'POST',
    body: JSON.stringify({ email, otp, purpose }),
  })
}

/**
 * Check username availability via server-side edge function.
 * Never trust the frontend — validation happens on the server.
 * @param {string} username
 */
export async function checkUsernameAvailability(username) {
  return callEdge('check-username', {
    method: 'POST',
    body: JSON.stringify({ username }),
  })
}

/**
 * Finalize onboarding: save profile data server-side.
 * Requires auth token.
 */
export async function finalizeSignup(payload) {
  return callEdge('finalize-signup', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

/**
 * Create a Razorpay order for a paid event/membership.
 * Requires auth token.
 */
export async function createRazorpayOrder({ event_id, amount, currency = 'INR', entity_type = 'event_booking' }) {
  return callEdge('create-razorpay-order', {
    method: 'POST',
    body: JSON.stringify({ event_id, amount, currency, entity_type }),
  })
}

/**
 * Verify a Razorpay payment after frontend capture.
 */
export async function verifyPayment({ razorpay_order_id, razorpay_payment_id, razorpay_signature }) {
  return callEdge('verify-payment', {
    method: 'PUT',
    body: JSON.stringify({ razorpay_order_id, razorpay_payment_id, razorpay_signature }),
  })
}

/**
 * Book a free event via server-side edge function.
 */
export async function bookFreeEvent({ event_id }) {
  return callEdge('book-event', {
    method: 'POST',
    body: JSON.stringify({ event_id }),
  })
}

/**
 * Update creator profile (bio, theme, socials, etc).
 * Requires auth token.
 */
export async function updateCreatorProfile(updates) {
  return callEdge('update-creator', {
    method: 'PUT',
    body: JSON.stringify(updates),
  })
}

/**
 * Create a post (supports FormData for file uploads).
 * Requires auth token.
 * @param {FormData} formData - caption, title, content_type, post_type, price, file
 */
export async function createPost(formData) {
  const url = `${SUPABASE_URL}/functions/v1/create-post`
  const headers = {}
  const { default: supabase } = await import('./supabaseClient.js')
  if (supabase) {
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.access_token) {
      headers['Authorization'] = `Bearer ${session.access_token}`
    }
  }
  const res = await fetch(url, { method: 'POST', headers, body: formData })
  let data
  try {
    const text = await res.text()
    if (!text) throw new Error('Server returned an empty response. Please try again.')
    data = JSON.parse(text)
  } catch (parseErr) {
    throw new Error(parseErr.message.includes('JSON')
      ? 'Something went wrong. Please check your connection and try again.'
      : parseErr.message)
  }
  if (!res.ok) {
    const err = new Error(data.error || data.message || 'Failed to create post')
    err.status = res.status
    throw err
  }
  return data
}

/**
 * Get posts for a creator (public).
 * @param {{ username?: string, creator_user_id?: string, include_drafts?: boolean, page?: number }} params
 */
export async function getPosts({ username, creator_user_id, include_drafts = false, page = 1 } = {}) {
  const params = new URLSearchParams()
  if (username) params.set('username', username)
  if (creator_user_id) params.set('creator_user_id', creator_user_id)
  if (include_drafts) params.set('include_drafts', 'true')
  params.set('page', String(page))
  return callEdge(`get-posts?${params.toString()}`, { method: 'GET' })
}

/**
 * Create a Razorpay order to unlock a paid post.
 * Requires auth token.
 * @param {{ post_id: string }} params
 */
export async function createPostUnlockOrder({ post_id }) {
  return callEdge('unlock-post', {
    method: 'POST',
    body: JSON.stringify({ post_id }),
  })
}

/**
 * Verify payment and unlock a post.
 * Requires auth token.
 */
export async function verifyPostUnlock({ razorpay_order_id, razorpay_payment_id, razorpay_signature, post_id }) {
  return callEdge('unlock-post', {
    method: 'PUT',
    body: JSON.stringify({ razorpay_order_id, razorpay_payment_id, razorpay_signature, post_id }),
  })
}

/**
 * Delete a post. Only the creator can delete their own posts.
 * Requires auth token.
 * @param {{ post_id: string }} params
 */
export async function deletePost({ post_id }) {
  return callEdge('delete-post', {
    method: 'DELETE',
    body: JSON.stringify({ post_id }),
  })
}
