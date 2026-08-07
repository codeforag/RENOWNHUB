import { useState } from 'react'
import { useAuthFlow } from '../context/AuthFlowContext.jsx'

export default function LiveModal({ open, onClose }) {
  const { liveEvents = [], update } = useAuthFlow()
  const [when, setWhen] = useState('now') // 'now' | 'later'
  const [datetime, setDatetime] = useState(() => {
    const d = new Date()
    // default to local datetime-local value
    const iso = d.toISOString().slice(0, 16)
    return iso
  })
  const [priceType, setPriceType] = useState('free') // 'free' | 'paid'
  const [price, setPrice] = useState('0')

  if (!open) return null

  function handleCreate() {
    const event = {
      id: `live_${Date.now()}`,
      when: when === 'now' ? new Date().toISOString() : new Date(datetime).toISOString(),
      priceType,
      price: priceType === 'paid' ? price : '0',
      createdAt: new Date().toISOString(),
      status: when === 'now' ? 'live' : 'scheduled',
    }
    try {
      update({ liveEvents: [...(liveEvents || []), event] })
    } catch (e) {
      // fallback: no-op
    }
    onClose()
  }

  return (
    <div className="fixed inset-0 z-60 flex items-start justify-center p-6">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-70 w-full max-w-xl bg-white rounded-md shadow-lg overflow-hidden">
        <div className="bg-violet-600 text-white px-6 py-4">
          <h3 className="text-lg font-semibold">New Live Stream</h3>
        </div>
        <div className="p-6">
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
            <div className="mt-4">
              <input
                type="datetime-local"
                className="w-full border rounded px-3 py-2"
                value={datetime}
                onChange={(e) => setDatetime(e.target.value)}
              />
            </div>
          )}

          <div className="mt-6">
            <div className="text-sm font-semibold mb-2">Select Entry Price</div>
            <select
              className="w-full border rounded px-3 py-2"
              value={priceType}
              onChange={(e) => setPriceType(e.target.value)}
            >
              <option value="free">Free</option>
              <option value="paid">Paid</option>
            </select>
            {priceType === 'paid' && (
              <div className="mt-3">
                <input
                  type="number"
                  min="0"
                  className="w-full border rounded px-3 py-2"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                />
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t">
          <button className="px-4 py-2 bg-slate-100 rounded" onClick={onClose}>
            Cancel
          </button>
          <button className="px-4 py-2 bg-violet-600 text-white rounded" onClick={handleCreate}>
            Create
          </button>
        </div>
      </div>
    </div>
  )
}
