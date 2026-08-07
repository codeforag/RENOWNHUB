# Lumen — Creator Platform

React + Vite, Tailwind CSS, Framer Motion, React Router. A creator-monetization
landing page plus a full sign-in / sign-up / OTP / onboarding flow with
URL-based routing, input validation, and animated 3D page transitions.

## Getting started

```bash
npm install
npm run dev
```

Open the local URL Vite prints (usually `http://localhost:5173`).

```bash
npm run build
npm run preview
```

## Routes

| Route | Purpose |
|---|---|
| `/` | Landing page |
| `/signin` | Sign in with email or username |
| `/signup` | Create an account (email + username, with live availability check) |
| `/verify-otp?flow=signin\|signup&identifier=...` | 6-digit OTP, 60s resend timer |
| `/onboarding/profile` | Full name, gender, date of birth (18+ required) |
| `/onboarding/category` | "What defines you best?" — up to 3 category cards |
| `/onboarding/social` | Optional social profile links, with format validation |
| `/dashboard` | Landing spot after sign-in or completed onboarding |

Each onboarding step redirects back to the appropriate earlier step if
visited directly out of order (e.g. hitting `/onboarding/social` before
`/onboarding/profile` is complete bounces you back).

## Backend is mocked

There's no real backend wired up yet — `src/lib/mockApi.js` simulates:

- **Username availability** — `admin`, `test`, `lumen`, `root`, `support`,
  `help` are "taken"; anything else is "available" after a short delay.
- **OTP send/verify** — any request "sends" an OTP; the demo code that
  verifies successfully is **`123456`**. Any other 6 digits shows the
  "incorrect code" error state so you can see that path too.

Swap the functions in `mockApi.js` for real API calls — none of the call
sites need to change, since they already just `await` a promise.

## State across the flow

`src/context/AuthFlowContext.jsx` holds sign-up/onboarding answers in memory
and mirrors them to `sessionStorage`, so a refresh mid-flow doesn't lose
progress. It resets automatically when the browser tab/session ends.

## Design

Same "backstage / spotlight" identity as the original landing page —
deep plum background, gold spotlight accent, coral secondary, Fraunces +
Manrope + Space Mono. Auth and onboarding screens reuse the spotlight
backdrop and the same button/card language so the whole flow feels like one
product. Page transitions use a subtle 3D slide (`PageTransition.jsx`) via
Framer Motion's `AnimatePresence`.

## Structure

```
src/
  components/       shared UI: Nav, Hero, TiltCard, PassCard, AuthLayout,
                     OtpInput, TextField, PageTransition, and the landing
                     page sections
  context/
    AuthFlowContext.jsx   in-memory + sessionStorage flow state
  lib/
    mockApi.js             mock username check / OTP send / OTP verify
  pages/
    Home.jsx                the landing page
    SignIn.jsx
    SignUp.jsx
    VerifyOtp.jsx
    Dashboard.jsx
    onboarding/
      ProfileStep.jsx
      CategoryStep.jsx
      SocialStep.jsx
  App.jsx             route table + animated transitions
  main.jsx            BrowserRouter + AuthFlowProvider + App
```
