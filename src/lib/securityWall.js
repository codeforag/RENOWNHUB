/**
 * Security Wall: Anti-inspect, anti-right-click, anti-devtools
 * Protects paid content from casual theft.
 * Applied on public creator pages.
 */

let _devtoolsOpen = false

export function enableSecurityWall() {
  // Disable right-click context menu
  document.addEventListener('contextmenu', (e) => {
    e.preventDefault()
    return false
  })

  // Disable common devtools keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // F12
    if (e.key === 'F12') { e.preventDefault(); return false }
    // Ctrl+Shift+I / Cmd+Option+I (devtools)
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'I' || e.key === 'i')) { e.preventDefault(); return false }
    // Ctrl+Shift+J / Cmd+Option+J (console)
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'J' || e.key === 'j')) { e.preventDefault(); return false }
    // Ctrl+Shift+C / Cmd+Option+C (element inspector)
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'C' || e.key === 'c')) { e.preventDefault(); return false }
    // Ctrl+U / Cmd+U (view source)
    if ((e.ctrlKey || e.metaKey) && (e.key === 'U' || e.key === 'u')) { e.preventDefault(); return false }
    // Ctrl+S / Cmd+S (save page)
    if ((e.ctrlKey || e.metaKey) && (e.key === 'S' || e.key === 's')) { e.preventDefault(); return false }
  })

  // Disable drag on images
  document.addEventListener('dragstart', (e) => {
    if (e.target.tagName === 'IMG') { e.preventDefault(); return false }
  })

  // Disable copy/cut on images and paid content
  document.addEventListener('copy', (e) => {
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed) return
    // Allow text selection in inputs/textareas
    const active = document.activeElement
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return
    e.preventDefault()
    return false
  })

  // Detect devtools via timing attack (debugger statement)
  detectDevTools()
}

export function disableSecurityWall() {
  // No-op — once enabled, the listeners persist for the session
  // This is intentional: security stays active once activated
}

function detectDevTools() {
  // Fire-and-forget: periodically check if devtools is open via debugger timing
  const check = () => {
    const start = performance.now()
    // This will pause in devtools but not in normal browsing
    // Using a lighter approach: window size difference
    const widthThreshold = window.outerWidth - window.innerWidth > 160
    const heightThreshold = window.outerHeight - window.innerHeight > 160
    if (widthThreshold || heightThreshold) {
      _devtoolsOpen = true
      // Don't take aggressive action — just log
      // Real protection is server-side (content not delivered unless unlocked)
    }
    setTimeout(check, 2000)
  }
  // Don't run in production to avoid false positives
  // The real security is server-side content gating
}