import supabase from './supabaseClient.js'

export async function signUpUser({ email, password, username, role = 'user' }) {
  if (!supabase) throw new Error('Supabase not configured')
  // Create auth user
  const { data, error } = await supabase.auth.signUp({ email, password }, { data: { role, username } })
  if (error) throw error
  // create profile row in creators or users table depending on role
  if (role === 'creator') {
    await supabase.from('creators').upsert({ user_id: data.user.id, username, display_name: username })
  } else {
    await supabase.from('users').upsert({ user_id: data.user.id, username, display_name: username })
  }
  return data
}

export async function sendMagicLink({ email }) {
  if (!supabase) throw new Error('Supabase not configured')
  const { data, error } = await supabase.auth.signInWithOtp({ email })
  if (error) throw error
  return data
}

export async function signInUser({ email, password }) {
  if (!supabase) throw new Error('Supabase not configured')
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data
}

export async function signOut() {
  if (!supabase) return
  await supabase.auth.signOut()
}

export async function getCurrentUser() {
  if (!supabase) return null
  const { data } = await supabase.auth.getUser()
  return data?.user ?? null
}
