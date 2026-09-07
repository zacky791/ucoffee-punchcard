import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { buildPerformance, formatHours } from '../lib/performance';
import { roleLabel } from '../lib/time';

export default function Performance() {
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [payload, setPayload] = useState({ punches: [], staff: [] });

  async function load(selectedDays = days) {
    setLoading(true);
    setError('');
    try {
      const data = await api.getPerformance({ days: String(selectedDays) });
      setPayload(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(days);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  const rows = useMemo(
    () => buildPerformance(payload.punches || [], payload.staff || []),
    [payload]
  );

  const totals = useMemo(() => {
    const hours = rows.reduce((sum, row) => sum + row.total_hours, 0);
    const punches = rows.reduce((sum, row) => sum + row.punch_count, 0);
    const onFloor = rows.filter((row) => row.open_now).length;
    return {
      hours: Math.round(hours * 10) / 10,
      punches,
      onFloor,
      people: rows.length,
    };
  }, [rows]);

  return (
    <section className="page">
      <header className="page-header">
        <p className="eyebrow">Overview</p>
        <h1>Performance</h1>
        <p className="lede">
          Hours and attendance across the team for the selected period.
        </p>
      </header>

      <div className="history-toolbar">
        <label>
          Period
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          >
            <option value={7}>Last 7 days</option>
            <option value={14}>Last 14 days</option>
            <option value={30}>Last 30 days</option>
            <option value={60}>Last 60 days</option>
          </select>
        </label>
        <button type="button" className="btn ghost" onClick={() => load(days)}>
          Refresh
        </button>
      </div>

      {error && <p className="banner error">{error}</p>}

      <div className="perf-stats">
        <div className="perf-stat">
          <span>Total hours</span>
          <strong>{formatHours(totals.hours)}</strong>
        </div>
        <div className="perf-stat">
          <span>Punches</span>
          <strong>{totals.punches}</strong>
        </div>
        <div className="perf-stat">
          <span>Active people</span>
          <strong>{totals.people}</strong>
        </div>
        <div className="perf-stat">
          <span>On floor now</span>
          <strong>{totals.onFloor}</strong>
        </div>
      </div>

      {loading ? (
        <p className="state-msg">Loading performance…</p>
      ) : rows.length === 0 ? (
        <p className="state-msg">No punch data in this period.</p>
      ) : (
        <ul className="perf-list">
          {rows.map((row) => (
            <li key={row.staff_id}>
              <div className="perf-who">
                <strong>{row.name}</strong>
                <span>
                  {roleLabel(row.role)}
                  {row.open_now ? ' · on floor' : ''}
                </span>
              </div>
              <div className="perf-metrics">
                <span className="tag in">{formatHours(row.total_hours)}</span>
                <span className="perf-meta">
                  {row.days_worked} days · {row.sessions} shifts · {row.punch_count}{' '}
                  punches
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
