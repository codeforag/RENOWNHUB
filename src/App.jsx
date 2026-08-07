import { Routes, Route, useLocation } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'

import Home from './pages/Home.jsx'
import SignIn from './pages/SignIn.jsx'
import SignUp from './pages/SignUp.jsx'
import CheckEmail from './pages/CheckEmail.jsx'
import ProfileStep from './pages/onboarding/ProfileStep.jsx'
import CategoryStep from './pages/onboarding/CategoryStep.jsx'
import SocialStep from './pages/onboarding/SocialStep.jsx'
import Dashboard from './pages/Dashboard.jsx'
import DashboardProfile from './pages/DashboardProfile.jsx'
import ConnectWithMeEdit from './pages/ConnectWithMeEdit.jsx'
import MembershipEdit from './pages/MembershipEdit.jsx'
import CreatorPosts from './pages/CreatorPosts.jsx'
import PreviewApp from './pages/PreviewApp.jsx'
import ShareApp from './pages/ShareApp.jsx'
import PublicCreator from './pages/PublicCreator.jsx'

export default function App() {
  const location = useLocation()

  return (
    <div className="bg-bg text-cream font-body min-h-screen" style={{ perspective: 1400 }}>
      <div className="grain" />
      <AnimatePresence mode="wait" initial={false}>
        <Routes location={location} key={location.pathname}>
          <Route path="/" element={<Home />} />
          <Route path="/signin" element={<SignIn />} />
          <Route path="/signup" element={<SignUp />} />
          <Route path="/check-email" element={<CheckEmail />} />
          <Route path="/onboarding/profile" element={<ProfileStep />} />
          <Route path="/onboarding/category" element={<CategoryStep />} />
          <Route path="/onboarding/social" element={<SocialStep />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/dashboard/profile" element={<DashboardProfile />} />
          <Route path="/dashboard/connect" element={<ConnectWithMeEdit />} />
          <Route path="/dashboard/membership" element={<MembershipEdit />} />
          <Route path="/dashboard/posts" element={<CreatorPosts />} />
          <Route path="/preview" element={<PreviewApp />} />
          <Route path="/share" element={<ShareApp />} />
          <Route path="/u/:username" element={<PublicCreator />} />
        </Routes>
      </AnimatePresence>
    </div>
  )
}
