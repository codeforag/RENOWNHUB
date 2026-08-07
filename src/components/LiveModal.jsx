import { useState } from 'react'
import { useAuthFlow } from '../context/AuthFlowContext.jsx'
import { createLiveEvent } from '../lib/edgeApi.js'

export default function LiveModal({ open, onClose }) {
  const { liveEvents = [], update } = useAuthFlow()
  const [when, setWhen] = useState('now')
  const [datetime, setDatetime] = useState(() => {
    const d = new Date(Date.now() + 5 * 60 * 1000) // default 5 min in future
    return d.toISOString().slice(0, 16)
  })
  const [priceType, setPriceType] = useState('free')
  const [price, setPrice] = useState('99')
  const [title, setTitle] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  if (!open) return null

  async function handleCreate() {
    setError('')
    if (!title.trim()) {
      setError('Event title is required.')
      return
    }
    if (title.trim().length < 3) {
      setError('Event title must be at least 3 characters.')
      return
    }
    if (priceType === 'paid') {
      const p = parseFloat(price)
      if (isNaN(p) || p <= 0) {
        setError('Paid events need a valid price greater than 0.')
        return
      }
      if (p > 100000) {
        setError('Price must be ₹100,000 or less.')
        return
      }
    }

    setSaving(true)
    try {
      const whenIso = when === 'now'
        ? new Date().toISOString()
        : new Date(datetime).toISOString()

      const result = await createLiveEvent({
        title: title.trim(),
        event_when: whenIso,
        price_type: priceType,
        price: priceType === 'paid' ? parseFloat(price) : 0,
        duration_minutes: 60,
      })

      // Mirror to local state for instant UI feedback
      const localEvent = {
        id: result.event?.id || `local_${Date.now()}`,
        title: title.trim(),
        when: whenIso,
        priceType,
        price: priceType === 'paid' ? price : '0',
        createdAt: new Date().toISOString(),
        status: result.event?.status || (when === 'now' ? 'live' : 'scheduled'),
      }
      update({ liveEvents: [...(liveEvents || []), localEvent] })
      setTitle('')
      setPrice('99')
      setPriceType('free')
      onClose()
    } catch (err) {
      console.error('createLiveEvent error:', err)
      setError(err.message || 'Failed to create event. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-60 flex items-start justify-center p-6">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-70 w-full max-w-xl bg-white rounded-md shadow-lg overflow-hidden">
        <div className="bg-violet-600 text-white px-6 py-4">
          <h3 className="text-lg font-semibold">New Live Stream</h3>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-900 mb-1.5">Event Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Q&A with my fans"
              maxLength={200}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 outline-none focus:border-violet-500"
            />
          </div>

          <div className="flex gap-6 items-center">
            <label className="inline-flex items-center gap-2">
              <input type="radio" name="when" checked={when === 'now'} onChange={() => setWhen('now')} />
              <span className="ml-1">Now</span>
            </label>
            <label className="inline-flex items-center gap-2">
              <input type="radio" name="when" checked={when === 'later'} onChange={() => setWhen('later')} />
              <span className="ml-1">Later</span>
            </label>
          </div>

          {when === 'later' && (
            <div>
              <label className="block text-sm font-semibold text-slate-900 mb-1.5">When</label>
              <input
                type="datetime-local"
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50 text-sm"
                value={datetime}
                onChange={(e) => setDatetime(e.target.value)}
              />
            </div>
          )}

          <div>
            <div className="text-sm font-semibold mb-2">Entry Price</div>
            <div className="flex items-center gap-3">
              <select
                className="flex-1 border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50 text-sm"
                value={priceType}
                onChange={(e) => setPriceType(e.target.value)}
              >
                <option value="free">Free</option>
                <option value="paid">Paid</option>
              </select>
              {priceType === 'paid' && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-500">₹</span>
                  <input
                    type="number"
                    min="1"
                    max="100000"
                    className="w-32 border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50 text-sm"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                  />
                </div>
              )}
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 border border-red-200">{error}</p>
          )}
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t bg-slate-50">
          <button
            className="px-4 py-2 bg-slate-100 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-200 transition"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            className="px-4 py-2 bg-violet-600 text-white rounded-lg text-sm font-semibold hover:bg-violet-700 transition disabled:opacity-50"
            onClick={handleCreate}
            disabled={saving}
          >
            {saving ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}
