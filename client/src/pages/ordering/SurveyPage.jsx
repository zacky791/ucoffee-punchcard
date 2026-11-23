import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../api';
import PeriodRangeNav, { PeriodCustomRange } from '../../components/PeriodRangeNav';
import Toast from '../../components/Toast';
import { businessDateKey, businessDayRange } from '../../lib/performance';
import { usePeriodRange } from '../../lib/periodRange';
import { SURVEY_SOURCES, surveyErrorMessage, surveyLabel } from '../../lib/survey';

function fmtTime(iso) {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function SurveyPage() {
  const today = businessDateKey(new Date().toISOString());
  const period = usePeriodRange(today, { initialMode: 'week' });
  const {
    mode,
    from,
    to,
    label,
    canGoForward,
    showCustom,
    presets,
    pickers,
    shiftRange,
    setFromDate,
    setToDate,
  } = period;
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState(null);
  const clearToast = useCallback(() => setToast(null), []);

  const load = useCallback(async () => {
    try {
      setRows(
        (await api.posGetSurvey({
          from: businessDayRange(from).from,
          to: businessDayRange(to).to,
        })) || []
      );
      setError('');
    } catch (err) {
      setRows([]);
      setError(surveyErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const counts = useMemo(() => {
    const map = Object.fromEntries(SURVEY_SOURCES.map((s) => [s.value, 0]));
    for (const r of rows) map[r.source] = (map[r.source] || 0) + 1;
    return SURVEY_SOURCES.map((s) => ({ ...s, count: map[s.value] })).sort(
      (a, b) => b.count - a.count
    );
  }, [rows]);

  const total = rows.length;
  const top = total ? counts[0] : null;
  const otherAnswers = useMemo(() => {
    const map = new Map();
    for (const r of rows) {
      if (r.source !== 'other' || !r.other_text) continue;
      const key = r.other_text.trim().toLowerCase();
      const entry = map.get(key) || { text: r.other_text.trim(), count: 0 };
      entry.count += 1;
      map.set(key, entry);
    }
    return [...map.values()].sort((a, b) => b.count - a.count);
  }, [rows]);

  async function remove(r) {
    if (!window.confirm(`Delete this answer (${surveyLabel(r.source)})?`)) return;
    try {
      await api.posDeleteSurvey(r.id);
      setToast({ tone: 'ok', text: 'Answer deleted' });
      await load();
    } catch (err) {
      setToast({ tone: 'error', text: err.message });
    }
  }

  return (
    <div>
      <div className="pos-page-head">
        <div>
          <h1>Survey</h1>
        </div>
      </div>

      <div className="pos-report-bar">
        <p className="pos-meta">{label}</p>
        <PeriodRangeNav
          mode={mode}
          presets={presets}
          pickers={pickers}
          shiftRange={shiftRange}
          canGoForward={canGoForward}
        />
      </div>

      {showCustom && (
        <PeriodCustomRange
          from={from}
          to={to}
          today={today}
          setFromDate={setFromDate}
          setToDate={setToDate}
        />
      )}

      {error && <div className="pos-alert error">{error}</div>}

      <div className="pos-grid-stats">
        <div className="pos-card pos-stat">
          <span>Answers</span>
          <strong>{total}</strong>
        </div>
        <div className="pos-card pos-stat">
          <span>Top source</span>
          <strong>{top?.count ? top.label : '—'}</strong>
        </div>
        <div className="pos-card pos-stat">
          <span>Top source share</span>
          <strong>{top?.count ? `${Math.round((top.count / total) * 100)}%` : '—'}</strong>
        </div>
      </div>

      <div className="pos-card">
        <h2 className="pos-card-title">Where customers heard about us</h2>
        {loading ? (
          <p className="pos-meta">Loading…</p>
        ) : !total ? (
          <p className="pos-meta">No answers for this period yet.</p>
        ) : (
          <ul className="pos-barlist pos-survey-bars">
            {counts.map((s) => {
              const pct = Math.round((s.count / total) * 100);
              return (
                <li key={s.value}>
                  <span className="pos-barlist-label">{s.label}</span>
                  <span className="pos-barlist-track">
                    <span className="pos-barlist-fill" style={{ width: `${pct}%` }} />
                  </span>
                  <span className="pos-barlist-value">
                    {s.count} · {pct}%
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {otherAnswers.length > 0 && (
        <div className="pos-card">
          <h2 className="pos-card-title">"Other" answers</h2>
          <div className="pos-expense-chips">
            {otherAnswers.map((o) => (
              <span key={o.text} className="pos-chip">
                {o.text}
                {o.count > 1 ? ` ×${o.count}` : ''}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="pos-card" style={{ overflowX: 'auto' }}>
        <h2 className="pos-card-title">
          Recent answers
          {total > 0 && <small> · {total}</small>}
        </h2>
        <table className="pos-table stack">
          <thead>
            <tr>
              <th>When</th>
              <th>Order</th>
              <th>Answer</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 200).map((r) => (
              <tr key={r.id}>
                <td className="pos-cell-title">{fmtTime(r.created_at)}</td>
                <td data-label="Order">{r.order?.order_number || '—'}</td>
                <td data-label="Answer">
                  <strong>{surveyLabel(r.source)}</strong>
                  {r.other_text ? ` · ${r.other_text}` : ''}
                </td>
                <td className="pos-cell-action">
                  <button type="button" className="pos-btn ghost" onClick={() => remove(r)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {!loading && !total && (
              <tr>
                <td colSpan={4}>No answers yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Toast toast={toast} onDone={clearToast} />
    </div>
  );
}
