import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'

export default function Pagination({ total = 0, perPage = 5 }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const totalPages = Math.max(1, Math.ceil(total / perPage))
  const current = useMemo(() => {
    const p = parseInt(searchParams.get('page') || '1', 10)
    return Number.isNaN(p) || p < 1 ? 1 : Math.min(p, totalPages)
  }, [searchParams, totalPages])

  function setPage(n) {
    const next = new URLSearchParams(searchParams)
    if (n <= 1) next.delete('page')
    else next.set('page', String(n))
    setSearchParams(next, { replace: true })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  if (totalPages <= 1) return null

  const pages = []
  const start = Math.max(1, current - 2)
  const end = Math.min(totalPages, current + 2)
  for (let i = start; i <= end; i += 1) pages.push(i)

  return (
    <nav className="mt-4 flex items-center justify-center gap-2">
      <button
        onClick={() => setPage(current - 1)}
        disabled={current === 1}
        className="px-3 py-1 rounded-md bg-white/90 text-slate-700 disabled:opacity-40"
      >
        Prev
      </button>

      {start > 1 && (
        <button onClick={() => setPage(1)} className="px-3 py-1 rounded-md bg-white/90 text-slate-700">1</button>
      )}

      {start > 2 && <span className="px-2">…</span>}

      {pages.map((p) => (
        <button
          key={p}
          onClick={() => setPage(p)}
          className={`px-3 py-1 rounded-md ${p === current ? 'bg-violet-600 text-white' : 'bg-white/90 text-slate-700'}`}>
          {p}
        </button>
      ))}

      {end < totalPages - 1 && <span className="px-2">…</span>}

      {end < totalPages && (
        <button onClick={() => setPage(totalPages)} className="px-3 py-1 rounded-md bg-white/90 text-slate-700">{totalPages}</button>
      )}

      <button
        onClick={() => setPage(current + 1)}
        disabled={current === totalPages}
        className="px-3 py-1 rounded-md bg-white/90 text-slate-700 disabled:opacity-40"
      >
        Next
      </button>
    </nav>
  )
}
