import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import {
  addDays,
  buildPerformance,
  formatHours,
  formatWeekRange,
  startOfWeek,
} from '../lib/performance';
import {
  calcPayRm,
  formatRm,
  hourlyRateRm,
  isKitchenRole,
} from '../lib/salary';
import { roleLabel } from '../lib/time';

function withPay(rows) {
  return rows.map((row) => {
    const rate = hourlyRateRm(row.name);
    const pay = calcPayRm(row.total_hours, rate);
    return { ...row, rate, pay };
  });
}

function sectionTotal(rows) {
  return rows.reduce((sum, row) => sum + (row.pay || 0), 0);
}

function SalaryCard({ row }) {
  return (
    <article className="perf-card salary-card">
      <strong>{row.name}</strong>
      <span className="perf-card-role">{roleLabel(row.role)}</span>
      <p className="perf-card-hours">{formatHours(row.total_hours)}</p>
      <span className="perf-card-meta">
        {row.rate != null ? `${formatRm(row.rate)}/hr` : 'Rate not set'}
        {' · '}
        {row.days_worked} day{row.days_worked === 1 ? '' : 's'}
      </span>
      <p className="salary-pay">{formatRm(row.pay)}</p>
    </article>
  );
}

function SalarySection({ title, rows }) {
  const total = sectionTotal(rows);
  return (
    <section className="salary-section">
      <header className="salary-section-head">
        <h2>{title}</h2>
        <strong>{formatRm(total)}</strong>
      </header>
      {rows.length === 0 ? (
        <p className="state-msg">No staff in this group.</p>
      ) : (
        <div className="perf-card-grid">
          {rows.map((row) => (
            <SalaryCard key={row.staff_id} row={row} />
          ))}
        </div>
      )}
    </section>
  );
}

export default function Performance() {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [payload, setPayload] = useState({ punches: [], staff: [] });

  const thisWeek = startOfWeek(new Date());
  const isThisWeek = weekStart === thisWeek;

  async function load(selectedWeek = weekStart) {
    setLoading(true);
    setError('');
    try {
      const data = await api.getPerformance({ week_start: selectedWeek });
      setPayload({
        punches: Array.isArray(data?.punches) ? data.punches : [],
        staff: Array.isArray(data?.staff) ? data.staff : [],
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(weekStart);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart]);

  const rows = useMemo(() => {
    const list = buildPerformance(payload.punches || [], payload.staff || []);
    return withPay([...list].sort((a, b) => a.name.localeCompare(b.name)));
  }, [payload]);

  const kitchen = useMemo(
    () => rows.filter((row) => isKitchenRole(row.role)),
    [rows]
  );
  const barista = useMemo(
    () => rows.filter((row) => !isKitchenRole(row.role)),
    [rows]
  );

  const grandTotal = sectionTotal(kitchen) + sectionTotal(barista);

  function jumpToDate(value) {
    if (!value) return;
    setWeekStart(startOfWeek(new Date(`${value}T12:00:00`)));
  }

  return (
    <section className="page">
      <header className="page-header">
        <h1>Salary table</h1>
      </header>

      <div className="week-nav">
        <div className="week-nav-block">
          <span className="week-nav-title">Week</span>
          <div className="week-nav-row">
            <button
              type="button"
              className="btn ghost compact"
              onClick={() => setWeekStart(addDays(weekStart, -7))}
              aria-label="Previous week"
            >
              ←
            </button>
            <div className="week-nav-label">
              <strong>{formatWeekRange(weekStart)}</strong>
            </div>
            <button
              type="button"
              className="btn ghost compact"
              onClick={() => setWeekStart(addDays(weekStart, 7))}
              aria-label="Next week"
            >
              →
            </button>
            {!isThisWeek && (
              <button
                type="button"
                className="btn ghost compact"
                onClick={() => setWeekStart(thisWeek)}
              >
                Today
              </button>
            )}
          </div>
        </div>
        <div className="week-nav-block">
          <span className="week-nav-title">Calendar</span>
          <input
            type="date"
            className="week-jump-input"
            value={weekStart}
            onChange={(e) => jumpToDate(e.target.value)}
            aria-label="Jump to calendar date"
          />
        </div>
      </div>

      {error && <p className="banner error">{error}</p>}

      {loading ? (
        <p className="state-msg">Loading salary…</p>
      ) : rows.length === 0 ? (
        <p className="state-msg">No staff found.</p>
      ) : (
        <div className="salary-board">
          <div className="salary-grand">
            <span>Week total</span>
            <strong>{formatRm(grandTotal)}</strong>
          </div>
          <SalarySection title="Kitchen" rows={kitchen} />
          <SalarySection title="Barista" rows={barista} />
        </div>
      )}
    </section>
  );
}
