const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL

if (!SUPABASE_URL) {
  console.warn(
    'VITE_SUPABASE_URL is not set — backend API calls will fail. ' +
    'Create a .env file at the project root with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (see .env.example).'
  )
}

/**
 * Convert a network or server error into a user-friendly message.
 * NEVER returns "Something went wrong" — always tells the user what failed and what to do.
 */
function friendlyError(err, fallback) {
  if (!err) return fallback || 'Request failed for an unknown reason. Please try again.'

  // Network / fetch errors (TypeError: Failed to fetch)
  if (err.name === 'TypeError' && /fetch/i.test(err.message)) {
    return 'Network error: could not reach the server. Check your internet connection and try again.'
  }

  // Already a structured Error from callEdge (has a message from the server)
  if (err.message) return err.message

  return fallback || 'Request failed. Please try again.'
}

/**
 * Call a Supabase Edge Function.
 * All secrets stay server-side. The frontend NEVER touches API keys.
 *
 * @param {string} name - function name + optional query string
 * @param {object} options - fetch options
 * @param {boolean} options.raw - if true, return the raw response object (for FormData)
 */
async function callEdge(name, options = {}) {
  if (!SUPABASE_URL) {
    const err = new Error(
      'Backend is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file (see .env.example).'
    )
    err.code = 'missing_config'
    throw err
  }

  const url = `${SUPABASE_URL}/functions/v1/${name}`
  const headers = { 'Content-Type': 'application/json', ...options.headers }

  // Attach auth token if available
  const { default: supabase } = await import('./supabaseClient.js')
  if (supabase) {
    try {
      const { data: { session }, error: sessionErr } = await supabase.auth.getSession()
      if (sessionErr) {
        // Session might be expired or invalid — refresh silently
        console.warn('Session error in edgeApi:', sessionErr.message)
      }
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`
      }
    } catch (e) {
      // Don't fail the call — let the edge function decide whether auth is required
      console.warn('Failed to read session for edge call:', e.message)
    }
  }

  let res
  try {
    res = await fetch(url, { ...options, headers })
  } catch (fetchErr) {
    const err = new Error(
      `Network error reaching the server: ${fetchErr.message}. Check your internet connection and try again.`
    )
    err.code = 'network_error'
    err.cause = fetchErr
    throw err
  }

  // Parse response — never swallow server messages
  let data
  try {
    const text = await res.text()
    if (!text) {
      const err = new Error(
        `Server returned an empty response (status ${res.status}). Please try again in a moment; if it persists, contact support.`
      )
      err.code = 'empty_response'
      err.status = res.status
      throw err
    }
    data = JSON.parse(text)
  } catch (parseErr) {
    if (parseErr.code === 'empty_response') throw parseErr
    const err = new Error(
      `Server returned an invalid response (status ${res.status}). This may be a temporary issue — please try again.`
    )
    err.code = 'bad_response'
    err.status = res.status
    err.cause = parseErr
    throw err
  }

  if (!res.ok) {
    // The server's error message is the source of truth
    const serverMessage = data.error || data.message
    const err = new Error(
      serverMessage ||
      `Request failed with status ${res.status}${data.code ? ` (code: ${data.code})` : ''}. Please try again.`
    )
    err.status = res.status
    err.code = data.code
    err.field = data.field
    err.retry_after_seconds = data.retry_after_seconds
    throw err
  }

  return data
}

/**
 * Send 6-digit OTP to email via server-side Resend.
 * Rate limited server-side: 5 per 10 minutes per email, 500 per hour globally.
 *
 * For signup purpose, acceptedTerms and acceptedAge MUST be `true` (boolean),
 * otherwise the server rejects with terms_not_accepted / age_not_confirmed.
 *
 * @param {{
 *   email: string,
 *   purpose: 'signin'|'signup',
 *   role?: string,
 *   username?: string,
 *   acceptedTerms?: boolean,
 *   acceptedAge?: boolean,
 * }} params
 */
export async function sendOtp({ email, purpose = 'signin', role, username, acceptedTerms, acceptedAge }) {
  if (!email) throw new Error('Email address is required to send a verification code.')
  // Coerce to actual booleans (in case a form sends "true" string or undefined)
  const payload = {
    email,
    purpose,
    role,
    username,
  }
  if (purpose === 'signup') {
    payload.acceptedTerms = acceptedTerms === true
    payload.acceptedAge = acceptedAge === true
  }
  return callEdge('send-otp', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

/**
 * Verify 6-digit OTP. On signup, creates the auth user + profile.
 * Returns session tokens that the caller MUST pass to supabase.auth.setSession().
 * @param {{ email: string, otp: string, purpose: 'signin'|'signup' }}
 */
export async function verifyOtp({ email, otp, purpose = 'signin' }) {
  if (!email) throw new Error('Email is required to verify the code.')
  if (!otp) throw new Error('Verification code is required.')
  if (otp.length !== 6) throw new Error('Verification code must be 6 digits.')
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
  if (!username) throw new Error('Username is required to check availability.')
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
 * Create a Razorpay order for a paid event/membership/service.
 * Requires auth token.
 */
export async function createRazorpayOrder({ event_id, amount, currency = 'INR', entity_type = 'event_booking' }) {
  if (!event_id) throw new Error('Event ID is required to create a payment order.')
  if (!amount || amount <= 0) throw new Error('A valid amount is required.')
  return callEdge('create-razorpay-order', {
    method: 'POST',
    body: JSON.stringify({ event_id, amount, currency, entity_type }),
  })
}

/**
 * Verify a Razorpay payment after frontend capture (event bookings).
 */
export async function verifyPayment({ razorpay_order_id, razorpay_payment_id, razorpay_signature }) {
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    throw new Error('All payment details (order ID, payment ID, and signature) are required to verify the payment.')
  }
  return callEdge('verify-payment', {
    method: 'PUT',
    body: JSON.stringify({ razorpay_order_id, razorpay_payment_id, razorpay_signature }),
  })
}

/**
 * Book a free event via server-side edge function. Requires auth.
 */
export async function bookFreeEvent({ event_id }) {
  if (!event_id) throw new Error('Event ID is required to book.')
  return callEdge('book-event', {
    method: 'POST',
    body: JSON.stringify({ event_id }),
  })
}

/**
 * Create a live event (creators only). Requires auth.
 */
export async function createLiveEvent(payload) {
  return callEdge('create-event', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

/**
 * Update creator profile (bio, theme, socials, username, etc).
 * Requires auth + creator role.
 */
export async function updateCreatorProfile(updates) {
  return callEdge('update-creator', {
    method: 'PUT',
    body: JSON.stringify(updates),
  })
}

/**
 * Create a post (supports FormData for file uploads).
 * Requires auth + creator role.
 * @param {FormData} formData - caption, title, content_type, post_type, price, file
 */
export async function createPost(formData) {
  if (!SUPABASE_URL) {
    throw new Error('Backend is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file.')
  }
  const url = `${SUPABASE_URL}/functions/v1/create-post`
  const headers = {}
  const { default: supabase } = await import('./supabaseClient.js')
  if (supabase) {
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.access_token) {
      headers['Authorization'] = `Bearer ${session.access_token}`
    }
  }
  let res
  try {
    res = await fetch(url, { method: 'POST', headers, body: formData })
  } catch (fetchErr) {
    const err = new Error(`Network error uploading post: ${fetchErr.message}. Check your connection and try again.`)
    err.code = 'network_error'
    throw err
  }
  let data
  try {
    const text = await res.text()
    if (!text) throw new Error(`Server returned an empty response (status ${res.status}). Please try again.`)
    data = JSON.parse(text)
  } catch (parseErr) {
    const err = new Error(`Server returned an invalid response (status ${res.status}). Please try again.`)
    err.status = res.status
    throw err
  }
  if (!res.ok) {
    const err = new Error(data.error || data.message || `Failed to create post (status ${res.status}).`)
    err.status = res.status
    err.code = data.code
    err.field = data.field
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
 * Create a Razorpay order to unlock a paid post. Requires auth.
 * @param {{ post_id: string }} params
 */
export async function createPostUnlockOrder({ post_id }) {
  if (!post_id) throw new Error('Post ID is required to create unlock order.')
  return callEdge('unlock-post', {
    method: 'POST',
    body: JSON.stringify({ post_id }),
  })
}

/**
 * Verify payment and unlock a post. Requires auth.
 */
export async function verifyPostUnlock({ razorpay_order_id, razorpay_payment_id, razorpay_signature, post_id }) {
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !post_id) {
    throw new Error('All payment details and post ID are required to verify the unlock.')
  }
  return callEdge('unlock-post', {
    method: 'PUT',
    body: JSON.stringify({ razorpay_order_id, razorpay_payment_id, razorpay_signature, post_id }),
  })
}

/**
 * Delete a post. Only the creator can delete their own posts.
 * Requires auth.
 * @param {{ post_id: string }} params
 */
export async function deletePost({ post_id }) {
  if (!post_id) throw new Error('Post ID is required to delete.')
  return callEdge('delete-post', {
    method: 'DELETE',
    body: JSON.stringify({ post_id }),
  })
}

export { friendlyError }
