export default function TextField({
  label,
  error,
  hint,
  trailing,
  className = '',
  ...inputProps
}) {
  return (
    <label className="block">
      {label && (
        <span className="block text-xs font-medium text-muted mb-2">{label}</span>
      )}
      <div className="relative">
        <input
          {...inputProps}
          className={`auth-input w-full rounded-xl bg-bg border px-4 py-3 text-sm text-cream placeholder:text-muted/60 focus:outline-none transition-colors ${
            error
              ? 'border-coral focus:border-coral'
              : 'border-white/15 focus:border-gold/60'
          } ${trailing ? 'pr-16' : ''} ${className}`}
        />
        {trailing && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2">{trailing}</span>
        )}
        {error && !trailing && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-coral">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.2" />
              <path d="M8 4.5v3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              <circle cx="8" cy="10.5" r="0.75" fill="currentColor" />
            </svg>
          </span>
        )}
      </div>
      {error ? (
        <span className="block text-xs text-coral mt-1.5">{error}</span>
      ) : hint ? (
        <span className="block text-xs text-muted/70 mt-1.5">{hint}</span>
      ) : null}
    </label>
  )
}
