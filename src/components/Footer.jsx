export default function Footer() {
  return (
    <footer className="border-t border-white/5 py-14 px-6">
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
        <div className="flex items-center gap-2 font-display text-lg">
          <span className="inline-block h-2 w-2 rounded-full bg-gold" />
          Lumen
        </div>
        <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm text-muted">
          <a href="#" className="hover:text-cream transition-colors">
            About
          </a>
          <a href="#" className="hover:text-cream transition-colors">
            Terms
          </a>
          <a href="#" className="hover:text-cream transition-colors">
            Privacy
          </a>
          <a href="#" className="hover:text-cream transition-colors">
            Contact
          </a>
        </div>
        <div className="text-xs text-muted/60 font-mono">
          © 2026 Lumen. All rights reserved.
        </div>
      </div>
    </footer>
  )
}
