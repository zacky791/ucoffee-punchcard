import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../api';
import { formatMoney } from '../../context/CartContext';
import Toast from '../../components/Toast';
import { addDays, businessDateKey, parseDateKey } from '../../lib/performance';
import { restockList } from '../../lib/restock';

function fmtQty(n) {
  return Number(n || 0).toLocaleString('en-MY', { maximumFractionDigits: 3 });
}

const round2 = (n) => Math.round(n * 100) / 100;

function PurchaseModal({ purchase, date, inventory, currency, onClose, onSaved }) {
  const isNew = !purchase.id;
  const [form, setForm] = useState(() => ({
    type: purchase.id && !purchase.inventory_item_id ? 'other' : purchase.type || (inventory.length ? 'stock' : 'other'),
    inventory_item_id: purchase.inventory_item_id || '',
    name: purchase.inventory_item_id ? '' : purchase.name || '',
    packs: purchase.packs != null ? String(purchase.packs) : '',
    quantity: purchase.quantity != null ? String(Number(purchase.quantity)) : '',
    byPack: purchase.packs != null,
    amount: purchase.amount != null ? String(Number(purchase.amount)) : '',
    amountTouched: purchase.amount != null,
    purchase_date: purchase.purchase_date || date,
    note: purchase.note || '',
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const item = inventory.find((i) => i.id === form.inventory_item_id);
  const packSize = item ? Number(item.pack_size) || 0 : 0;
  const packPrice = item ? Number(item.pack_price) || 0 : 0;
  const canPack = form.type === 'stock' && packSize > 0 && (packSize !== 1 || packPrice > 0);
  const byPack = canPack && form.byPack;
  const stockQty = byPack ? (Number(form.packs) || 0) * packSize : Number(form.quantity) || 0;
  const suggested = item && packPrice > 0 && packSize > 0 ? round2((stockQty / packSize) * packPrice) : null;

  function set(patch) {
    setForm((f) => {
      const next = { ...f, ...patch };
      if (!next.amountTouched) {
        const it = inventory.find((i) => i.id === next.inventory_item_id);
        const size = Number(it?.pack_size) || 0;
        const price = Number(it?.pack_price) || 0;
        if (next.type === 'stock' && it && size > 0 && price > 0) {
          const qty = next.byPack ? (Number(next.packs) || 0) * size : Number(next.quantity) || 0;
          next.amount = qty ? String(round2((qty / size) * price)) : '';
        }
      }
      return next;
    });
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const payload = {
        purchase_date: form.purchase_date,
        name: form.type === 'stock' ? item?.name || '' : form.name,
        inventory_item_id: form.type === 'stock' ? form.inventory_item_id || null : null,
        quantity: form.type === 'stock' ? stockQty : null,
        amount: Number(form.amount),
        note: form.note,
      };
      if (form.type === 'stock' && !payload.inventory_item_id) throw new Error('Choose the stock item you bought');
      if (isNew) await api.posCreatePurchase(payload);
      else await api.posUpdatePurchase(purchase.id, payload);
      onSaved(isNew ? `${payload.name} recorded` : `${payload.name} updated`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pos-modal-backdrop" onClick={busy ? undefined : onClose}>
      <form className="pos-modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2>{isNew ? 'Add expense' : `Edit ${purchase.name}`}</h2>
        {error && <div className="pos-alert error">{error}</div>}

        <div className="pos-segment" role="radiogroup" aria-label="Expense type" style={{ marginBottom: '0.85rem' }}>
          <button
            type="button"
            role="radio"
            aria-checked={form.type === 'stock'}
            className={form.type === 'stock' ? 'active' : ''}
            onClick={() => set({ type: 'stock' })}
          >
            Restock item
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={form.type === 'other'}
            className={form.type === 'other' ? 'active' : ''}
            onClick={() => set({ type: 'other' })}
          >
            Other expense
          </button>
        </div>

        <div className="pos-form-grid">
          {form.type === 'stock' ? (
            <>
              <label className="pos-field full">
                <span>Stock item</span>
                <select
                  className="pos-select"
                  required
                  value={form.inventory_item_id}
                  onChange={(e) => set({ inventory_item_id: e.target.value, byPack: true })}
                >
                  <option value="">Choose item…</option>
                  {inventory.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name} ({fmtQty(i.quantity)} {i.unit} left)
                    </option>
                  ))}
                </select>
              </label>
              {canPack && (
                <div className="pos-field full">
                  <div className="pos-segment small" role="radiogroup" aria-label="Count by">
                    <button
                      type="button"
                      className={byPack ? 'active' : ''}
                      onClick={() => set({ byPack: true })}
                    >
                      Packs ({fmtQty(packSize)} {item.unit})
                    </button>
                    <button
                      type="button"
                      className={!byPack ? 'active' : ''}
                      onClick={() => set({ byPack: false })}
                    >
                      {item.unit}
                    </button>
                  </div>
                </div>
              )}
              <label className="pos-field">
                <span>{byPack ? 'Packs bought' : `Amount bought${item ? ` (${item.unit})` : ''}`}</span>
                <input
                  className="pos-input"
                  type="number"
                  min="0"
                  step="any"
                  required
                  value={byPack ? form.packs : form.quantity}
                  onChange={(e) => set(byPack ? { packs: e.target.value } : { quantity: e.target.value })}
                />
              </label>
            </>
          ) : (
            <label className="pos-field full">
              <span>What did you buy?</span>
              <input
                className="pos-input"
                required
                placeholder="e.g. Ice, cleaning supplies, gas"
                value={form.name}
                onChange={(e) => set({ name: e.target.value })}
              />
            </label>
          )}
          <label className={`pos-field ${form.type === 'stock' ? '' : 'full'}`}>
            <span>Paid ({currency})</span>
            <input
              className="pos-input"
              type="number"
              min="0"
              step="0.01"
              required
              value={form.amount}
              onChange={(e) => set({ amount: e.target.value, amountTouched: true })}
            />
          </label>
          {form.type === 'stock' && item && stockQty > 0 && (
            <p className="pos-meta pos-field full" style={{ margin: 0 }}>
              Adds {fmtQty(stockQty)} {item.unit} to stock → {fmtQty(Number(item.quantity) + stockQty - (purchase.inventory_item_id === item.id ? Number(purchase.quantity) || 0 : 0))}{' '}
              {item.unit}
              {suggested != null && form.amountTouched && Number(form.amount) !== suggested
                ? ` · usual price ${formatMoney(suggested, currency)}`
                : ''}
            </p>
          )}
          <label className="pos-field">
            <span>Date</span>
            <input
              className="pos-input"
              type="date"
              required
              value={form.purchase_date}
              onChange={(e) => set({ purchase_date: e.target.value })}
            />
          </label>
          <label className="pos-field">
            <span>Note (optional)</span>
            <input
              className="pos-input"
              placeholder="e.g. shop name"
              value={form.note}
              onChange={(e) => set({ note: e.target.value })}
            />
          </label>
        </div>

        <div className="pos-modal-actions">
          <button type="button" className="pos-btn ghost" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="pos-btn primary" disabled={busy}>
            {busy ? 'Saving…' : isNew ? 'Add' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function ExpensesPage() {
  const today = businessDateKey(new Date().toISOString());
  const [date, setDate] = useState(today);
  const [purchases, setPurchases] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [currency, setCurrency] = useState('MYR');
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [toast, setToast] = useState(null);
  const [error, setError] = useState('');
  const clearToast = useCallback(() => setToast(null), []);

  const load = useCallback(async () => {
    const [list, inv, settings] = await Promise.all([
      api.posGetPurchases({ from: date, to: date }).catch((err) => err),
      api.posGetInventory().catch(() => []),
      api.posGetSettings().catch(() => null),
    ]);
    setInventory((inv || []).filter((i) => i.active !== false));
    setCurrency(settings?.currency || 'MYR');
    if (list instanceof Error) {
      setPurchases([]);
      setError(
        /pos_purchases/.test(list.message)
          ? 'Expenses are not set up yet. Run supabase/pos-purchases.sql in the Supabase SQL Editor.'
          : list.message
      );
    } else {
      setPurchases(list || []);
      setError('');
    }
    setLoading(false);
  }, [date]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const total = useMemo(
    () => round2(purchases.reduce((s, p) => s + Number(p.amount || 0), 0)),
    [purchases]
  );
  const stockTotal = useMemo(
    () => round2(purchases.filter((p) => p.inventory_item_id).reduce((s, p) => s + Number(p.amount || 0), 0)),
    [purchases]
  );
  const lowStock = useMemo(() => restockList(inventory), [inventory]);

  const isToday = date === today;
  const dayLabel = parseDateKey(date).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  async function remove(p) {
    const stockNote = p.stock_movement_id
      ? ` ${fmtQty(p.quantity)} ${p.item?.unit || ''} will be taken back out of stock.`
      : '';
    if (!window.confirm(`Delete ${p.name}?${stockNote}`)) return;
    try {
      await api.posDeletePurchase(p.id);
      setToast({ tone: 'ok', text: `${p.name} deleted` });
      await load();
    } catch (err) {
      setToast({ tone: 'error', text: err.message });
    }
  }

  return (
    <div>
      <div className="pos-page-head">
        <div>
          <h1>Expenses</h1>
          <p>What you bought each day. Restock items are added to inventory automatically.</p>
        </div>
        <button type="button" className="pos-btn primary" onClick={() => setEditing({})}>
          + Add expense
        </button>
      </div>

      <div className="pos-report-bar">
        <p className="pos-meta">Bought on {dayLabel}</p>
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
            aria-label="Expense date"
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

      <div className="pos-grid-stats">
        <div className="pos-card pos-stat">
          <span>{isToday ? 'Spent today' : 'Spent this day'}</span>
          <strong>{formatMoney(total, currency)}</strong>
        </div>
        <div className="pos-card pos-stat">
          <span>Restock</span>
          <strong>{formatMoney(stockTotal, currency)}</strong>
        </div>
        <div className="pos-card pos-stat">
          <span>Other</span>
          <strong>{formatMoney(round2(total - stockTotal), currency)}</strong>
        </div>
      </div>

      {isToday && lowStock.length > 0 && (
        <div className="pos-restock">
          <div className="pos-restock-head">
            <strong>⚠ Need to restock · tap to record what you bought</strong>
          </div>
          <div className="pos-expense-chips">
            {lowStock.map((i) => (
              <button
                key={i.id}
                type="button"
                className="pos-btn ghost"
                onClick={() =>
                  setEditing({
                    type: 'stock',
                    inventory_item_id: i.id,
                    ...(i.packs ? { packs: i.packs } : { quantity: i.need }),
                    ...(i.cost ? { amount: i.cost } : {}),
                  })
                }
              >
                + {i.name}{' '}
                <small>
                  {i.packs ? `${i.packs} pack(s)` : `${fmtQty(i.need)} ${i.unit}`}
                </small>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="pos-card" style={{ overflowX: 'auto' }}>
        <h2 className="pos-card-title">
          Expenses
          {purchases.length > 0 && <small> · {purchases.length} item(s)</small>}
        </h2>
        <table className="pos-table stack">
          <thead>
            <tr>
              <th>Item</th>
              <th>Added to stock</th>
              <th>Paid</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {purchases.map((p) => (
              <tr key={p.id}>
                <td className="pos-cell-title">
                  <strong>{p.name}</strong>
                  <div className="pos-product-meta">
                    {p.inventory_item_id ? 'Restock' : 'Other'}
                    {p.note ? ` · ${p.note}` : ''}
                  </div>
                </td>
                <td data-label="Added to stock">
                  {p.stock_movement_id ? `+${fmtQty(p.quantity)} ${p.item?.unit || ''}` : '—'}
                </td>
                <td data-label="Paid">
                  <strong>{formatMoney(p.amount, currency)}</strong>
                </td>
                <td className="pos-cell-action">
                  <div className="pos-row-actions">
                    <button type="button" className="pos-btn ghost" onClick={() => setEditing(p)}>
                      Edit
                    </button>
                    <button type="button" className="pos-btn ghost" onClick={() => remove(p)}>
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!loading && !purchases.length && (
              <tr>
                <td colSpan={4}>Nothing recorded for this day.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <PurchaseModal
          purchase={editing}
          date={date}
          inventory={inventory}
          currency={currency}
          onClose={() => setEditing(null)}
          onSaved={async (text) => {
            setEditing(null);
            setToast({ tone: 'ok', text });
            await load();
          }}
        />
      )}
      <Toast toast={toast} onDone={clearToast} />
    </div>
  );
}
