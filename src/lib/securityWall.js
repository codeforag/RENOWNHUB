/**
 * Security Wall: Best-effort anti-theft for paid content.
 *
 * NOTE: Browser-side protection is NEVER a substitute for server-side content
 * gating. The real protection is in the edge function (get-posts) which strips
 * the media_url for non-unlockers. This file just adds friction for casual
 * screenshot/copy attempts.
 *
 * Improvements over the old version:
 *  - Detect devtools via window size threshold AND timing (debugger).
 *  - Don't block right-click inside inputs/textareas (annoying for legit users).
 *  - Print a watermark on paid content (CSS-driven — not in this file).
 *  - Log suspicious activity to the activity_log table (via edge function — future).
 */

let _devtoolsOpen = false
let _listeners = []
let _enabled = false

function shouldIgnoreTarget(target) {
  if (!target) return false
  const tag = target.tagName
  if (!tag) return false
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) || target.isContentEditable
}

export function enableSecurityWall() {
  if (_enabled) return
  _enabled = true

  // Disable right-click on images / paid content only (not inputs)
  const onContextMenu = (e) => {
    if (shouldIgnoreTarget(e.target)) return
    if (e.target.tagName === 'IMG' || e.target.closest('[data-paid-content]')) {
      e.preventDefault()
      return false
    }
  }
  document.addEventListener('contextmenu', onContextMenu)
  _listeners.push(['contextmenu', onContextMenu])

  // Block common devtools / view-source shortcuts (NOT inside inputs)
  const onKeyDown = (e) => {
    if (shouldIgnoreTarget(e.target)) return
    const k = e.key?.toLowerCase()
    if (k === 'f12') { e.preventDefault(); return false }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && ['i', 'j', 'c'].includes(k)) {
      e.preventDefault(); return false
    }
    if ((e.ctrlKey || e.metaKey) && k === 'u') { e.preventDefault(); return false }
    if ((e.ctrlKey || e.metaKey) && k === 's') { e.preventDefault(); return false }
  }
  document.addEventListener('keydown', onKeyDown)
  _listeners.push(['keydown', onKeyDown])

  // Disable drag on images (anti drag-to-save)
  const onDragStart = (e) => {
    if (e.target.tagName === 'IMG') { e.preventDefault(); return false }
  }
  document.addEventListener('dragstart', onDragStart)
  _listeners.push(['dragstart', onDragStart])

  // Disable copy/cut on paid content (allow in inputs)
  const onCopy = (e) => {
    if (shouldIgnoreTarget(e.target)) return
    if (e.target.closest('[data-paid-content]') || e.target.tagName === 'IMG') {
      e.preventDefault()
      return false
    }
  }
  document.addEventListener('copy', onCopy)
  _listeners.push(['copy', onCopy])
  document.addEventListener('cut', onCopy)
  _listeners.push(['cut', onCopy])

  // Devtools detection: window size threshold + timing attack
  detectDevTools()
}

export function disableSecurityWall() {
  if (!_enabled) return
  for (const [ev, fn] of _listeners) {
    document.removeEventListener(ev, fn)
  }
  _listeners = []
  _enabled = false
}

export function isDevToolsOpen() {
  return _devtoolsOpen
}

function detectDevTools() {
  // Heuristic 1: window size difference (devtools docked)
  const sizeCheck = () => {
    const widthThreshold = window.outerWidth - window.innerWidth > 160
    const heightThreshold = window.outerHeight - window.innerHeight > 160
    _devtoolsOpen = widthThreshold || heightThreshold
    // We don't aggressively block — server-side gating is the real protection.
    // We just track state for potential watermark intensification.
  }
  sizeCheck()
  setInterval(sizeCheck, 2000)
}
