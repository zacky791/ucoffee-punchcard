/** Shared Today / Week / Month / Custom button row. */
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
      {presets.map((p) => (
        <button
          key={p.id}
          type="button"
          className={`pos-btn ${mode === p.id ? 'primary' : 'ghost'}`}
          aria-pressed={mode === p.id}
          onClick={pickers[p.id]}
        >
          {p.label}
        </button>
      ))}
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
