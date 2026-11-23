function PencilIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Shared Today / Week / Month / filter button row. */
export default function PeriodRangeNav({
  mode,
  presets,
  pickers,
  shiftRange,
  canGoForward,
  className = '',
}) {
  return (
    <div className={`pos-day-nav ${className}`.trim()}>
      <button
        type="button"
        className="pos-btn ghost"
        aria-label="Previous"
        onClick={() => shiftRange(-1)}
      >
        ←
      </button>
      <button
        type="button"
        className="pos-btn ghost"
        aria-label="Next"
        disabled={!canGoForward}
        onClick={() => shiftRange(1)}
      >
        →
      </button>
      {presets.map((p) => {
        const isCustom = p.id === 'custom';
        return (
          <button
            key={p.id}
            type="button"
            className={`pos-btn ${isCustom ? 'pos-day-nav-filter' : ''} ${mode === p.id ? 'primary' : 'ghost'}`.trim()}
            aria-label={isCustom ? 'Custom date range' : undefined}
            aria-pressed={mode === p.id}
            title={isCustom ? 'Custom date range' : undefined}
            onClick={pickers[p.id]}
          >
            {isCustom ? <PencilIcon /> : p.label}
          </button>
        );
      })}
    </div>
  );
}

/** From / To pickers shown when Custom is active. */
export function PeriodCustomRange({ from, to, today, setFromDate, setToDate }) {
  return (
    <div className="pos-range" style={{ marginBottom: '0.85rem' }}>
      <label className="pos-field">
        <span className="pos-cart-label">From</span>
        <input
          type="date"
          className="pos-input"
          value={from}
          max={to}
          onChange={(e) => e.target.value && setFromDate(e.target.value)}
        />
      </label>
      <label className="pos-field">
        <span className="pos-cart-label">To</span>
        <input
          type="date"
          className="pos-input"
          value={to}
          min={from}
          max={today}
          onChange={(e) => e.target.value && setToDate(e.target.value)}
        />
      </label>
    </div>
  );
}
