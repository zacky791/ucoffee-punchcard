import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { formatMoney } from '../../context/CartContext';
import {
  addDays,
  businessDateKey,
  businessDayRange,
  parseDateKey,
} from '../../lib/performance';
import { loadExpenses, overheadByDate, categoryLabel } from '../../lib/overhead';
import { loadPunches, salaryByDate } from '../../lib/payroll';

function marginTone(margin) {
  if (margin == null) return '';
  if (margin >= 60) return 'good';
  if (margin >= 30) return 'mid';
  return 'low';
}

function Margin({ value }) {
  if (value == null) return <span className="pos-margin">—</span>;
  return <span className={`pos-margin ${marginTone(value)}`}>{value.toFixed(1)}%</span>;
}

function round2(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

/** Fallbacks when no matching overhead is recorded yet. */
const ELECTRIC_ESTIMATE_MONTHLY = 400;
const WATER_ESTIMATE_MONTHLY = 50;
const UTILITY_CATEGORIES = new Set(['internet', 'electricity', 'water']);

function overheadLineTip(line, currency, daysInRange) {
  if (line.kind === 'one_off') return `${categoryLabel(line.category)} · one-off`;
  if (line.kind === 'estimate') return line.tip;
  return `${categoryLabel(line.category)} · ${formatMoney(line.amount, currency)}/mo ≈ ${formatMoney(
    line.total / daysInRange,
    currency
  )}/day × ${daysInRange}`;
}

function daysInMonthKey(ym) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

/** Spread an estimated monthly bill over [fromKey, toKey], same as recurring overheads. */
function monthlyEstimateForRange(monthlyAmount, fromKey, toKey) {
  if (!fromKey || !toKey || fromKey > toKey || !monthlyAmount) return 0;
  let total = 0;
  for (let key = fromKey; key <= toKey; key = addDays(key, 1)) {
    total += monthlyAmount / daysInMonthKey(key.slice(0, 7));
  }
  return round2(total);
}

function InfoTip({ text, side = 'top' }) {
  if (!text) return null;
  return (
    <span className={`pos-info-tip${side === 'left' ? ' left' : ''}`}>
      <button type="button" className="pos-info-tip-btn" aria-label={text}>
        i
      </button>
      <span className="pos-info-tip-bubble" role="tooltip">
        {text}
      </span>
    </span>
  );
}

function Skel({ w = '4.5rem', h = '1.15rem' }) {
  return <span className="pos-skel" style={{ width: w, height: h }} aria-hidden="true" />;
}

function ProfitSkeleton() {
  return (
    <>
      <div className="pos-grid-stats five" aria-busy="true" aria-label="Loading profit">
        {['Sales', 'Cost', 'Profit', 'Margin', 'Net minus all'].map((label) => (
          <div key={label} className="pos-card pos-stat">
            <span>{label}</span>
            <strong>
              <Skel w="5.5rem" h="1.55rem" />
            </strong>
          </div>
        ))}
      </div>

      <div className="pos-card pos-net-breakdown" aria-busy="true">
        <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>Net for this period</h2>
        <div className="pos-pnl">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className={i === 4 ? 'total' : i === 0 ? '' : 'minus'}>
              <span>
                <Skel w={i === 4 ? '5rem' : '7rem'} />
              </span>
              <span>
                <Skel w="4.5rem" />
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="pos-card" style={{ overflowX: 'auto' }} aria-busy="true">
        <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>
          <Skel w="8rem" h="1.2rem" />
        </h2>
        <div className="pos-skel-rows">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="pos-skel-row">
              <Skel w="40%" />
              <Skel w="12%" />
              <Skel w="16%" />
              <Skel w="16%" />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function dayName(key, today) {
  if (key === today) return 'Today';
  if (key === addDays(today, -1)) return 'Yesterday';
  return parseDateKey(key).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

function rangeLabel(from, to, today) {
  if (from === to) return dayName(from, today);
  const a = parseDateKey(from).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
  });
  const b = parseDateKey(to).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: from.slice(0, 4) === to.slice(0, 4) ? undefined : 'numeric',
  });
  return `${a} – ${b}`;
}

export default function ProfitPage() {
  const today = businessDateKey(new Date().toISOString());
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [report, setReport] = useState(null);
  const [currency, setCurrency] = useState('MYR');
  const [expenses, setExpenses] = useState([]);
  const [people, setPeople] = useState({ punches: [], staff: [] });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [utilityOpen, setUtilityOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    Promise.all([api.posGetSettings(), loadExpenses()])
      .then(([s, ex]) => {
        if (!alive) return;
        setCurrency(s?.currency || 'MYR');
        setExpenses(ex.expenses || []);
      })
      .catch((err) => alive && setError(err.message));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (from > to) return;
    let alive = true;
    setLoading(true);
    setError('');
    const rangeFrom = businessDayRange(from).from;
    const rangeTo = businessDayRange(to).to;
    Promise.all([
      api.posProfitReport({ from: rangeFrom, to: rangeTo }),
      loadPunches(from, to),
    ])
      .then(([r, punches]) => {
        if (!alive) return;
        setReport(r);
        setPeople(punches);
      })
      .catch((err) => alive && setError(err.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [from, to]);

  const overhead = useMemo(
    () => overheadByDate(expenses, from, to),
    [expenses, from, to]
  );

  const salary = useMemo(() => salaryByDate(people, from, to), [people, from, to]);

  const sales = Number(report?.sales || 0);
  const cogs = Number(report?.cost || 0);
  const gross = Number(report?.profit || 0);
  const daysInRange = overhead.days || 1;
  const hasRealElectric = (overhead.byCategory?.electricity || 0) > 0;
  const hasRealWater = (overhead.byCategory?.water || 0) > 0;
  const electricEstimate = useMemo(
    () =>
      hasRealElectric ? 0 : monthlyEstimateForRange(ELECTRIC_ESTIMATE_MONTHLY, from, to),
    [hasRealElectric, from, to]
  );
  const waterEstimate = useMemo(
    () => (hasRealWater ? 0 : monthlyEstimateForRange(WATER_ESTIMATE_MONTHLY, from, to)),
    [hasRealWater, from, to]
  );
  const net = round2(gross - overhead.total - salary.total - electricEstimate - waterEstimate);
  const { otherOverheads, utilityItems, utilityTotal } = useMemo(() => {
    const lines = Object.values(overhead.byExpense || {}).sort(
      (a, b) => b.total - a.total || a.name.localeCompare(b.name)
    );
    const other = [];
    const utility = [];
    for (const line of lines) {
      if (UTILITY_CATEGORIES.has(line.category)) utility.push(line);
      else other.push(line);
    }
    const days = overhead.days || 1;
    if (electricEstimate > 0) {
      utility.push({
        id: 'estimate-electric',
        name: 'Electric bill',
        category: 'electricity',
        kind: 'estimate',
        amount: ELECTRIC_ESTIMATE_MONTHLY,
        total: electricEstimate,
        tip: `Estimated MYR ${ELECTRIC_ESTIMATE_MONTHLY}/mo ≈ ${formatMoney(
          electricEstimate / days,
          currency
        )}/day × ${days}. Add a real electricity overhead to replace this estimate.`,
      });
    }
    if (waterEstimate > 0) {
      utility.push({
        id: 'estimate-water',
        name: 'Water bill',
        category: 'water',
        kind: 'estimate',
        amount: WATER_ESTIMATE_MONTHLY,
        total: waterEstimate,
        tip: `Estimated MYR ${WATER_ESTIMATE_MONTHLY}/mo ≈ ${formatMoney(
          waterEstimate / days,
          currency
        )}/day × ${days}. Add a real water overhead to replace this estimate.`,
      });
    }
    utility.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
    return {
      otherOverheads: other,
      utilityItems: utility,
      utilityTotal: round2(utility.reduce((s, l) => s + l.total, 0)),
    };
  }, [overhead, electricEstimate, waterEstimate, currency]);

  const activePreset = [1, 7, 30, 90].find((n) => to === today && from === addDays(today, -(n - 1)));
  const singleDay = from === to;
  const canGoForward = (singleDay ? from : to) < today;
  const label = rangeLabel(from, to, today);

  function preset(n) {
    setTo(today);
    setFrom(addDays(today, -(n - 1)));
  }

  function shiftDay(delta) {
    if (singleDay) {
      const next = addDays(from, delta);
      if (next > today) return;
      setFrom(next);
      setTo(next);
      return;
    }
    const nextTo = addDays(to, delta);
    if (nextTo > today) return;
    const span = Math.round((parseDateKey(to) - parseDateKey(from)) / 86400000);
    setTo(nextTo);
    setFrom(addDays(nextTo, -span));
  }

  function setFromDate(value) {
    setFrom(value);
    if (value > to) setTo(value);
  }

  function setToDate(value) {
    setTo(value);
    if (value < from) setFrom(value);
  }

  return (
    <div>
      <div className="pos-page-head">
        <div>
          <h1>Profit</h1>
        </div>
      </div>

      <div className="pos-report-bar">
        <p className="pos-meta" style={{ margin: 0 }}>
          {label}
          {loading ? (
            <>
              {' · '}
              <Skel w="4.5rem" h="0.85rem" />
            </>
          ) : report ? (
            ` · ${report.order_count} order(s)`
          ) : (
            ''
          )}
        </p>
        <div className="pos-day-nav">
          <button
            type="button"
            className="pos-btn ghost"
            aria-label="Previous day"
            onClick={() => shiftDay(-1)}
          >
            ←
          </button>
          <button
            type="button"
            className="pos-btn ghost"
            aria-label="Next day"
            disabled={!canGoForward}
            onClick={() => shiftDay(1)}
          >
            →
          </button>
          {[1, 7, 30, 90].map((n) => (
            <button
              key={n}
              type="button"
              className={`pos-btn ${activePreset === n ? 'primary' : 'ghost'}`}
              aria-pressed={activePreset === n}
              onClick={() => preset(n)}
            >
              {n === 1 ? 'Today' : `${n}d`}
            </button>
          ))}
        </div>
      </div>

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

      {error && <div className="pos-alert error">{error}</div>}

      {loading ? (
        <ProfitSkeleton />
      ) : (
        report && (
          <>
            <div className="pos-grid-stats five">
              <div className="pos-card pos-stat">
                <span>Sales</span>
                <strong>{formatMoney(report.sales, currency)}</strong>
              </div>
              <div className="pos-card pos-stat">
                <span>Cost</span>
                <strong>{formatMoney(report.cost, currency)}</strong>
              </div>
              <div className="pos-card pos-stat">
                <span>Profit</span>
                <strong className={gross < 0 ? 'pos-neg' : ''}>
                  {formatMoney(gross, currency)}
                </strong>
              </div>
              <div className="pos-card pos-stat">
                <span>Margin</span>
                <strong>
                  <Margin value={report.margin} />
                </strong>
              </div>
              <div className="pos-card pos-stat">
                <span>Net minus all</span>
                <strong className={net < 0 ? 'pos-neg' : 'pos-pos'}>
                  {formatMoney(net, currency)}
                </strong>
              </div>
            </div>

            <div className="pos-card pos-net-breakdown">
              <div className="pos-net-head">
                <h2 style={{ margin: 0, fontSize: '1.05rem' }}>Net for this period</h2>
                <p className="pos-net-breakeven">
                  Average cost per day MYR 200
                  <InfoTip
                    side="left"
                    text="Fixed daily target: ~MYR 200 average cost / sales to break even after food cost (includes estimated electric)."
                  />
                </p>
              </div>
              <div className="pos-pnl">
                <div>
                  <span>Gross profit</span>
                  <span className={gross < 0 ? 'pos-neg' : ''}>
                    {formatMoney(gross, currency)}
                  </span>
                </div>
                {otherOverheads.map((line) => (
                  <div key={line.id} className="minus">
                    <span className="pos-pnl-label">
                      {line.name}
                      <InfoTip text={overheadLineTip(line, currency, daysInRange)} />
                    </span>
                    <span>− {formatMoney(line.total, currency)}</span>
                  </div>
                ))}
                <div className="minus">
                  <span className="pos-pnl-label">
                    Staff salary
                    <InfoTip
                      text={`Barista ${formatMoney(salary.barista || 0, currency)} (${salary.baristaHours || 0}h) · Chef ${formatMoney(salary.kitchen || 0, currency)} (${salary.kitchenHours || 0}h)`}
                    />
                  </span>
                  <span>− {formatMoney(salary.total || 0, currency)}</span>
                </div>
                {utilityItems.length > 0 && (
                  <div className={`minus pos-pnl-fold${utilityOpen ? ' open' : ''}`}>
                    <button
                      type="button"
                      className="pos-pnl-fold-btn"
                      aria-expanded={utilityOpen}
                      onClick={() => setUtilityOpen((v) => !v)}
                    >
                      <span className="pos-pnl-label">
                        Utility
                        <span className="pos-pnl-fold-chevron" aria-hidden="true">
                          ▾
                        </span>
                      </span>
                      <span>− {formatMoney(utilityTotal, currency)}</span>
                    </button>
                    {utilityOpen &&
                      utilityItems.map((line) => (
                        <div key={line.id} className="minus sub">
                          <span className="pos-pnl-label">
                            {line.name}
                            <InfoTip text={overheadLineTip(line, currency, daysInRange)} />
                          </span>
                          <span>− {formatMoney(line.total, currency)}</span>
                        </div>
                      ))}
                  </div>
                )}
                <div className="total">
                  <span>Net profit</span>
                  <span className={net < 0 ? 'pos-neg' : 'pos-pos'}>
                    {formatMoney(net, currency)}
                  </span>
                </div>
              </div>
              {overhead.total === 0 && (
                <p className="pos-meta" style={{ marginTop: '0.75rem', marginBottom: 0 }}>
                  No overheads yet. Add rent and electricity in{' '}
                  <Link to="/ordering/overheads">Overheads</Link> for a true net.
                </p>
              )}
            </div>

            {report.estimated_items > 0 && (
              <div className="pos-alert warn">
                {report.estimated_items} item(s) were sold before their cost was recorded, so
                today's cost is used for them.
              </div>
            )}

            <div className="pos-card" style={{ overflowX: 'auto' }}>
              <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>Sold – {label}</h2>
              {report.products.length ? (
                <table className="pos-table stack">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Qty</th>
                      <th>Sales</th>
                      <th>Cost</th>
                      <th>Profit</th>
                      <th>Margin</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.products.map((p) => (
                      <tr key={p.product_name}>
                        <td className="pos-cell-title">
                          <strong>{p.product_name}</strong>
                        </td>
                        <td data-label="Qty">{p.quantity}</td>
                        <td data-label="Sales">{formatMoney(p.sales, currency)}</td>
                        <td data-label="Cost">{formatMoney(p.cost, currency)}</td>
                        <td data-label="Profit">
                          <span className={p.profit < 0 ? 'pos-neg' : ''}>
                            {formatMoney(p.profit, currency)}
                          </span>
                        </td>
                        <td data-label="Margin">
                          <Margin value={p.margin} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="pos-meta">No paid orders in this period.</p>
              )}
            </div>
          </>
        )
      )}
    </div>
  );
}
