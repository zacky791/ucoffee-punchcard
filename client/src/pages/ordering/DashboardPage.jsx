import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { formatMoney } from '../../context/CartContext';
import {
  addDays,
  businessDateKey,
  businessDayRange,
  parseDateKey,
} from '../../lib/performance';
import { restockList } from '../../lib/restock';
import { OrderDetailModal } from './OrdersPage';

const PAID = ['paid', 'preparing', 'ready', 'completed'];
const MAX_DAILY_BARS = 92;

function shortDay(key) {
  return parseDateKey(key).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function monthLabel(key) {
  return parseDateKey(`${key}-01`).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
}

/** Round the chart top up to 1, 2, 2.5 or 5 × 10ⁿ so the RM scale reads cleanly. */
function niceMax(value) {
  if (value <= 0) return 100;
  const pow = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((s) => s * pow >= value);
  return step * pow;
}

function formatAxis(n) {
  if (n >= 1000) return `${Math.round((n / 1000) * 10) / 10}k`;
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function fmtQty(n) {
  return Number(n || 0).toLocaleString('en-MY', { maximumFractionDigits: 2 });
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

function RefreshIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        d="M21 12a9 9 0 0 0-15.5-6.4M3 4v5h5M3 12a9 9 0 0 0 15.5 6.4M21 20v-5h-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function DashboardPage() {
  const today = businessDateKey(new Date().toISOString());
  const [viewDay, setViewDay] = useState(today);
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [currency, setCurrency] = useState('MYR');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [selected, setSelected] = useState(null);
  const [lowStock, setLowStock] = useState([]);
  const [ordersOpen, setOrdersOpen] = useState(false);

  const loadDay = useCallback(async (day) => {
    const range = businessDayRange(day);
    const [list, profit, settings, inventory] = await Promise.all([
      api.posGetOrders({ from: range.from, to: range.to, limit: 200 }),
      api.posProfitReport({ from: range.from, to: range.to }),
      api.posGetSettings(),
      api.posGetInventory().catch(() => []),
    ]);
    setLowStock(restockList(inventory || []));
    setOrders(list || []);
    setProducts(
      [...(profit?.products || [])].sort((a, b) => b.quantity - a.quantity || b.sales - a.sales)
    );
    setCurrency(settings?.currency || 'MYR');
  }, []);

  useEffect(() => {
    let alive = true;
    loadDay(viewDay)
      .catch((err) => alive && setError(err.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [loadDay, viewDay]);

  async function refresh() {
    if (refreshing) return;
    setRefreshing(true);
    setError('');
    try {
      await loadDay(viewDay);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setError(err.message);
    } finally {
      setRefreshing(false);
    }
  }

  const paid = orders.filter((o) => PAID.includes(o.status));
  const totalSales = paid.reduce((s, o) => s + Number(o.grand_total || 0), 0);
  const itemsSold = products.reduce((s, p) => s + Number(p.quantity || 0), 0);
  const label = dayName(viewDay, today);
  const isToday = viewDay === today;

  async function openOrder(id) {
    try {
      setSelected(await api.posGetOrder(id));
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <div className="pos-page-head">
        <h1>Dashboard</h1>
        <button
          type="button"
          className={`pos-icon-btn ${refreshing ? 'spinning' : ''}`}
          aria-label="Refresh dashboard"
          disabled={refreshing || loading}
          onClick={refresh}
        >
          <RefreshIcon />
        </button>
      </div>

      {error && <div className="pos-alert error">{error}</div>}
      {loading && <div className="pos-card">Loading…</div>}

      {!loading && (
        <>
          {lowStock.length > 0 && (
            <div className="pos-restock">
              <div className="pos-restock-head">
                <strong>
                  ⚠ {lowStock.length} item(s) running low. Restock soon
                </strong>
                <span className="pos-restock-links">
                  <Link to="/ordering/restock">Record restock</Link>
                  <Link to="/ordering/inventory">Open Inventory</Link>
                </span>
              </div>
              <ul>
                {lowStock.map((i) => (
                  <li key={i.id}>
                    <span className="pos-restock-name">
                      <strong>{i.name}</strong>
                      <small>
                        {i.out ? 'Out of stock' : `${fmtQty(i.quantity)} ${i.unit} left`} · alert at{' '}
                        {fmtQty(i.min_threshold)} {i.unit}
                      </small>
                    </span>
                    <span className="pos-restock-buy">
                      <strong>
                        Buy {i.packs ? `${i.packs} pack(s)` : `${fmtQty(i.need)} ${i.unit}`}
                      </strong>
                      <small>
                        {i.packs
                          ? `${fmtQty(i.packs * i.pack_size)} ${i.unit}${i.cost ? ` · ~${formatMoney(i.cost, currency)}` : ''}`
                          : `to reach ${fmtQty(i.target)} ${i.unit}`}
                      </small>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="pos-grid-stats two">
            <div className="pos-card pos-stat">
              <span>{isToday ? 'Today’s sales' : `${label} sales`}</span>
              <strong>{formatMoney(totalSales, currency)}</strong>
            </div>
            <div className="pos-card pos-stat">
              <span>Orders</span>
              <strong>{paid.length}</strong>
            </div>
          </div>

          <div className="pos-split">
            <div className="pos-card">
              <h2 className="pos-card-title">
                {isToday ? 'Today sales' : `${label} sales`}
                {itemsSold > 0 && <small> · {itemsSold} item(s)</small>}
              </h2>
              <ul className="pos-list">
                {products.length === 0 && (
                  <li>
                    <span>No item sales yet</span>
                  </li>
                )}
                {products.map((p) => (
                  <li key={p.product_name}>
                    <span>
                      {p.product_name} · {p.quantity} sold
                    </span>
                    <strong>{formatMoney(p.sales, currency)}</strong>
                  </li>
                ))}
              </ul>
            </div>

            <div className={`pos-card pos-collapse ${ordersOpen ? 'open' : ''}`}>
              <button
                type="button"
                className="pos-collapse-toggle"
                aria-expanded={ordersOpen}
                onClick={() => setOrdersOpen((v) => !v)}
              >
                <h2 className="pos-card-title" style={{ margin: 0 }}>
                  Orders
                  {orders.length > 0 && <small> · {orders.length}</small>}
                </h2>
                <span className="pos-collapse-chevron" aria-hidden="true">
                  ▾
                </span>
              </button>
              <div className="pos-collapse-body">
                <ul className="pos-list">
                  {orders.length === 0 && (
                    <li>
                      <span>{isToday ? 'No orders yet today' : `No orders on ${label}`}</span>
                    </li>
                  )}
                  {orders.map((o) => (
                    <li key={o.id} className="pos-order-row">
                      <span>
                        <strong>{o.order_number}</strong>
                        <small className="pos-product-meta">
                          {' '}
                          {new Date(o.created_at).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}{' '}
                          · <span className={`pos-status ${o.status}`}>{o.status}</span>
                        </small>
                      </span>
                      <span className="pos-order-row-end">
                        <strong>{formatMoney(o.grand_total, currency)}</strong>
                        <button
                          type="button"
                          className="pos-btn ghost"
                          onClick={() => openOrder(o.id)}
                        >
                          View
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          <SalesTrend
            today={today}
            currency={currency}
            refreshKey={refreshKey}
            onDayChange={setViewDay}
          />
        </>
      )}

      {selected && (
        <OrderDetailModal
          order={selected}
          currency={currency}
          onClose={() => setSelected(null)}
          onUpdated={async () => {
            await loadDay(viewDay);
            setSelected(await api.posGetOrder(selected.id));
          }}
          onDeleted={() => loadDay(viewDay)}
          onError={setError}
        />
      )}
    </div>
  );
}

function FilterIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path
        d="M4 6h16M7 12h10M10 18h4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SalesTrend({ today, currency, refreshKey = 0, onDayChange }) {
  const [from, setFrom] = useState(addDays(today, -6));
  const [to, setTo] = useState(today);
  const [buckets, setBuckets] = useState(null);
  const [error, setError] = useState('');
  const [showRange, setShowRange] = useState(false);
  const scrollRef = useRef(null);

  const days = Math.round((parseDateKey(to) - parseDateKey(from)) / 86400000) + 1;
  const byMonth = days > MAX_DAILY_BARS;

  useEffect(() => {
    if (from > to) return;
    let alive = true;
    setError('');
    api
      .posSummaryReport({
        from: businessDayRange(from).from,
        to: businessDayRange(to).to,
        bucket: byMonth ? 'month' : 'day',
      })
      .then((r) => alive && setBuckets(r.buckets || []))
      .catch((err) => alive && setError(err.message));
    return () => {
      alive = false;
    };
  }, [from, to, byMonth, refreshKey]);

  const bars = useMemo(() => {
    const found = Object.fromEntries((buckets || []).map((b) => [b.key, b]));
    const bar = (key, label) => ({
      key,
      label,
      total: Number(found[key]?.sales) || 0,
      orders: Number(found[key]?.orders) || 0,
    });
    const out = [];
    if (byMonth) {
      for (let key = from.slice(0, 7); key <= to.slice(0, 7); ) {
        out.push(bar(key, monthLabel(key)));
        const d = parseDateKey(`${key}-01`);
        d.setMonth(d.getMonth() + 1);
        key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      }
    } else {
      for (let key = from; key <= to; key = addDays(key, 1)) {
        out.push(bar(key, shortDay(key)));
      }
    }
    return out;
  }, [buckets, from, to, byMonth]);

  const [active, setActive] = useState(null);

  useEffect(() => {
    setActive(null);
    if (scrollRef.current) scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
  }, [bars]);

  const max = niceMax(Math.max(0, ...bars.map((b) => b.total)));
  const ticks = [4, 3, 2, 1, 0].map((i) => (max * i) / 4);
  const total = bars.reduce((s, b) => s + b.total, 0);
  const labelEvery = Math.ceil(bars.length / 10);
  const singleDay = from === to;
  const activePreset = [7, 30, 90].find((n) => to === today && from === addDays(today, -(n - 1)));
  const activeBar = bars.find((b) => b.key === active);
  const focusDay = singleDay ? from : to;
  const canGoForward = focusDay < today;
  const dayLabel = singleDay ? dayName(focusDay, today) : null;

  function preset(n) {
    setTo(today);
    setFrom(addDays(today, -(n - 1)));
    onDayChange?.(today);
  }

  function shiftDay(delta) {
    const next = addDays(focusDay, delta);
    if (next > today) return;
    setFrom(next);
    setTo(next);
    onDayChange?.(next);
  }

  function setFromDate(value) {
    setFrom(value);
    if (value === to) onDayChange?.(value);
  }

  function setToDate(value) {
    setTo(value);
    if (value === from) onDayChange?.(value);
  }

  return (
    <div className="pos-card" style={{ marginTop: '0.85rem' }}>
      <div className="pos-report-bar pos-trend-head" style={{ marginBottom: 0 }}>
        <h2 className="pos-card-title" style={{ margin: 0 }}>
          Sales trend
        </h2>
        <div className="pos-trend-total-wrap">
          <button
            type="button"
            className={`pos-icon-btn ${showRange ? 'active' : ''}`}
            aria-label="Filter date range"
            aria-expanded={showRange}
            onClick={() => setShowRange((v) => !v)}
          >
            <FilterIcon />
          </button>
          <strong className="pos-trend-total">
            {formatMoney(total, currency)}
            {dayLabel && <span> · {dayLabel}</span>}
          </strong>
        </div>
      </div>
      <div className="pos-day-nav pos-trend-presets">
        {[7, 30, 90].map((n) => (
          <button
            key={n}
            type="button"
            className={`pos-btn ${activePreset === n ? 'primary' : 'ghost'}`}
            aria-pressed={activePreset === n}
            onClick={() => preset(n)}
          >
            {n}d
          </button>
        ))}
      </div>
      <div className="pos-day-nav pos-trend-arrows">
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
      </div>
      {showRange && (
        <div className="pos-range">
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
      )}
      {error && <div className="pos-alert error">{error}</div>}
      {!buckets ? (
        <div className="pos-meta">Loading…</div>
      ) : (
        <>
          {activeBar && (
            <div className="pos-trend-info" aria-live="polite">
              <strong>{formatMoney(activeBar.total, currency)}</strong>
              <span>
                {byMonth
                  ? activeBar.label
                  : parseDateKey(activeBar.key).toLocaleDateString('en-GB', {
                      weekday: 'short',
                      day: 'numeric',
                      month: 'short',
                    })}{' '}
                · {activeBar.orders} order(s)
              </span>
            </div>
          )}
          <div className="pos-trend-chart">
            <div className="pos-trend-axis" aria-hidden="true">
              {ticks.map((t) => (
                <span key={t}>RM {formatAxis(t)}</span>
              ))}
            </div>
            <div className="pos-trend-scroll" ref={scrollRef}>
              <div className="pos-trend" style={{ minWidth: `${bars.length * 14}px` }}>
                <div className="pos-trend-grid" aria-hidden="true">
                  {ticks.map((t) => (
                    <i key={t} />
                  ))}
                </div>
                {bars.map((b, i) => (
                  <button
                    key={b.key}
                    type="button"
                    className={`pos-trend-col ${active === b.key ? 'active' : ''}`}
                    aria-label={`${b.label}: ${formatMoney(b.total, currency)}`}
                    onMouseEnter={() => setActive(b.key)}
                    onFocus={() => setActive(b.key)}
                    onClick={() => setActive(b.key)}
                  >
                    <span
                      className="pos-trend-bar"
                      style={{ height: `${max ? (b.total / max) * 100 : 0}%` }}
                    />
                    {i % labelEvery === 0 && <span className="pos-trend-label">{b.label}</span>}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
