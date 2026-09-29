import { useEffect, useState } from 'react';
import { api } from '../../api';

export default function InventoryPage() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const [adjust, setAdjust] = useState({
    inventory_item_id: '',
    type: 'in',
    quantity: '',
    note: '',
  });

  async function load() {
    try {
      setItems(await api.posGetInventory());
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
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <div className="pos-page-head">
        <div>
          <h1>Inventory</h1>
          <p>Stock levels, thresholds, and adjustments</p>
        </div>
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
          <span>Quantity</span>
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

      <div className="pos-card" style={{ overflowX: 'auto' }}>
        <table className="pos-table">
          <thead>
            <tr>
              <th>Item</th>
              <th>Qty</th>
              <th>Unit</th>
              <th>Min</th>
              <th>Alert</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => {
              const low = Number(i.quantity) <= Number(i.min_threshold);
              return (
                <tr key={i.id}>
                  <td>{i.name}</td>
                  <td>{i.quantity}</td>
                  <td>{i.unit}</td>
                  <td>{i.min_threshold}</td>
                  <td>
                    {low ? (
                      <span className="pos-badge off">Low stock</span>
                    ) : (
                      <span className="pos-badge ok">OK</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
