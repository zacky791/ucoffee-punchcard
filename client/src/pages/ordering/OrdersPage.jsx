import { useEffect, useState } from 'react';
import { api } from '../../api';
import { formatMoney } from '../../context/CartContext';
import { printFromResult } from '../../lib/receiptPrinter';
import {
  addDays,
  businessDateKey,
  businessDayRange,
  parseDateKey,
} from '../../lib/performance';

export default function OrdersPage() {
  const today = businessDateKey(new Date().toISOString());
  const [orders, setOrders] = useState([]);
  const [settings, setSettings] = useState(null);
  const [date, setDate] = useState(today);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  async function load(day = date) {
    setLoading(true);
    setError('');
    try {
      const range = businessDayRange(day);
      const [list, sett] = await Promise.all([
        api.posGetOrders({ from: range.from, to: range.to, limit: 200 }),
        api.posGetSettings(),
      ]);
      setOrders(list || []);
      setSettings(sett);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const currency = settings?.currency || 'MYR';
  const isToday = date === today;
  const dayLabel = parseDateKey(date).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const dayTotal = orders
    .filter((o) => o.status !== 'cancelled')
    .reduce((s, o) => s + Number(o.grand_total || 0), 0);

  async function openDetail(id) {
    try {
      const order = await api.posGetOrder(id);
      setSelected(order);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <div className="pos-page-head">
        <div>
          <h1>Orders</h1>
          <p>Orders by day · reprint and manage status</p>
        </div>
      </div>

      {error && <div className="pos-alert error">{error}</div>}

      <div className="pos-report-bar">
        <p className="pos-meta">
          {dayLabel}
          {!loading && ` · ${orders.length} order(s) · ${formatMoney(dayTotal, currency)}`}
        </p>
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
            aria-label="Order date"
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

      <div className="pos-card" style={{ overflowX: 'auto' }}>
        {loading ? (
          <div>Loading…</div>
        ) : (
          <table className="pos-table stack">
            <thead>
              <tr>
                <th>Order</th>
                <th>Time</th>
                <th>Type</th>
                <th>Status</th>
                <th>Payment</th>
                <th>Total</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 && (
                <tr>
                  <td colSpan={7}>No orders on this day</td>
                </tr>
              )}
              {orders.map((o) => (
                <tr key={o.id}>
                  <td className="pos-cell-title">
                    <strong>{o.order_number}</strong>
                  </td>
                  <td data-label="Time">
                    {new Date(o.created_at).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                  <td data-label="Type">{o.order_type}</td>
                  <td data-label="Status">
                    <span className={`pos-status ${o.status}`}>{o.status}</span>
                  </td>
                  <td data-label="Payment">{o.payment?.method || '—'}</td>
                  <td data-label="Total">{formatMoney(o.grand_total, currency)}</td>
                  <td className="pos-cell-action">
                    <button
                      type="button"
                      className="pos-btn ghost"
                      onClick={() => openDetail(o.id)}
                    >
                      Details
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {selected && (
        <OrderDetailModal
          order={selected}
          currency={currency}
          onClose={() => setSelected(null)}
          onUpdated={async () => {
            await load();
            const fresh = await api.posGetOrder(selected.id);
            setSelected(fresh);
          }}
          onError={setError}
        />
      )}
    </div>
  );
}

function OrderDetailModal({ order, currency, onClose, onUpdated, onError }) {
  const [busy, setBusy] = useState(false);

  async function reprint() {
    setBusy(true);
    try {
      const res = await api.posReprint(order.id);
      const printed = await printFromResult(res.result);
      if (!printed.ok) onError(printed.message);
      await onUpdated();
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (!window.confirm('Cancel this order? Ingredients used will go back into inventory.')) return;
    setBusy(true);
    try {
      await api.posCancelOrder(order.id, { reason: 'Cancelled from Orders page' });
      await onUpdated();
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(status) {
    setBusy(true);
    try {
      await api.posUpdateOrderStatus(order.id, status);
      await onUpdated();
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pos-modal-backdrop" onClick={onClose}>
      <div className="pos-modal wide" onClick={(e) => e.stopPropagation()}>
        <h2>{order.order_number}</h2>
        <p className="hint">
          {order.order_type}
          {order.table_label ? ` · Table ${order.table_label}` : ''} ·{' '}
          <span className={`pos-status ${order.status}`}>{order.status}</span>
        </p>

        <table className="pos-table">
          <thead>
            <tr>
              <th>Item</th>
              <th>Qty</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {(order.items || []).map((item) => (
              <tr key={item.id}>
                <td>
                  <strong>{item.product_name}</strong>
                  {(item.modifiers || []).length > 0 && (
                    <div className="pos-product-meta">
                      {(item.modifiers || []).map((m) => m.name).join(', ')}
                    </div>
                  )}
                  {item.notes && (
                    <div className="pos-product-meta">Note: {item.notes}</div>
                  )}
                </td>
                <td>{item.quantity}</td>
                <td>{formatMoney(item.line_total, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="pos-totals" style={{ marginTop: '0.75rem' }}>
          <div>
            <span>Subtotal</span>
            <span>{formatMoney(order.subtotal, currency)}</span>
          </div>
          <div>
            <span>Discount</span>
            <span>-{formatMoney(order.discount, currency)}</span>
          </div>
          <div className="grand">
            <span>Grand total</span>
            <span>{formatMoney(order.grand_total, currency)}</span>
          </div>
          {order.payment && (
            <>
              <div>
                <span>Paid via</span>
                <span>{order.payment.method}</span>
              </div>
              <div>
                <span>Received / change</span>
                <span>
                  {formatMoney(order.payment.amount_received, currency)} /{' '}
                  {formatMoney(order.payment.change_due, currency)}
                </span>
              </div>
            </>
          )}
          {order.receipt && (
            <div>
              <span>Receipt</span>
              <span>
                {order.receipt.receipt_number} · {order.receipt.print_status}
              </span>
            </div>
          )}
        </div>

        <div className="pos-modal-actions" style={{ flexWrap: 'wrap' }}>
          <button type="button" className="pos-btn ghost" onClick={onClose}>
            Close
          </button>
          <button type="button" className="pos-btn" disabled={busy} onClick={reprint}>
            Reprint receipt
          </button>
          {order.status === 'paid' && (
            <button
              type="button"
              className="pos-btn"
              disabled={busy}
              onClick={() => setStatus('preparing')}
            >
              Mark preparing
            </button>
          )}
          {order.status === 'preparing' && (
            <button
              type="button"
              className="pos-btn"
              disabled={busy}
              onClick={() => setStatus('ready')}
            >
              Mark ready
            </button>
          )}
          {['paid', 'preparing', 'ready'].includes(order.status) && (
            <button
              type="button"
              className="pos-btn primary"
              disabled={busy}
              onClick={() => setStatus('completed')}
            >
              Complete
            </button>
          )}
          {order.status !== 'cancelled' && order.status !== 'completed' && (
            <button type="button" className="pos-btn danger" disabled={busy} onClick={cancel}>
              Cancel order
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
