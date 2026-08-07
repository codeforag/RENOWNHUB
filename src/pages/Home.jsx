import Nav from '../components/Nav.jsx'
import Hero from '../components/Hero.jsx'
import WhoFor from '../components/WhoFor.jsx'
import BrandCollab from '../components/BrandCollab.jsx'
import Fanbase from '../components/Fanbase.jsx'
import Income from '../components/Income.jsx'
import Monetize from '../components/Monetize.jsx'
import HowItWorks from '../components/HowItWorks.jsx'
import PassCTA from '../components/PassCTA.jsx'
import Footer from '../components/Footer.jsx'
import PageTransition from '../components/PageTransition.jsx'

export default function Home() {
  return (
    <PageTransition>
      <Nav />
      <main>
        <Hero />
        <WhoFor />
        <BrandCollab />
        <Fanbase />
        <Income />
        <Monetize />
        <HowItWorks />
        <PassCTA />
      </main>
      <Footer />
    </PageTransition>
  )
}
