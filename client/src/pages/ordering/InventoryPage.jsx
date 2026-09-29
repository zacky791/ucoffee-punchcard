import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api';
import Toast from '../../components/Toast';

const UNITS = ['g', 'ml', 'pcs', 'kg', 'L', 'slice', 'pack'];

const emptyItem = {
  name: '',
  unit: 'g',
  quantity: '',
  min_threshold: '',
  pack_price: '',
  pack_size: '',
};

export function formatUnitCost(n, currency = 'MYR') {
  const v = Number(n || 0);
  return `${currency} ${v.toFixed(v > 0 && v < 1 ? 4 : 2)}`;
}

function formatQty(n) {
  return Number(n || 0).toLocaleString('en-MY', { maximumFractionDigits: 3 });
}

function ItemModal({ item, onClose, onSaved }) {
  const isNew = !item.id;
  const [form, setForm] = useState(() =>
    isNew
      ? emptyItem
      : {
          name: item.name,
          unit: item.unit,
          quantity: '',
          min_threshold: String(item.min_threshold ?? ''),
          pack_price: String(item.pack_price ?? ''),
          pack_size: String(item.pack_size ?? ''),
        }
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const size = Number(form.pack_size);
  const perUnit = size > 0 ? Number(form.pack_price || 0) / size : 0;

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const payload = {
        name: form.name,
        unit: form.unit,
        min_threshold: Number(form.min_threshold) || 0,
        pack_price: Number(form.pack_price) || 0,
        pack_size: Number(form.pack_size) || 1,
      };
      if (isNew) await api.posCreateInventory({ ...payload, quantity: Number(form.quantity) || 0 });
      else await api.posUpdateInventory(item.id, payload);
      onSaved(isNew ? `${form.name} added` : `${form.name} updated`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pos-modal-backdrop" onClick={busy ? undefined : onClose}>
      <form className="pos-modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2>{isNew ? 'Add inventory item' : `Edit ${item.name}`}</h2>
        <p className="hint">
          Enter what you pay for one pack, e.g. RM 60 for a 1000 g bag of beans.
        </p>
        {error && <div className="pos-alert error">{error}</div>}
        <div className="pos-form-grid">
          <label className="pos-field full">
            <span>Name</span>
            <input
              className="pos-input"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>
          <label className="pos-field">
            <span>Unit</span>
            <input
              className="pos-input"
              list="pos-units"
              required
              value={form.unit}
              onChange={(e) => setForm({ ...form, unit: e.target.value })}
            />
            <datalist id="pos-units">
              {UNITS.map((u) => (
                <option key={u} value={u} />
              ))}
            </datalist>
          </label>
          <label className="pos-field">
            <span>Low stock alert at ({form.unit || 'unit'})</span>
            <input
              className="pos-input"
              type="number"
              min="0"
              step="0.001"
              value={form.min_threshold}
              onChange={(e) => setForm({ ...form, min_threshold: e.target.value })}
            />
          </label>
          <label className="pos-field">
            <span>Pack price (RM)</span>
            <input
              className="pos-input"
              type="number"
              min="0"
              step="0.01"
              value={form.pack_price}
              onChange={(e) => setForm({ ...form, pack_price: e.target.value })}
            />
          </label>
          <label className="pos-field">
            <span>Pack size ({form.unit || 'unit'})</span>
            <input
              className="pos-input"
              type="number"
              min="0.001"
              step="0.001"
              value={form.pack_size}
              onChange={(e) => setForm({ ...form, pack_size: e.target.value })}
            />
          </label>
          {isNew && (
            <label className="pos-field full">
              <span>Current stock ({form.unit || 'unit'})</span>
              <input
                className="pos-input"
                type="number"
                min="0"
                step="0.001"
                value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: e.target.value })}
              />
            </label>
          )}
        </div>
        <div className="pos-alert ok" style={{ marginTop: '0.85rem', marginBottom: 0 }}>
          Cost per {form.unit || 'unit'}: <strong>{formatUnitCost(perUnit)}</strong>
        </div>
        <div className="pos-modal-actions">
          <button type="button" className="pos-btn ghost" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="pos-btn primary" disabled={busy}>
            {busy ? 'Saving…' : isNew ? 'Add item' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function InventoryPage() {
  const [items, setItems] = useState([]);
  const [moves, setMoves] = useState([]);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);
  const [toast, setToast] = useState(null);
  const [adjust, setAdjust] = useState({
    inventory_item_id: '',
    type: 'in',
    quantity: '',
    note: '',
  });
  const clearToast = useCallback(() => setToast(null), []);

  async function load() {
    try {
      const [inv, mv] = await Promise.all([api.posGetInventory(), api.posStockMovements(30)]);
      setItems(inv || []);
      setMoves(mv || []);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function submit(e) {
    e.preventDefault();
    setError('');
    try {
      await api.posAdjustInventory({
        ...adjust,
        quantity: Number(adjust.quantity),
      });
      setAdjust({ inventory_item_id: '', type: 'in', quantity: '', note: '' });
      setToast({ tone: 'ok', text: 'Stock updated' });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  const selected = items.find((i) => i.id === adjust.inventory_item_id);

  return (
    <div>
      <div className="pos-page-head">
        <div>
          <h1>Inventory</h1>
          <p>Every sale deducts its recipe from stock. Set recipes in Profit.</p>
        </div>
        <button type="button" className="pos-btn primary" onClick={() => setEditing({})}>
          + Add item
        </button>
      </div>
      {error && <div className="pos-alert error">{error}</div>}

      <form className="pos-card pos-form-grid" onSubmit={submit} style={{ marginBottom: '0.85rem' }}>
        <label className="pos-field">
          <span>Item</span>
          <select
            className="pos-select"
            required
            value={adjust.inventory_item_id}
            onChange={(e) =>
              setAdjust({ ...adjust, inventory_item_id: e.target.value })
            }
          >
            <option value="">Select item</option>
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
        </label>
        <label className="pos-field">
          <span>Type</span>
          <select
            className="pos-select"
            value={adjust.type}
            onChange={(e) => setAdjust({ ...adjust, type: e.target.value })}
          >
            <option value="in">Stock in</option>
            <option value="out">Stock out</option>
            <option value="adjust">Set quantity</option>
          </select>
        </label>
        <label className="pos-field">
          <span>Quantity{selected ? ` (${selected.unit})` : ''}</span>
          <input
            className="pos-input"
            type="number"
            step="0.001"
            required
            value={adjust.quantity}
            onChange={(e) => setAdjust({ ...adjust, quantity: e.target.value })}
          />
        </label>
        <label className="pos-field">
          <span>Note</span>
          <input
            className="pos-input"
            value={adjust.note}
            onChange={(e) => setAdjust({ ...adjust, note: e.target.value })}
          />
        </label>
        <div className="pos-field full">
          <button type="submit" className="pos-btn primary">
            Apply adjustment
          </button>
        </div>
      </form>

      <div className="pos-card" style={{ overflowX: 'auto', marginBottom: '0.85rem' }}>
        <table className="pos-table stack">
          <thead>
            <tr>
              <th>Item</th>
              <th>In stock</th>
              <th>Alert at</th>
              <th>Cost / unit</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.map((i) => {
              const low = Number(i.quantity) <= Number(i.min_threshold);
              return (
                <tr key={i.id}>
                  <td className="pos-cell-title">
                    <strong>{i.name}</strong>
                  </td>
                  <td data-label="In stock">
                    {formatQty(i.quantity)} {i.unit}
                  </td>
                  <td data-label="Alert at">
                    {formatQty(i.min_threshold)} {i.unit}
                  </td>
                  <td data-label="Cost / unit">
                    {Number(i.cost_per_unit) > 0
                      ? `${formatUnitCost(i.cost_per_unit)} / ${i.unit}`
                      : '—'}
                  </td>
                  <td data-label="Status">
                    {low ? (
                      <span className="pos-badge off">Low stock</span>
                    ) : (
                      <span className="pos-badge ok">OK</span>
                    )}
                  </td>
                  <td className="pos-cell-action">
                    <button type="button" className="pos-btn ghost" onClick={() => setEditing(i)}>
                      Edit
                    </button>
                  </td>
                </tr>
              );
            })}
            {!items.length && (
              <tr>
                <td colSpan={6}>No inventory items yet. Add your ingredients first.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="pos-card">
        <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>Recent stock movements</h2>
        <ul className="pos-list">
          {moves.map((m) => {
            const q = Number(m.quantity);
            return (
              <li key={m.id}>
                <span>
                  <strong>{m.item?.name || 'Item'}</strong>
                  <span className="pos-product-meta" style={{ display: 'block' }}>
                    {new Date(m.created_at).toLocaleString('en-GB', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })}
                    {m.note ? ` · ${m.note}` : ''}
                  </span>
                </span>
                <strong className={q < 0 ? 'pos-neg' : 'pos-pos'}>
                  {q > 0 ? '+' : ''}
                  {formatQty(q)} {m.item?.unit}
                </strong>
              </li>
            );
          })}
          {!moves.length && <li>No movements yet.</li>}
        </ul>
      </div>

      {editing && (
        <ItemModal
          item={editing}
          onClose={() => setEditing(null)}
          onSaved={async (message) => {
            setEditing(null);
            setToast({ tone: 'ok', text: message });
            await load();
          }}
        />
      )}
      <Toast toast={toast} onDone={clearToast} />
    </div>
  );
}
