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

export default function DashboardPage() {
  const today = businessDateKey(new Date().toISOString());
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [currency, setCurrency] = useState('MYR');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [lowStock, setLowStock] = useState([]);

  const loadToday = useCallback(async () => {
    const range = businessDayRange(today);
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
  }, [today]);

  useEffect(() => {
    loadToday()
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [loadToday]);

  const paid = orders.filter((o) => PAID.includes(o.status));
  const totalSales = paid.reduce((s, o) => s + Number(o.grand_total || 0), 0);
  const average = paid.length ? totalSales / paid.length : 0;
  const itemsSold = products.reduce((s, p) => s + Number(p.quantity || 0), 0);

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
        <div>
          <h1>Dashboard</h1>
          <p>Today’s café sales at a glance</p>
        </div>
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
                  <Link to="/ordering/expenses">Record purchase</Link>
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

          <div className="pos-grid-stats">
            <div className="pos-card pos-stat">
              <span>Today’s sales</span>
              <strong>{formatMoney(totalSales, currency)}</strong>
            </div>
            <div className="pos-card pos-stat">
              <span>Orders</span>
              <strong>{paid.length}</strong>
            </div>
            <div className="pos-card pos-stat">
              <span>Average order</span>
              <strong>{formatMoney(average, currency)}</strong>
            </div>
          </div>

          <div className="pos-split">
            <div className="pos-card">
              <h2 className="pos-card-title">
                Today sales
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

            <div className="pos-card">
              <h2 className="pos-card-title">Orders</h2>
              <ul className="pos-list">
                {orders.length === 0 && (
                  <li>
                    <span>No orders yet today</span>
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

          <SalesTrend today={today} currency={currency} />
        </>
      )}

      {selected && (
        <OrderDetailModal
          order={selected}
          currency={currency}
          onClose={() => setSelected(null)}
          onUpdated={async () => {
            await loadToday();
            setSelected(await api.posGetOrder(selected.id));
          }}
          onDeleted={loadToday}
          onError={setError}
        />
      )}
    </div>
  );
}

function SalesTrend({ today, currency }) {
  const [from, setFrom] = useState(addDays(today, -6));
  const [to, setTo] = useState(today);
  const [buckets, setBuckets] = useState(null);
  const [error, setError] = useState('');
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
  }, [from, to, byMonth]);

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
  const activePreset = [7, 30, 90].find((n) => to === today && from === addDays(today, -(n - 1)));
  const activeBar = bars.find((b) => b.key === active);

  function preset(n) {
    setTo(today);
    setFrom(addDays(today, -(n - 1)));
  }

  return (
    <div className="pos-card" style={{ marginTop: '0.85rem' }}>
      <div className="pos-report-bar" style={{ marginBottom: 0 }}>
        <h2 className="pos-card-title" style={{ margin: 0 }}>
          Sales trend
          <small> · {formatMoney(total, currency)}</small>
        </h2>
        <div className="pos-day-nav">
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
      </div>
      <div className="pos-range">
        <label className="pos-field">
          <span className="pos-cart-label">From</span>
          <input
            type="date"
            className="pos-input"
            value={from}
            max={to}
            onChange={(e) => e.target.value && setFrom(e.target.value)}
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
            onChange={(e) => e.target.value && setTo(e.target.value)}
          />
        </label>
      </div>
      {error && <div className="pos-alert error">{error}</div>}
      {!buckets ? (
        <div className="pos-meta">Loading…</div>
      ) : (
        <>
          <div className="pos-trend-info" aria-live="polite">
            {activeBar ? (
              <>
                <strong>{formatMoney(activeBar.total, currency)}</strong>
                <span>
                  {byMonth ? activeBar.label : parseDateKey(activeBar.key).toLocaleDateString('en-GB', {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                  })}{' '}
                  · {activeBar.orders} order(s)
                </span>
              </>
            ) : (
              <span>Tap or hover a bar to see its sales</span>
            )}
          </div>
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
