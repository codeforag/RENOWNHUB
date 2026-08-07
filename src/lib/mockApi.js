// Mock backend calls. Swap these for real API requests once the backend
// exists — every function returns a Promise so the call sites don't change.

const RESERVED_USERNAMES = ['admin', 'test', 'lumen', 'root', 'support', 'help']

/** Simulates a debounced server-side username availability check. */
export function checkUsernameAvailability(username) {
  return new Promise((resolve) => {
    setTimeout(() => {
      const taken = RESERVED_USERNAMES.includes(username.toLowerCase())
      resolve({ available: !taken })
    }, 600)
  })
}

/** Simulates sending a 6-digit OTP to an email/phone. */
export function sendOtp(identifier) {
  console.info(`[mock] OTP sent to ${identifier}. Demo code: 123456`)
  return new Promise((resolve) => setTimeout(() => resolve({ sent: true }), 400))
}

/** Simulates verifying the OTP. Demo code "123456" always succeeds. */
export function verifyOtp(identifier, code) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({ valid: code === '123456' })
    }, 500)
  })
}
