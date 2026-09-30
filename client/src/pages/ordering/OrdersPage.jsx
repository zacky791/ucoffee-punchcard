import { useEffect, useState } from 'react';
import { api } from '../../api';
import { formatMoney } from '../../context/CartContext';
import { printFromResult } from '../../lib/receiptPrinter';
import PinPrompt from '../../components/PinPrompt';
import { kindOf } from '../../lib/menuKind';
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
                  <td data-label="Payment">
                    {o.payment?.method === 'qr' ? 'QR' : o.payment?.method || '—'}
                  </td>
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
          onDeleted={() => load()}
          onError={setError}
        />
      )}
    </div>
  );
}

const PencilIcon = () => (
  <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
    <path
      d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const TrashIcon = () => (
  <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
    <path
      d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4h6v3"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export function OrderDetailModal({ order, currency, onClose, onUpdated, onDeleted, onError }) {
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pinFor, setPinFor] = useState(null);
  const [editing, setEditing] = useState(false);

  function askPin(action) {
    setMenuOpen(false);
    setPinFor(action);
  }

  async function unlocked() {
    const action = pinFor;
    setPinFor(null);
    if (action === 'edit') {
      setEditing(true);
      return;
    }
    if (!window.confirm(`Delete ${order.order_number} permanently? Its sale is removed from reports and ingredients go back into inventory.`)) return;
    setBusy(true);
    try {
      await api.posDeleteOrder(order.id);
      await onDeleted?.();
      onClose();
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  }

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

  if (editing) {
    return (
      <OrderEditModal
        order={order}
        currency={currency}
        onCancel={() => setEditing(false)}
        onSaved={async () => {
          setEditing(false);
          await onUpdated();
        }}
      />
    );
  }

  return (
    <div className="pos-modal-backdrop" onClick={busy ? undefined : onClose}>
      <div
        className="pos-modal wide"
        onClick={(e) => {
          e.stopPropagation();
          if (menuOpen) setMenuOpen(false);
        }}
      >
        <div className="pos-modal-title">
          <h2>{order.order_number}</h2>
          <div className="pos-kebab">
            <button
              type="button"
              className="pos-kebab-btn"
              aria-label="More actions"
              aria-expanded={menuOpen}
              disabled={busy}
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen((v) => !v);
              }}
            >
              ⋮
            </button>
            {menuOpen && (
              <div className="pos-kebab-menu" role="menu">
                {order.status !== 'cancelled' && (
                  <button type="button" role="menuitem" onClick={() => askPin('edit')}>
                    <PencilIcon /> Edit order
                  </button>
                )}
                <button
                  type="button"
                  role="menuitem"
                  className="danger"
                  onClick={() => askPin('delete')}
                >
                  <TrashIcon /> Delete order
                </button>
              </div>
            )}
          </div>
        </div>
        {pinFor && (
          <PinPrompt
            title={pinFor === 'edit' ? 'Edit this order' : 'Delete this order'}
            onCancel={() => setPinFor(null)}
            onUnlock={unlocked}
          />
        )}
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
                <span>{order.payment.method === 'qr' ? 'QR' : order.payment.method}</span>
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

const PAYMENT_METHODS = ['qr', 'cash', 'card', 'ewallet', 'other'];

function OrderEditModal({ order, currency, onCancel, onSaved }) {
  const [qty, setQty] = useState(() =>
    Object.fromEntries((order.items || []).map((i) => [i.id, Number(i.quantity)]))
  );
  const [orderType, setOrderType] = useState(order.order_type || 'dine_in');
  const [table, setTable] = useState(order.table_label || '');
  const [notes, setNotes] = useState(order.notes || '');
  const [discount, setDiscount] = useState(String(Number(order.discount || 0)));
  const [method, setMethod] = useState(order.payment?.method || 'qr');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [added, setAdded] = useState([]);
  const [products, setProducts] = useState(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    api
      .posGetProducts({ active: 'true' })
      .then((list) => setProducts(list || []))
      .catch(() => setProducts([]));
  }, []);

  const subtotal =
    (order.items || []).reduce((s, i) => s + Number(i.unit_price) * (qty[i.id] || 0), 0) +
    added.reduce((s, a) => s + a.price * a.quantity, 0);
  const total = Math.max(0, subtotal - (Number(discount) || 0));
  const itemCount =
    Object.values(qty).reduce((s, n) => s + n, 0) + added.reduce((s, a) => s + a.quantity, 0);

  const matches = (products || []).filter((p) =>
    p.name.toLowerCase().includes(search.trim().toLowerCase())
  );

  function change(id, delta) {
    setQty((q) => ({ ...q, [id]: Math.max(0, (q[id] || 0) + delta) }));
  }

  function addProduct(product) {
    const temp = kindOf(product) === 'drink' ? 'cold' : null;
    setAdded((list) => {
      const twin = list.find((a) => a.product_id === product.id && a.temp === temp);
      if (twin) return list.map((a) => (a === twin ? { ...a, quantity: a.quantity + 1 } : a));
      return [
        ...list,
        {
          key: `${product.id}-${Date.now()}`,
          product_id: product.id,
          name: product.name,
          price: Number(product.base_price) || 0,
          quantity: 1,
          temp,
        },
      ];
    });
    setPickerOpen(false);
    setSearch('');
  }

  function changeAdded(key, patch) {
    setAdded((list) =>
      list
        .map((a) => (a.key === key ? { ...a, ...patch } : a))
        .filter((a) => a.quantity > 0)
    );
  }

  async function save() {
    setBusy(true);
    setError('');
    try {
      await api.posUpdateOrder(order.id, {
        items: Object.entries(qty).map(([id, quantity]) => ({ id, quantity })),
        add: added.map((a) => ({
          product_id: a.product_id,
          quantity: a.quantity,
          modifiers: a.temp ? [{ name: a.temp === 'hot' ? 'Hot' : 'Cold' }] : [],
        })),
        order_type: orderType,
        table_label: orderType === 'dine_in' ? table : null,
        notes,
        discount: Number(discount) || 0,
        payment_method: method,
      });
      await onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pos-modal-backdrop" onClick={busy ? undefined : onCancel}>
      <div className="pos-modal wide" onClick={(e) => e.stopPropagation()}>
        <h2>Edit {order.order_number}</h2>
        <p className="hint">Change quantities, remove items or fix the payment. Stock is updated to match.</p>
        {error && <div className="pos-alert error">{error}</div>}

        <ul className="pos-list pos-edit-items">
          {(order.items || []).map((item) => {
            const q = qty[item.id] || 0;
            return (
              <li key={item.id} className={q === 0 ? 'removed' : ''}>
                <span>
                  <strong>{item.product_name}</strong>
                  {(item.modifiers || []).length > 0 && (
                    <small className="pos-product-meta">
                      {' '}
                      · {(item.modifiers || []).map((m) => m.name).join(', ')}
                    </small>
                  )}
                  <small className="pos-product-meta" style={{ display: 'block' }}>
                    {q === 0 ? 'Will be removed' : formatMoney(Number(item.unit_price) * q, currency)}
                  </small>
                </span>
                <span className="pos-edit-controls">
                  <span className="pos-qty" style={{ marginTop: 0 }}>
                    <button type="button" onClick={() => change(item.id, -1)} disabled={q === 0}>
                      −
                    </button>
                    <span>{q}</span>
                    <button type="button" onClick={() => change(item.id, 1)}>
                      +
                    </button>
                  </span>
                  {q === 0 ? (
                    <button
                      type="button"
                      className="pos-edit-undo"
                      onClick={() => change(item.id, Number(item.quantity))}
                    >
                      Undo
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="pos-trash"
                      aria-label={`Delete ${item.product_name}`}
                      onClick={() => change(item.id, -q)}
                    >
                      <TrashIcon />
                    </button>
                  )}
                </span>
              </li>
            );
          })}
          {added.map((a) => (
            <li key={a.key} className="added">
              <span>
                <strong>{a.name}</strong> <span className="pos-edit-new">New</span>
                <small className="pos-product-meta" style={{ display: 'block' }}>
                  {formatMoney(a.price * a.quantity, currency)}
                </small>
              </span>
              <span className="pos-edit-controls">
                {a.temp && (
                  <div className="pos-temp" role="group" aria-label="Temperature">
                    {[
                      ['hot', 'Hot'],
                      ['cold', 'Cold'],
                    ].map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        className={`${value} ${a.temp === value ? 'active' : ''}`}
                        aria-pressed={a.temp === value}
                        onClick={() => changeAdded(a.key, { temp: value })}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
                <span className="pos-qty" style={{ marginTop: 0 }}>
                  <button type="button" onClick={() => changeAdded(a.key, { quantity: a.quantity - 1 })}>
                    −
                  </button>
                  <span>{a.quantity}</span>
                  <button type="button" onClick={() => changeAdded(a.key, { quantity: a.quantity + 1 })}>
                    +
                  </button>
                </span>
                <button
                  type="button"
                  className="pos-trash"
                  aria-label={`Delete ${a.name}`}
                  onClick={() => changeAdded(a.key, { quantity: 0 })}
                >
                  <TrashIcon />
                </button>
              </span>
            </li>
          ))}
        </ul>

        {pickerOpen ? (
          <div className="pos-cat-picker">
            <div className="pos-cat-picker-head">
              <input
                className="pos-input"
                autoFocus
                placeholder="Search food or drinks"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <button type="button" className="pos-btn ghost" onClick={() => setPickerOpen(false)}>
                Close
              </button>
            </div>
            <ul className="pos-edit-pick-list">
              {products === null && <li className="pos-product-meta">Loading menu…</li>}
              {products !== null && matches.length === 0 && (
                <li className="pos-product-meta">No items match.</li>
              )}
              {matches.map((p) => (
                <li key={p.id}>
                  <button type="button" onClick={() => addProduct(p)}>
                    <span>{p.name}</span>
                    <span className="pos-product-meta">{formatMoney(p.base_price, currency)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <button type="button" className="pos-cat-add-btn" onClick={() => setPickerOpen(true)}>
            + Add item
          </button>
        )}

        <div className="pos-edit-grid">
          <label className="pos-field">
            <span className="pos-cart-label">Order type</span>
            <select className="pos-select" value={orderType} onChange={(e) => setOrderType(e.target.value)}>
              <option value="dine_in">Dine-in</option>
              <option value="takeaway">Takeaway</option>
              <option value="delivery">Delivery</option>
            </select>
          </label>
          {orderType === 'dine_in' && (
            <label className="pos-field">
              <span className="pos-cart-label">Table</span>
              <input className="pos-input" value={table} onChange={(e) => setTable(e.target.value)} />
            </label>
          )}
          <label className="pos-field">
            <span className="pos-cart-label">Payment</span>
            <select className="pos-select" value={method} onChange={(e) => setMethod(e.target.value)}>
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {m === 'qr' ? 'QR' : m.charAt(0).toUpperCase() + m.slice(1)}
                </option>
              ))}
            </select>
          </label>
          <label className="pos-field">
            <span className="pos-cart-label">Discount ({currency})</span>
            <input
              className="pos-input"
              type="number"
              min="0"
              step="0.01"
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
            />
          </label>
          <label className="pos-field full">
            <span className="pos-cart-label">Order notes</span>
            <input className="pos-input" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
        </div>

        <div className="pos-totals" style={{ marginTop: '0.75rem' }}>
          <div className="grand">
            <span>New total</span>
            <span>{formatMoney(total, currency)}</span>
          </div>
          <div>
            <span>Was</span>
            <span>{formatMoney(order.grand_total, currency)}</span>
          </div>
        </div>
        {itemCount === 0 && (
          <div className="pos-alert warn">
            Every item is removed. Add an item, or use Delete order from the ⋮ menu instead.
          </div>
        )}

        <div className="pos-modal-actions">
          <button type="button" className="pos-btn ghost" disabled={busy} onClick={onCancel}>
            Back
          </button>
          <button
            type="button"
            className="pos-btn primary"
            disabled={busy || itemCount === 0}
            onClick={save}
          >
            {busy ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
