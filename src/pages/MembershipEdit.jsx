import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useNavigate, useSearchParams } from 'react-router-dom'
import PageTransition from '../components/PageTransition.jsx'
import { useAuthFlow } from '../context/AuthFlowContext.jsx'
import Pagination from '../components/Pagination.jsx'

export default function MembershipEdit() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { memberships = [], update } = useAuthFlow()
  const [items, setItems] = useState(memberships)
  const [editing, setEditing] = useState(null)

  function openEditor(item) {
    setEditing({ ...(item || { title: '', description: '', price: '499/-' }) })
  }

  function closeEditor() {
    setEditing(null)
  }

  function saveEditor(e) {
    e.preventDefault()
    const next = editing.id ? items.map((it) => (it.id === editing.id ? editing : it)) : [{ ...editing, id: Date.now().toString() }, ...items]
    setItems(next)
    update({ memberships: next })
    closeEditor()
  }

  return (
    <PageTransition>
      <div className="min-h-screen bg-slate-100 text-slate-900 pb-28">
        <div className="max-w-md mx-auto px-4 py-4">
          <div className="mb-4 flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="inline-flex items-center rounded-2xl bg-violet-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-violet-700 transition"
            >
              <span className="mr-2">←</span>
              Back
            </button>
          </div>

          <section className="mb-4 rounded-[2rem] bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <div className="flex items-center justify-between">
              <h1 className="text-lg font-semibold text-slate-900">My Inner Circle</h1>
              <button
                type="button"
                onClick={() => openEditor(items[0])}
                className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm hover:bg-slate-200 transition"
              >
                Edit
              </button>
            </div>
            <div className="mt-4">
              <p className="text-sm text-slate-600">Subscribers List <span className="float-right text-sm text-slate-800">Posts: {0}</span></p>
              <p className="mt-4 text-violet-600 font-medium">Price: {items[0]?.price || '499/-'} INR per month</p>
            </div>
          </section>

          <section className="mb-4 rounded-[2rem] bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <h2 className="text-center text-lg font-semibold text-slate-900">Active Members</h2>
            <div className="mt-4 overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-600">
                    <th>Name</th>
                    <th>Expiring In</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td colSpan={2} className="text-center text-slate-500 py-6">No data available in table</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="mt-4">
              <Pagination total={(items[0]?.subscribers || []).length} perPage={5} />
            </div>
          </section>

          <section className="mb-4 rounded-[2rem] bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <h2 className="text-center text-lg font-semibold text-slate-900">Expired Members</h2>
            <div className="mt-4 overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-600">
                    <th>Name</th>
                    <th>Subscribed On</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td colSpan={2} className="text-center text-slate-500 py-6">No data available in table</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="mt-4">
              <Pagination total={0} perPage={5} />
            </div>
          </section>

          <div className="fixed bottom-6 right-6">
            <button
              onClick={() => openEditor(null)}
              className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-violet-600 text-white shadow-lg text-2xl"
            >
              +
            </button>
          </div>

          {editing && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 py-6">
              <div className="w-full max-w-lg rounded-[2rem] bg-white p-6 shadow-2xl ring-1 ring-slate-200">
                <div className="mb-6 flex items-center justify-between">
                  <h2 className="text-xl font-semibold text-slate-900">Update Subscription</h2>
                  <button onClick={closeEditor} className="text-slate-500">🗑️</button>
                </div>
                <form onSubmit={saveEditor} className="space-y-4">
                  <div>
                    <button type="button" className="rounded-md bg-violet-600 px-3 py-2 text-white">Change Cover</button>
                  </div>
                  <div>
                    <input
                      value={editing.title}
                      onChange={(e) => setEditing((s) => ({ ...s, title: e.target.value }))}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900"
                    />
                  </div>
                  <div>
                    <textarea
                      value={editing.description}
                      onChange={(e) => setEditing((s) => ({ ...s, description: e.target.value }))}
                      rows={4}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-700 mb-2">Price</label>
                    <select
                      value={editing.price}
                      onChange={(e) => setEditing((s) => ({ ...s, price: e.target.value }))}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900"
                    >
                      <option>499/-</option>
                      <option>199/-</option>
                      <option>999/-</option>
                      <option>1999/-</option>
                    </select>
                  </div>
                  <div className="flex items-center justify-between gap-3 mt-4">
                    <button type="submit" className="rounded-full bg-violet-600 px-6 py-3 text-sm font-semibold text-white">Update Now</button>
                    <button type="button" onClick={closeEditor} className="rounded-full bg-slate-100 px-6 py-3 text-sm font-semibold text-slate-900">Cancel</button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      </div>
    </PageTransition>
  )
}
