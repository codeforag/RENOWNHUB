# MALLU CUPID — Creator Platform

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
| `/signin` | Sign in with 6-digit email OTP |
| `/signup` | Create an account (email + username, 6-digit OTP verification) |
| `/onboarding/profile` | Full name, gender, date of birth (18+ required) |
| `/onboarding/category` | "What defines you best?" — up to 3 category cards |
| `/onboarding/social` | Optional social profile links, with format validation |
| `/dashboard` | Creator dashboard (mobile) |
| `/dashboard/profile` | Edit creator profile |
| `/dashboard/connect` | Manage "Connect with Me" services |
| `/dashboard/membership` | Manage membership tiers & subscribers |
| `/u/:username` | Public creator page |

## Deployment — Cloudflare Pages

### 1. Push to GitHub

```bash
git init && git add -A && git commit -m "initial"
git remote add origin <your-github-repo-url>
git push -u origin main
```

### 2. Connect to Cloudflare Pages

1. Go to **Cloudflare Dashboard** → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
2. Select your GitHub repository
3. Configure build settings:
   - **Framework preset:** `None`
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
4. Add environment variables:
   - `VITE_SUPABASE_URL` = your Supabase project URL
   - `VITE_SUPABASE_ANON_KEY` = your Supabase anon/public key
5. Click **Save and Deploy**

### 3. Custom Domain

In Cloudflare Pages → **Custom domains** → add `mallucupid.com`.
Since the domain is already on Cloudflare, it will auto-provision SSL.

## Backend (Supabase)

Environment variables (set in Cloudflare Pages settings or local `.env`):

- `VITE_SUPABASE_URL` — your Supabase project URL
- `VITE_SUPABASE_ANON_KEY` — your Supabase anon/public key

The app uses Supabase Edge Functions for all backend operations:
- **Auth:** 6-digit email OTP via Resend (server-side only)
- **Username check:** Server-side availability validation
- **Payments:** Razorpay order creation + webhook verification
- **Bookings:** Server-side validation with capacity & double-booking prevention
- **Profiles:** Server-side creator profile updates

All secrets (Resend API key, Razorpay keys, service role key) are stored in
Supabase Edge Function environment — **never exposed to the frontend**.

See `DOCUMENTATIONS.md` for full schema, RLS policies, and edge function details.

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
    AuthFlowContext.jsx   in-memory + sessionStorage + Supabase flow state
  lib/
    edgeApi.js            Edge function client (all backend calls)
    supabaseClient.js     Supabase client singleton
    mockApi.js             Re-exports from edgeApi.js
  pages/
    Home.jsx                the landing page
    SignIn.jsx              6-digit OTP sign-in
    SignUp.jsx              6-digit OTP sign-up with username check
    Dashboard.jsx           Creator dashboard
    PublicCreator.jsx       Public creator page (/u/:username)
    onboarding/
      ProfileStep.jsx
      CategoryStep.jsx
      SocialStep.jsx
  App.jsx             route table + animated transitions
  main.jsx            BrowserRouter + AuthFlowProvider + App
supabase/
  functions/           Edge Functions (Deno, deployed to Supabase)
    send-otp/             6-digit OTP via Resend
    verify-otp/           OTP verification + user creation
    check-username/       Server-side username availability
    finalize-signup/      Save onboarding data
    create-razorpay-order/ Razorpay order creation
    verify-payment/       Razorpay payment verification
    book-event/           Free event booking
    update-creator/       Creator profile updates
  migrations/           SQL migration files
public/
  _redirects            Cloudflare Pages SPA routing
  _headers              Security headers
```
