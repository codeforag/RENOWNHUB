import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import PageTransition from '../components/PageTransition.jsx'
import { useAuthFlow } from '../context/AuthFlowContext.jsx'
import Pagination from '../components/Pagination.jsx'

const SERVICE_OPTIONS = [
  'I will Record a Personalised Video Message for you',
  'I will Make a Personalised Dance Video for you',
  'I will Make a Birthday Wish/Anniversary Wish Video',
  '5 mins DM on Instagram',
  '10 mins DM on Instagram',
  '5 mins Video Call on Instagram',
  '10 mins Video Call on Instagram',
  'Create your own service',
]

export default function ConnectWithMeEdit() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { services = [], update } = useAuthFlow()
  const [items, setItems] = useState(services)
  const [isOpen, setIsOpen] = useState(false)
  const [selectedService, setSelectedService] = useState(SERVICE_OPTIONS[0])
  const [price, setPrice] = useState('Free')

  useEffect(() => {
    setItems(services)
  }, [services])

  const serviceText = useMemo(
    () => selectedService,
    [selectedService],
  )

  const page = parseInt(searchParams.get('page') || '1', 10) || 1
  const perPage = 4
  const startIdx = (page - 1) * perPage
  const paged = items.slice(startIdx, startIdx + perPage)

  function handleSubmit(e) {
    e.preventDefault()
    const newService = {
      id: crypto.randomUUID?.() || Date.now().toString(),
      title: selectedService,
      description: selectedService,
      price,
    }
    const nextItems = [...items, newService]
    setItems(nextItems)
    update({ services: nextItems })
    setIsOpen(false)
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

          <div className="mb-4 rounded-[2rem] bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-semibold text-slate-900">Connect with me</h1>
                <p className="mt-2 text-sm text-slate-600">Edit the services you provide to your fans.</p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(true)}
                className="inline-flex items-center gap-2 rounded-full bg-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-violet-700 transition"
              >
                +
              </button>
            </div>
          </div>

          <div className="space-y-4">
            {paged.map((service) => (
              <div key={service.id} className="rounded-[1.75rem] bg-white p-5 shadow-sm ring-1 ring-slate-200">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">{service.title}</p>
                    <p className="mt-3 text-sm leading-6 text-slate-600">{service.description}</p>
                    <p className="mt-4 text-sm font-semibold text-violet-600">Price: {service.price}</p>
                  </div>
                  <Link
                    to="#"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-900 shadow-sm hover:bg-slate-200 transition"
                  >
                    ✎
                  </Link>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6">
            <Pagination total={items.length} perPage={perPage} />
          </div>

          {isOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 py-6">
              <div className="w-full max-w-lg rounded-[2rem] bg-white p-6 shadow-2xl ring-1 ring-slate-200">
                <div className="mb-6 flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-semibold text-slate-900">New Service</h2>
                    <p className="mt-1 text-sm text-slate-500">Choose service or create your own</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="rounded-full bg-slate-100 px-3 py-2 text-slate-700 hover:bg-slate-200 transition"
                  >
                    ×
                  </button>
                </div>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-900">Choose Service or Create your Own</label>
                    <select
                      value={selectedService}
                      onChange={(e) => setSelectedService(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
                    >
                      {SERVICE_OPTIONS.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-900">Price</label>
                    <select
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
                    >
                      <option>Free</option>
                      <option>₹ 199/-</option>
                      <option>₹ 999/-</option>
                      <option>₹ 1999/-</option>
                      <option>₹ 4999/-</option>
                    </select>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <button
                      type="submit"
                      className="rounded-full bg-violet-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-violet-700 transition"
                    >
                      Add
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsOpen(false)}
                      className="rounded-full bg-slate-100 px-6 py-3 text-sm font-semibold text-slate-900 shadow-sm hover:bg-slate-200 transition"
                    >
                      Close
                    </button>
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
