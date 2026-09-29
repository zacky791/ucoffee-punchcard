import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { formatMoney } from '../../context/CartContext';

export default function DashboardPage() {
  const [data, setData] = useState(null);
  const [settings, setSettings] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [dash, sett] = await Promise.all([
          api.posDashboard(),
          api.posGetSettings(),
        ]);
        if (!alive) return;
        setData(dash);
        setSettings(sett);
      } catch (err) {
        if (alive) setError(err.message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const currency = settings?.currency || 'MYR';
  const maxTrend = Math.max(
    1,
    ...(data?.sales_trend || []).map((d) => Number(d.total) || 0)
  );

  return (
    <div>
      <div className="pos-page-head">
        <div>
          <h1>Dashboard</h1>
          <p>Today’s café sales at a glance</p>
        </div>
        <Link className="pos-btn primary" to="/ordering/pos">
          New order
        </Link>
      </div>

      {error && <div className="pos-alert error">{error}</div>}
      {loading && <div className="pos-card">Loading…</div>}

      {data && (
        <>
          <div className="pos-grid-stats">
            <div className="pos-card pos-stat">
              <span>Today’s sales</span>
              <strong>{formatMoney(data.today.total_sales, currency)}</strong>
            </div>
            <div className="pos-card pos-stat">
              <span>Orders</span>
              <strong>{data.today.order_count}</strong>
            </div>
            <div className="pos-card pos-stat">
              <span>Average order</span>
              <strong>
                {formatMoney(data.today.average_order_value, currency)}
              </strong>
            </div>
          </div>

          <div className="pos-split">
            <div className="pos-card">
              <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>Sales trend (7 days)</h2>
              <div className="pos-trend">
                {(data.sales_trend || []).map((d) => (
                  <div
                    key={d.date}
                    className="pos-trend-bar"
                    style={{ height: `${(Number(d.total) / maxTrend) * 100}%` }}
                    title={formatMoney(d.total, currency)}
                  >
                    <span>{d.date.slice(5)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="pos-card">
              <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>Payment methods</h2>
              <ul className="pos-list">
                {Object.keys(data.payment_breakdown || {}).length === 0 && (
                  <li>
                    <span>No payments yet today</span>
                  </li>
                )}
                {Object.entries(data.payment_breakdown || {}).map(([method, total]) => (
                  <li key={method}>
                    <span style={{ textTransform: 'capitalize' }}>{method}</span>
                    <strong>{formatMoney(total, currency)}</strong>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="pos-split" style={{ marginTop: '0.85rem' }}>
            <div className="pos-card">
              <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>Best sellers</h2>
              <ul className="pos-list">
                {(data.best_sellers || []).length === 0 && (
                  <li>
                    <span>No item sales yet</span>
                  </li>
                )}
                {(data.best_sellers || []).map((p) => (
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
              <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>Recent orders</h2>
              <ul className="pos-list">
                {(data.recent_orders || []).length === 0 && (
                  <li>
                    <span>No orders yet</span>
                  </li>
                )}
                {(data.recent_orders || []).map((o) => (
                  <li key={o.id}>
                    <span>
                      {o.order_number}{' '}
                      <span className={`pos-status ${o.status}`}>{o.status}</span>
                    </span>
                    <strong>{formatMoney(o.grand_total, currency)}</strong>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
