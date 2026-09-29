import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api';
import { formatMoney } from '../../context/CartContext';
import {
  addDays,
  buildPerformance,
  businessDateKey,
  businessDayRange,
  formatHours,
  pairShifts,
  parseDateKey,
} from '../../lib/performance';
import { calcPayRm, hourlyRateRm } from '../../lib/salary';
import PeriodReport from './PeriodReport';

function pct(value) {
  return value == null ? '—' : `${value.toFixed(1)}%`;
}

function marginPct(amount, sales) {
  return sales > 0 ? Math.round((amount / sales) * 1000) / 10 : null;
}

const TABS = [
  ['daily', 'Daily'],
  ['weekly', 'Weekly'],
  ['monthly', 'Monthly'],
  ['yearly', 'Yearly'],
];

export default function ReportsPage() {
  const [tab, setTab] = useState('daily');
  return (
    <div>
      <div className="pos-page-head">
        <div>
          <h1>Reports</h1>
          <p>Profit, margin and where to improve</p>
        </div>
      </div>
      <div className="pos-segment pos-report-tabs" role="tablist" aria-label="Report period">
        {TABS.map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            className={tab === value ? 'active' : ''}
            onClick={() => setTab(value)}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'daily' ? <DailyReport /> : <PeriodReport key={tab} period={tab} />}
    </div>
  );
}

function DailyReport() {
  const today = businessDateKey(new Date().toISOString());
  const [date, setDate] = useState(today);
  const [report, setReport] = useState(null);
  const [people, setPeople] = useState({ punches: [], staff: [] });
  const [currency, setCurrency] = useState('MYR');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    const range = businessDayRange(date);
    setLoading(true);
    setError('');
    Promise.all([
      api.posProfitReport({ from: range.from, to: range.to }),
      api.getPerformance({ from: range.from, to: range.punchTo }),
      api.posGetSettings(),
    ])
      .then(([r, perf, settings]) => {
        if (!alive) return;
        setReport(r);
        setPeople({ punches: perf.punches || [], staff: perf.staff || [] });
        setCurrency(settings?.currency || 'MYR');
      })
      .catch((err) => alive && setError(err.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [date]);

  const salary = useMemo(() => {
    const now = Date.now();
    const openMs = {};
    for (const shift of pairShifts(people.punches)) {
      if (shift.status !== 'open' || shift.business_date !== date) continue;
      openMs[shift.staff_id] = (openMs[shift.staff_id] || 0) + (now - new Date(shift.in.punched_at));
    }
    const rows = buildPerformance(people.punches, people.staff, { fromDate: date, toDate: date })
      .filter((r) => r.shift_count > 0)
      .map((r) => {
        const rate = hourlyRateRm(r.name);
        const hours = Math.round(((r.total_ms + (openMs[r.staff_id] || 0)) / 3600000) * 10) / 10;
        return { ...r, total_hours: hours, rate, pay: calcPayRm(hours, rate) };
      });
    return {
      rows,
      total: Math.round(rows.reduce((s, r) => s + (r.pay || 0), 0) * 100) / 100,
      noRate: rows.filter((r) => r.rate == null && r.total_hours > 0).map((r) => r.name),
      stillIn: rows.filter((r) => r.open_now).map((r) => r.name),
      missed: rows.filter((r) => r.missed_clock_outs > 0).map((r) => r.name),
    };
  }, [people, date]);

  const sales = Number(report?.sales || 0);
  const cost = Number(report?.cost || 0);
  const gross = Number(report?.profit || 0);
  const net = Math.round((gross - salary.total) * 100) / 100;
  const grossMargin = marginPct(gross, sales);
  const netMargin = marginPct(net, sales);
  const isToday = date === today;
  const dayLabel = parseDateKey(date).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  return (
    <div>
      <div className="pos-report-bar">
        <p className="pos-meta">Profit of the day · {dayLabel}</p>
        <div className="pos-day-nav">
          <button
            type="button"
            className="pos-btn ghost"
            aria-label="Previous day"
            onClick={() => setDate(addDays(date, -1))}
          >
            ←
          </button>
          <input
            type="date"
            className="pos-input"
            value={date}
            max={today}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            aria-label="Report date"
          />
          <button
            type="button"
            className="pos-btn ghost"
            aria-label="Next day"
            disabled={isToday}
            onClick={() => setDate(addDays(date, 1))}
          >
            →
          </button>
          {!isToday && (
            <button type="button" className="pos-btn ghost" onClick={() => setDate(today)}>
              Today
            </button>
          )}
        </div>
      </div>

      {error && <div className="pos-alert error">{error}</div>}
      {loading && !report && <div className="pos-card">Loading…</div>}

      {report && (
        <>
          <div className="pos-grid-stats four">
            <div className="pos-card pos-stat">
              <span>Sales</span>
              <strong>{formatMoney(sales, currency)}</strong>
            </div>
            <div className="pos-card pos-stat">
              <span>Gross profit</span>
              <strong className={gross < 0 ? 'pos-neg' : ''}>{formatMoney(gross, currency)}</strong>
            </div>
            <div className="pos-card pos-stat">
              <span>Profit margin</span>
              <strong>{pct(grossMargin)}</strong>
            </div>
            <div className="pos-card pos-stat">
              <span>Net profit (after salary)</span>
              <strong className={net < 0 ? 'pos-neg' : 'pos-pos'}>{formatMoney(net, currency)}</strong>
            </div>
          </div>

          <div className="pos-split">
            <div className="pos-card">
              <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>Profit of the day</h2>
              <div className="pos-pnl">
                <div>
                  <span>Sales ({report.order_count} orders)</span>
                  <span>{formatMoney(sales, currency)}</span>
                </div>
                <div className="minus">
                  <span>Cost of goods (ingredients, cups…)</span>
                  <span>− {formatMoney(cost, currency)}</span>
                </div>
                <div className="subtotal">
                  <span>
                    Gross profit <small>{pct(grossMargin)} margin</small>
                  </span>
                  <span className={gross < 0 ? 'pos-neg' : ''}>{formatMoney(gross, currency)}</span>
                </div>
                <div className="minus">
                  <span>Staff salary</span>
                  <span>− {formatMoney(salary.total, currency)}</span>
                </div>
                <div className="total">
                  <span>
                    Net profit <small>{pct(netMargin)} margin</small>
                  </span>
                  <span className={net < 0 ? 'pos-neg' : 'pos-pos'}>{formatMoney(net, currency)}</span>
                </div>
              </div>
              {report.estimated_items > 0 && (
                <p className="pos-meta" style={{ marginTop: '0.75rem' }}>
                  {report.estimated_items} item(s) were sold before their cost was recorded, so
                  today&apos;s cost is used.
                </p>
              )}
              {cost === 0 && sales > 0 && (
                <div className="pos-alert warn" style={{ marginTop: '0.75rem', marginBottom: 0 }}>
                  No item costs set yet, so gross profit equals sales. Set costs in the Profit tab.
                </div>
              )}
            </div>

            <div className="pos-card">
              <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>Staff salary</h2>
              {salary.rows.length ? (
                <ul className="pos-list">
                  {salary.rows.map((r) => (
                    <li key={r.staff_id}>
                      <span>
                        <strong>{r.name}</strong>
                        <span className="pos-product-meta" style={{ display: 'block' }}>
                          {formatHours(r.total_hours)}
                          {r.open_now ? ' so far' : ''}
                          {r.rate != null ? ` × ${formatMoney(r.rate, currency)}/hr` : ' · rate not set'}
                          {r.open_now ? ' · still clocked in' : ''}
                          {r.missed_clock_outs ? ' · missed clock-out' : ''}
                        </span>
                      </span>
                      <strong>{r.pay != null ? formatMoney(r.pay, currency) : '—'}</strong>
                    </li>
                  ))}
                  <li>
                    <strong>Total</strong>
                    <strong>{formatMoney(salary.total, currency)}</strong>
                  </li>
                </ul>
              ) : (
                <p className="pos-meta">Nobody clocked in on this day.</p>
              )}
              {salary.stillIn.length > 0 && (
                <p className="pos-meta" style={{ marginTop: '0.6rem' }}>
                  Still working: {salary.stillIn.join(', ')}. Salary counts hours so far and
                  grows until they clock out.
                </p>
              )}
              {salary.missed.length > 0 && (
                <p className="pos-meta" style={{ marginTop: '0.6rem' }}>
                  Missed clock-out (not paid until fixed in Working schedule):{' '}
                  {salary.missed.join(', ')}.
                </p>
              )}
              {salary.noRate.length > 0 && (
                <p className="pos-meta" style={{ marginTop: '0.6rem' }}>
                  No hourly rate set for {salary.noRate.join(', ')}, so they count as RM 0.
                </p>
              )}
            </div>
          </div>

          <div className="pos-split" style={{ marginTop: '0.85rem' }}>
            <div className="pos-card">
              <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>Product sales</h2>
              {report.products.length ? (
                <ul className="pos-list">
                  {report.products.map((p) => (
                    <li key={p.product_name}>
                      <span>
                        {p.product_name} · {p.quantity}
                        <span className="pos-product-meta" style={{ display: 'block' }}>
                          Profit {formatMoney(p.profit, currency)} · {pct(p.margin)}
                        </span>
                      </span>
                      <strong>{formatMoney(p.sales, currency)}</strong>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="pos-meta">No sales on this day.</p>
              )}
            </div>
            <div className="pos-card">
              <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>Payment totals</h2>
              {Object.keys(report.payment_methods || {}).length ? (
                <ul className="pos-list">
                  {Object.entries(report.payment_methods).map(([m, total]) => (
                    <li key={m}>
                      <span style={{ textTransform: 'capitalize' }}>{m}</span>
                      <strong>{formatMoney(total, currency)}</strong>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="pos-meta">No payments on this day.</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
