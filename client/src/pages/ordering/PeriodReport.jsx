import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api';
import { formatMoney } from '../../context/CartContext';
import {
  addDays,
  businessDateKey,
  businessDayRange,
  formatWeekRange,
  parseDateKey,
  startOfWeek,
} from '../../lib/performance';
import { loadPunches, salaryByDate } from '../../lib/payroll';
import { buildInsights } from '../../lib/reportInsights';
import { categoryLabel, loadExpenses, overheadByDate } from '../../lib/overhead';
import { BarList, ProfitChart } from '../../components/ReportCharts';

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const NAME = { weekly: 'week', monthly: 'month', yearly: 'year' };

const round2 = (n) => Math.round(n * 100) / 100;
const share = (part, whole) => (whole > 0 ? (part / whole) * 100 : null);
const pct = (v) => (v == null ? '—' : `${v.toFixed(1)}%`);

function lastDayOfMonth(ym) {
  const [y, m] = ym.split('-').map(Number);
  return `${ym}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
}

function shiftMonth(ym, delta) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** anchor: week → Monday key, month → "YYYY-MM", year → "YYYY" */
function rangeFor(period, anchor) {
  if (period === 'weekly') return { fromKey: anchor, toKey: addDays(anchor, 6) };
  if (period === 'monthly') return { fromKey: `${anchor}-01`, toKey: lastDayOfMonth(anchor) };
  return { fromKey: `${anchor}-01-01`, toKey: `${anchor}-12-31` };
}

function shiftAnchor(period, anchor, delta) {
  if (period === 'weekly') return addDays(anchor, 7 * delta);
  if (period === 'monthly') return shiftMonth(anchor, delta);
  return String(Number(anchor) + delta);
}

function currentAnchor(period, todayKey) {
  if (period === 'weekly') return startOfWeek(parseDateKey(todayKey));
  if (period === 'monthly') return todayKey.slice(0, 7);
  return todayKey.slice(0, 4);
}

function anchorLabel(period, anchor) {
  if (period === 'weekly') return formatWeekRange(anchor);
  if (period === 'monthly') {
    return parseDateKey(`${anchor}-01`).toLocaleDateString('en-GB', {
      month: 'long',
      year: 'numeric',
    });
  }
  return anchor;
}

async function loadPeriod(period, anchor) {
  const { fromKey, toKey } = rangeFor(period, anchor);
  const prev = rangeFor(period, shiftAnchor(period, anchor, -1));
  const bucket = period === 'yearly' ? 'month' : 'day';
  const todayKey = businessDateKey(new Date().toISOString());
  const capped = (key) => (key < todayKey ? key : todayKey);
  const [summary, prevSummary, people, menu, settings, ex] = await Promise.all([
    api.posSummaryReport({
      from: businessDayRange(fromKey).from,
      to: businessDayRange(toKey).to,
      bucket,
    }),
    api.posSummaryReport({
      from: businessDayRange(prev.fromKey).from,
      to: businessDayRange(prev.toKey).to,
      bucket,
    }),
    loadPunches(period === 'yearly' ? fromKey : prev.fromKey, toKey),
    api.posGetCosting().catch(() => []),
    api.posGetSettings(),
    loadExpenses(),
  ]);
  return {
    fromKey,
    toKey,
    summary,
    prevSummary,
    overhead: overheadByDate(ex.expenses, fromKey, capped(toKey)),
    prevOverhead: overheadByDate(ex.expenses, prev.fromKey, capped(prev.toKey)),
    expensesError: ex.error,
    salary: salaryByDate(people, fromKey, toKey),
    prevSalary: period === 'yearly' ? null : salaryByDate(people, prev.fromKey, prev.toKey),
    menu: menu || [],
    currency: settings?.currency || 'MYR',
  };
}

function Change({ now, before, invert = false }) {
  if (!before) return null;
  const change = ((now - before) / Math.abs(before)) * 100;
  if (!Number.isFinite(change)) return null;
  const good = invert ? change <= 0 : change >= 0;
  return (
    <small className={`pos-change ${good ? 'up' : 'down'}`}>
      {change >= 0 ? '▲' : '▼'} {Math.abs(change).toFixed(1)}%
    </small>
  );
}

export default function PeriodReport({ period }) {
  const todayKey = businessDateKey(new Date().toISOString());
  const [anchor, setAnchor] = useState(() => currentAnchor(period, todayKey));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const isCurrent = anchor === currentAnchor(period, todayKey);
  const name = NAME[period];
  const detailed = period !== 'weekly';

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    loadPeriod(period, anchor)
      .then((d) => alive && setData(d))
      .catch((err) => alive && setError(err.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [period, anchor]);

  const view = useMemo(() => {
    if (!data) return null;
    const { summary, prevSummary, salary, prevSalary, overhead, prevOverhead, fromKey, toKey } = data;
    const t = summary.totals;
    const net = round2(t.gross - salary.total - overhead.total);
    const prevNet = prevSalary
      ? round2(prevSummary.totals.gross - prevSalary.total - prevOverhead.total)
      : null;

    const byKey = Object.fromEntries(summary.buckets.map((b) => [b.key, b]));
    const chart = [];
    if (period === 'yearly') {
      for (let m = 1; m <= 12; m += 1) {
        const key = `${anchor}-${String(m).padStart(2, '0')}`;
        const b = byKey[key] || { sales: 0, gross: 0, orders: 0 };
        const sumMonth = (byDate) =>
          Object.entries(byDate)
            .filter(([d]) => d.startsWith(key))
            .reduce((s, [, v]) => s + v, 0);
        const pay = sumMonth(salary.byDate);
        const oh = sumMonth(overhead.byDate);
        chart.push({
          key,
          short: MONTH_SHORT[m - 1],
          label: parseDateKey(`${key}-01`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }),
          sales: b.sales,
          gross: b.gross,
          salary: round2(pay),
          overhead: round2(oh),
          net: round2(b.gross - pay - oh),
          orders: b.orders,
        });
      }
    } else {
      for (let key = fromKey; key <= toKey; key = addDays(key, 1)) {
        const b = byKey[key] || { sales: 0, gross: 0, orders: 0 };
        const pay = salary.byDate[key] || 0;
        const oh = overhead.byDate[key] || 0;
        const d = parseDateKey(key);
        chart.push({
          key,
          short: period === 'weekly' ? DAY_SHORT[d.getDay()] : String(d.getDate()),
          label: d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' }),
          sales: b.sales,
          gross: b.gross,
          salary: pay,
          overhead: oh,
          net: round2(b.gross - pay - oh),
          orders: b.orders,
        });
      }
    }

    const active = chart.filter((c) => c.sales > 0 || c.salary > 0 || c.overhead > 0);
    const best = [...active].sort((a, b) => b.net - a.net)[0];
    const worst = [...active].sort((a, b) => a.net - b.net)[0];

    const insights = buildInsights({
      totals: t,
      salary: salary.total,
      overhead: overhead.total,
      overheadByCategory: overhead.byCategory,
      hasExpenses: !data.expensesError,
      previous: { sales: prevSummary.totals.sales, net: prevNet },
      products: summary.products,
      menu: data.menu,
      days: period === 'yearly' ? [] : chart,
      hours: summary.hours,
      weekdays: summary.weekdays,
      periodName: name,
    });

    return { t, net, prevNet, chart, best, worst, insights };
  }, [data, period, anchor, name]);

  const currency = data?.currency || 'MYR';

  return (
    <div>
      <div className="pos-report-bar">
        <p className="pos-meta">
          {period === 'yearly' ? 'Year' : period === 'monthly' ? 'Month' : 'Week'} ·{' '}
          {anchorLabel(period, anchor)}
        </p>
        <div className="pos-day-nav">
          <button
            type="button"
            className="pos-btn ghost"
            aria-label={`Previous ${name}`}
            onClick={() => setAnchor(shiftAnchor(period, anchor, -1))}
          >
            ←
          </button>
          <strong className="pos-period-label">{anchorLabel(period, anchor)}</strong>
          <button
            type="button"
            className="pos-btn ghost"
            aria-label={`Next ${name}`}
            disabled={isCurrent}
            onClick={() => setAnchor(shiftAnchor(period, anchor, 1))}
          >
            →
          </button>
          {!isCurrent && (
            <button
              type="button"
              className="pos-btn ghost"
              onClick={() => setAnchor(currentAnchor(period, todayKey))}
            >
              This {name}
            </button>
          )}
        </div>
      </div>

      {error && <div className="pos-alert error">{error}</div>}
      {loading && !view && <div className="pos-card">Loading {name} report…</div>}

      {view && (
        <div style={{ opacity: loading ? 0.55 : 1, transition: 'opacity 0.2s' }}>
          <div className={`pos-verdict ${view.net >= 0 ? 'ok' : 'bad'}`}>
            <span className="pos-verdict-icon" aria-hidden="true">
              {view.net >= 0 ? '✓' : '✕'}
            </span>
            <div>
              <strong>
                {view.t.sales === 0
                  ? `No sales this ${name}`
                  : view.net >= 0
                    ? `Profitable this ${name}`
                    : `Loss this ${name}`}
              </strong>
              <span>
                Net profit {formatMoney(view.net, currency)} · {pct(share(view.net, view.t.sales))}{' '}
                net margin
              </span>
            </div>
            <Change now={view.net} before={view.prevNet} />
          </div>

          <div className="pos-grid-stats four">
            <div className="pos-card pos-stat">
              <span>Sales</span>
              <strong>{formatMoney(view.t.sales, currency)}</strong>
              <small className="pos-stat-sub">
                {view.t.orders} orders <Change now={view.t.sales} before={data.prevSummary.totals.sales} />
              </small>
            </div>
            <div className="pos-card pos-stat">
              <span>Gross profit</span>
              <strong>{formatMoney(view.t.gross, currency)}</strong>
              <small className="pos-stat-sub">{pct(view.t.margin)} margin</small>
            </div>
            <div className="pos-card pos-stat">
              <span>Salary + overheads</span>
              <strong>{formatMoney(data.salary.total + data.overhead.total, currency)}</strong>
              <small className="pos-stat-sub">
                Salary {formatMoney(data.salary.total, currency)} · Overheads{' '}
                {formatMoney(data.overhead.total, currency)}
              </small>
            </div>
            <div className="pos-card pos-stat">
              <span>Net profit</span>
              <strong className={view.net < 0 ? 'pos-neg' : 'pos-pos'}>
                {formatMoney(view.net, currency)}
              </strong>
              <small className="pos-stat-sub">{pct(share(view.net, view.t.sales))} margin</small>
            </div>
          </div>

          <div className="pos-card" style={{ marginBottom: '0.85rem' }}>
            <h2 className="pos-card-title">
              {period === 'yearly' ? 'Monthly' : 'Daily'} sales &amp; net profit
            </h2>
            <ProfitChart data={view.chart} />
          </div>

          <div className="pos-split" style={{ marginBottom: '0.85rem' }}>
            <div className="pos-card">
              <h2 className="pos-card-title">Profit breakdown</h2>
              <div className="pos-pnl">
                <div>
                  <span>Sales</span>
                  <span>{formatMoney(view.t.sales, currency)}</span>
                </div>
                <div className="minus">
                  <span>
                    Cost of goods <small>{pct(share(view.t.cost, view.t.sales))} of sales</small>
                  </span>
                  <span>− {formatMoney(view.t.cost, currency)}</span>
                </div>
                <div className="subtotal">
                  <span>
                    Gross profit <small>{pct(view.t.margin)} margin</small>
                  </span>
                  <span>{formatMoney(view.t.gross, currency)}</span>
                </div>
                <div className="minus">
                  <span>
                    Staff salary <small>{pct(share(data.salary.total, view.t.sales))} of sales</small>
                  </span>
                  <span>− {formatMoney(data.salary.total, currency)}</span>
                </div>
                <div className="minus">
                  <span>
                    Overheads <small>{pct(share(data.overhead.total, view.t.sales))} of sales</small>
                  </span>
                  <span>− {formatMoney(data.overhead.total, currency)}</span>
                </div>
                {Object.entries(data.overhead.byCategory)
                  .sort((a, b) => b[1] - a[1])
                  .map(([cat, amount]) => (
                    <div key={cat} className="minus sub">
                      <span>{categoryLabel(cat)}</span>
                      <span>{formatMoney(amount, currency)}</span>
                    </div>
                  ))}
                <div className="total">
                  <span>
                    Net profit <small>{pct(share(view.net, view.t.sales))} margin</small>
                  </span>
                  <span className={view.net < 0 ? 'pos-neg' : 'pos-pos'}>
                    {formatMoney(view.net, currency)}
                  </span>
                </div>
              </div>
              <ul className="pos-list" style={{ marginTop: '0.75rem' }}>
                <li>
                  <span>Average order</span>
                  <strong>
                    {formatMoney(view.t.orders ? view.t.sales / view.t.orders : 0, currency)}
                  </strong>
                </li>
                <li>
                  <span>Items sold</span>
                  <strong>{view.t.items_sold}</strong>
                </li>
                {view.t.discount > 0 && (
                  <li>
                    <span>Discounts given</span>
                    <strong>{formatMoney(view.t.discount, currency)}</strong>
                  </li>
                )}
                {view.best && (
                  <li>
                    <span>Best {period === 'yearly' ? 'month' : 'day'} · {view.best.label}</span>
                    <strong className="pos-pos">{formatMoney(view.best.net, currency)}</strong>
                  </li>
                )}
                {view.worst && view.worst !== view.best && (
                  <li>
                    <span>Worst {period === 'yearly' ? 'month' : 'day'} · {view.worst.label}</span>
                    <strong className={view.worst.net < 0 ? 'pos-neg' : ''}>
                      {formatMoney(view.worst.net, currency)}
                    </strong>
                  </li>
                )}
              </ul>
              <p className="pos-meta" style={{ marginTop: '0.6rem' }}>
                {data.expensesError
                  ? 'Overheads not loaded. Run supabase/pos-overheads.sql, then add rent and bills in the Overheads tab.'
                  : data.overhead.total === 0
                    ? 'No overheads recorded. Add rent and bills in the Overheads tab for a true net profit.'
                    : isCurrent
                      ? 'Monthly overheads are spread evenly per day and counted up to today.'
                      : 'Monthly overheads are spread evenly per day.'}
              </p>
              {(data.salary.missed.length > 0 || data.salary.noRate.length > 0) && (
                <p className="pos-meta" style={{ marginTop: '0.6rem' }}>
                  {data.salary.missed.length > 0 &&
                    `Missed clock-outs not paid: ${data.salary.missed.join(', ')}. `}
                  {data.salary.noRate.length > 0 &&
                    `No hourly rate for ${data.salary.noRate.join(', ')} (counted as RM 0).`}
                </p>
              )}
            </div>

            <div className="pos-card">
              <h2 className="pos-card-title">Where to improve</h2>
              <ul className="pos-insights">
                {view.insights.map((tip) => (
                  <li key={tip.title} className={tip.tone}>
                    <strong>{tip.title}</strong>
                    <span>{tip.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {detailed && (
            <div className="pos-split" style={{ marginBottom: '0.85rem' }}>
              <div className="pos-card">
                <h2 className="pos-card-title">Busiest hours</h2>
                {data.summary.hours.some((h) => h.orders) ? (
                  <BarList
                    rows={data.summary.hours
                      .filter((h) => h.orders > 0)
                      .map((h) => ({
                        key: h.hour,
                        label: `${h.hour % 12 || 12}${h.hour >= 12 ? 'pm' : 'am'}`,
                        value: h.orders,
                        display: `${h.orders} orders`,
                      }))}
                  />
                ) : (
                  <p className="pos-meta">No orders yet.</p>
                )}
              </div>
              <div className="pos-card">
                <h2 className="pos-card-title">Average sales by day of week</h2>
                <BarList
                  rows={[1, 2, 3, 4, 5, 6, 0].map((dow) => {
                    const w = data.summary.weekdays[dow];
                    const avg = w.days ? w.sales / w.days : 0;
                    return {
                      key: dow,
                      label: DAY_SHORT[dow],
                      value: avg,
                      display: formatMoney(avg, currency),
                    };
                  })}
                />
              </div>
            </div>
          )}

          <div className="pos-card" style={{ overflowX: 'auto' }}>
            <h2 className="pos-card-title">Product performance</h2>
            {data.summary.products.length ? (
              <table className="pos-table stack">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Qty</th>
                    <th>Sales</th>
                    <th>Profit</th>
                    <th>Margin</th>
                    <th>Share of profit</th>
                  </tr>
                </thead>
                <tbody>
                  {(detailed ? data.summary.products : data.summary.products.slice(0, 10)).map((p) => (
                    <tr key={p.product_name}>
                      <td className="pos-cell-title">
                        <strong>{p.product_name}</strong>
                        {!p.cost && <div className="pos-product-meta">No cost set</div>}
                      </td>
                      <td data-label="Qty">{p.quantity}</td>
                      <td data-label="Sales">{formatMoney(p.sales, currency)}</td>
                      <td data-label="Profit">
                        <span className={p.profit < 0 ? 'pos-neg' : ''}>
                          {formatMoney(p.profit, currency)}
                        </span>
                      </td>
                      <td data-label="Margin">{pct(p.margin)}</td>
                      <td data-label="Share of profit">{pct(share(p.profit, view.t.gross))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="pos-meta">No sales this {name}.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
