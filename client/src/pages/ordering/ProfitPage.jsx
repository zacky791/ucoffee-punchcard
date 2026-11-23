import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import PeriodRangeNav, { PeriodCustomRange } from '../../components/PeriodRangeNav';
import { formatMoney } from '../../context/CartContext';
import {
  addDays,
  businessDateKey,
  businessDayRange,
  DAY_LABELS,
  parseDateKey,
} from '../../lib/performance';
import {
  loadExpenses,
  overheadByDate,
  categoryLabel,
  closedWeekdaysFromHours,
  isOpenDateKey,
  monthlyEstimateForRange,
} from '../../lib/overhead';
import { loadPunches, salaryByDate } from '../../lib/payroll';
import { usePeriodRange } from '../../lib/periodRange';

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

function overheadLineTip(line, currency, daysInRange, fixedMonthly) {
  if (line.kind === 'one_off') return `${categoryLabel(line.category)} · one-off`;
  if (line.kind === 'estimate') return line.tip;
  if (fixedMonthly && line.category !== 'electricity' && line.category !== 'water') {
    return `${categoryLabel(line.category)} · full month ${formatMoney(line.amount, currency)}`;
  }
  const openDays = Math.max(1, daysInRange);
  return `${categoryLabel(line.category)} · ${formatMoney(line.amount, currency)}/mo ÷ open days ≈ ${formatMoney(
    line.total / openDays,
    currency
  )}/open day × ${openDays} (closed days skipped)`;
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

export default function ProfitPage() {
  const today = businessDateKey(new Date().toISOString());
  const period = usePeriodRange(today);
  const { mode, from, to, label, canGoForward, showCustom, presets, pickers, shiftRange, setFromDate, setToDate } =
    period;
  const [report, setReport] = useState(null);
  const [currency, setCurrency] = useState('MYR');
  const [expenses, setExpenses] = useState([]);
  const [closedWeekdays, setClosedWeekdays] = useState(() => closedWeekdaysFromHours(null));
  const [people, setPeople] = useState({ punches: [], staff: [] });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [utilityOpen, setUtilityOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    Promise.all([api.posGetSettings(), loadExpenses(), api.getHours().catch(() => [])])
      .then(([s, ex, hours]) => {
        if (!alive) return;
        setCurrency(s?.currency || 'MYR');
        setExpenses(ex.expenses || []);
        setClosedWeekdays(closedWeekdaysFromHours(hours));
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
    () =>
      overheadByDate(expenses, from, to, closedWeekdays, {
        fixedMonthly: mode === 'month',
      }),
    [expenses, from, to, closedWeekdays, mode]
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
      hasRealElectric
        ? 0
        : monthlyEstimateForRange(ELECTRIC_ESTIMATE_MONTHLY, from, to, closedWeekdays),
    [hasRealElectric, from, to, closedWeekdays]
  );
  const waterEstimate = useMemo(
    () =>
      hasRealWater
        ? 0
        : monthlyEstimateForRange(WATER_ESTIMATE_MONTHLY, from, to, closedWeekdays),
    [hasRealWater, from, to, closedWeekdays]
  );
  const net = round2(gross - overhead.total - salary.total - electricEstimate - waterEstimate);
  const rangeAllClosed = useMemo(() => {
    for (let key = from; key <= to; key = addDays(key, 1)) {
      if (isOpenDateKey(key, closedWeekdays)) return false;
    }
    return true;
  }, [from, to, closedWeekdays]);
  const closedDayLabel = useMemo(() => {
    if (!rangeAllClosed) return '';
    if (from === to) return DAY_LABELS[parseDateKey(from).getDay()] || 'This day';
    return 'These days';
  }, [rangeAllClosed, from, to]);
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
        tip: `Estimated MYR ${ELECTRIC_ESTIMATE_MONTHLY}/mo ÷ open days ≈ ${formatMoney(
          electricEstimate / days,
          currency
        )}/open day × ${days} (closed days skipped). Add a real electricity overhead to replace this estimate.`,
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
        tip: `Estimated MYR ${WATER_ESTIMATE_MONTHLY}/mo ÷ open days ≈ ${formatMoney(
          waterEstimate / days,
          currency
        )}/open day × ${days} (closed days skipped). Add a real water overhead to replace this estimate.`,
      });
    }
    utility.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
    return {
      otherOverheads: other,
      utilityItems: utility,
      utilityTotal: round2(utility.reduce((s, l) => s + l.total, 0)),
    };
  }, [overhead, electricEstimate, waterEstimate, currency]);

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
                      <InfoTip
                        text={overheadLineTip(line, currency, daysInRange, overhead.fixedMonthly)}
                      />
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
                            <InfoTip
                              text={overheadLineTip(
                                line,
                                currency,
                                daysInRange,
                                overhead.fixedMonthly
                              )}
                            />
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
              {rangeAllClosed ? (
                <p className="pos-meta" style={{ marginTop: '0.75rem', marginBottom: 0 }}>
                  {closedDayLabel} closed — rent and utilities are charged on open days only.
                </p>
              ) : (
                overhead.total === 0 &&
                expenses.length === 0 && (
                  <p className="pos-meta" style={{ marginTop: '0.75rem', marginBottom: 0 }}>
                    No overheads yet. Add rent and electricity in{' '}
                    <Link to="/ordering/overheads">Overheads</Link> for a true net.
                  </p>
                )
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
                <>
                  {[
                    ['kitchen', 'Kitchen'],
                    ['bakery', 'Bakery'],
                    ['barista', 'Barista'],
                  ].map(([station, title]) => {
                    const rows = report.products.filter(
                      (p) => (p.station || 'kitchen') === station
                    );
                    if (!rows.length) return null;
                    const salesSum = rows.reduce((s, p) => s + Number(p.sales || 0), 0);
                    const profitSum = rows.reduce((s, p) => s + Number(p.profit || 0), 0);
                    return (
                      <div key={station} className="pos-sold-station">
                        <div className="pos-sold-station-head">
                          <h3>{title}</h3>
                          <span className="pos-meta">
                            {formatMoney(salesSum, currency)} sales ·{' '}
                            {formatMoney(profitSum, currency)} profit
                          </span>
                        </div>
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
                            {rows.map((p) => (
                              <tr key={`${station}-${p.product_name}`}>
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
                      </div>
                    );
                  })}
                </>
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
