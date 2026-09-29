import { useEffect, useState } from 'react';
import { api } from '../../api';
import { formatMoney } from '../../context/CartContext';

export default function ReportsPage() {
  const [period, setPeriod] = useState('daily');
  const [report, setReport] = useState(null);
  const [settings, setSettings] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [r, s] = await Promise.all([
          api.posSalesReport({ period }),
          api.posGetSettings(),
        ]);
        if (!alive) return;
        setReport(r);
        setSettings(s);
      } catch (err) {
        if (alive) setError(err.message);
      }
    })();
    return () => {
      alive = false;
    };
  }, [period]);

  const currency = settings?.currency || 'MYR';

  return (
    <div>
      <div className="pos-page-head">
        <div>
          <h1>Reports</h1>
          <p>Sales from real paid orders</p>
        </div>
        <select
          className="pos-select"
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
        >
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
        </select>
      </div>

      {error && <div className="pos-alert error">{error}</div>}

      {report && (
        <>
          <div className="pos-grid-stats">
            <div className="pos-card pos-stat">
              <span>Total sales</span>
              <strong>{formatMoney(report.total_sales, currency)}</strong>
            </div>
            <div className="pos-card pos-stat">
              <span>Orders</span>
              <strong>{report.order_count}</strong>
            </div>
            <div className="pos-card pos-stat">
              <span>Period</span>
              <strong style={{ fontSize: '1rem' }}>{period}</strong>
            </div>
          </div>

          <div className="pos-split">
            <div className="pos-card">
              <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>Product sales</h2>
              <ul className="pos-list">
                {(report.products || []).slice(0, 12).map((p) => (
                  <li key={p.product_name}>
                    <span>
                      {p.product_name} · {p.quantity}
                    </span>
                    <strong>{formatMoney(p.sales, currency)}</strong>
                  </li>
                ))}
              </ul>
            </div>
            <div className="pos-card">
              <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>Cashier sales</h2>
              <ul className="pos-list">
                {(report.cashiers || []).map((c) => (
                  <li key={c.cashier_name}>
                    <span>
                      {c.cashier_name} · {c.orders} orders
                    </span>
                    <strong>{formatMoney(c.sales, currency)}</strong>
                  </li>
                ))}
              </ul>
              <h2 style={{ fontSize: '1.05rem' }}>Payment totals</h2>
              <ul className="pos-list">
                {Object.entries(report.payment_methods || {}).map(([m, total]) => (
                  <li key={m}>
                    <span style={{ textTransform: 'capitalize' }}>{m}</span>
                    <strong>{formatMoney(total, currency)}</strong>
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
