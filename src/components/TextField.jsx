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
          className={`w-full rounded-xl bg-bg border px-4 py-3 text-sm text-cream placeholder:text-muted/60 focus:outline-none transition-colors ${
            error
              ? 'border-coral/70 focus:border-coral'
              : 'border-white/15 focus:border-gold/60'
          } ${trailing ? 'pr-10' : ''} ${className}`}
        />
        {trailing && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2">{trailing}</span>
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
