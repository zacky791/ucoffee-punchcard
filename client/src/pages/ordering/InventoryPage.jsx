import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../api';
import Toast from '../../components/Toast';
import { INV_STATIONS, normalizeStation, stationLabel } from '../../lib/stations';

const UNITS = ['g', 'ml', 'pcs', 'kg', 'L', 'slice', 'pack'];
const STATIONS = INV_STATIONS;

const emptyItem = {
  name: '',
  unit: 'g',
  quantity: '',
  min_threshold: '',
  pack_price: '',
  pack_size: '',
  use_per_serving: '',
  serving_note: '',
  station: 'barista',
};

export function formatUnitCost(n, currency = 'MYR') {
  const v = Number(n || 0);
  return `${currency} ${v.toFixed(2)}`;
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
          use_per_serving:
            item.use_per_serving != null && Number(item.use_per_serving) > 0
              ? String(item.use_per_serving)
              : '',
          serving_note: item.serving_note || '',
          station: normalizeStation(item.station),
        }
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const size = Number(form.pack_size);
  const perUnit = size > 0 ? Number(form.pack_price || 0) / size : 0;
  const servingQty = Number(form.use_per_serving) || 0;
  const perServing = servingQty > 0 ? perUnit * servingQty : 0;

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
        use_per_serving: Number(form.use_per_serving) || 0,
        serving_note: form.serving_note || '',
        station: form.station,
        image_url: item.image_url || '',
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
            <span>Station</span>
            <select
              className="pos-select"
              value={form.station}
              onChange={(e) => setForm({ ...form, station: e.target.value })}
            >
              {STATIONS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
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
          <label className="pos-field">
            <span>Use per serving ({form.unit || 'unit'})</span>
            <input
              className="pos-input"
              type="number"
              min="0"
              step="any"
              placeholder="e.g. 10"
              value={form.use_per_serving}
              onChange={(e) => setForm({ ...form, use_per_serving: e.target.value })}
            />
          </label>
          <label className="pos-field">
            <span>Serving note</span>
            <input
              className="pos-input"
              placeholder="e.g. 2 pumps"
              value={form.serving_note}
              onChange={(e) => setForm({ ...form, serving_note: e.target.value })}
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
          {servingQty > 0 ? (
            <>
              Cost per serving ({formatQty(servingQty)} {form.unit || 'unit'}):{' '}
              <strong>{formatUnitCost(perServing)}</strong>
              <span className="pos-product-meta" style={{ display: 'block', marginTop: '0.25rem' }}>
                {formatUnitCost(perUnit)} / {form.unit || 'unit'}
              </span>
            </>
          ) : (
            <>
              Cost per {form.unit || 'unit'}: <strong>{formatUnitCost(perUnit)}</strong>
              <span className="pos-product-meta" style={{ display: 'block', marginTop: '0.25rem' }}>
                Set use per serving to see serving cost
              </span>
            </>
          )}
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

function InventoryCard({ item, onEdit }) {
  const low = Number(item.quantity) <= Number(item.min_threshold);
  const per = Number(item.use_per_serving) || 0;
  return (
    <article
      className="pos-card pos-inv-card"
      role="button"
      tabIndex={0}
      onClick={() => onEdit(item)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onEdit(item);
        }
      }}
    >
      <div className="pos-inv-card-media">
        {item.image_url ? (
          <img src={item.image_url} alt="" loading="eager" decoding="async" />
        ) : (
          <span className="pos-inv-card-placeholder" aria-hidden="true" />
        )}
        {low ? (
          <span className="pos-badge off pos-inv-card-badge">Low stock</span>
        ) : (
          <span className="pos-badge ok pos-inv-card-badge">OK</span>
        )}
      </div>
      <div className="pos-inv-card-body">
        <strong>{item.name}</strong>
        <span className="pos-product-meta">
          {formatQty(item.quantity)} {item.unit} in stock
        </span>
        {per > 0 && (
          <span className="pos-product-meta">
            Per serving {formatQty(per)} {item.unit}
            {(() => {
              const note = String(item.serving_note || '').trim();
              if (!note) return '';
              const qtyLabel = `${formatQty(per)} ${item.unit}`.toLowerCase().replace(/\s+/g, '');
              const noteNorm = note.toLowerCase().replace(/\s+/g, '');
              if (noteNorm === qtyLabel || noteNorm === String(per)) return '';
              return ` · ${note}`;
            })()}
          </span>
        )}
        <span className="pos-inv-card-cost">
          {Number(item.cost_per_unit) > 0 && per > 0
            ? `${formatUnitCost(Number(item.cost_per_unit) * per)} / serving`
            : Number(item.cost_per_unit) > 0
              ? `${formatUnitCost(item.cost_per_unit)} / ${item.unit}`
              : 'No cost set'}
        </span>
      </div>
    </article>
  );
}

export default function InventoryPage() {
  const [items, setItems] = useState([]);
  const [moves, setMoves] = useState([]);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);
  const [toast, setToast] = useState(null);
  const [view, setView] = useState('cards');
  const [stationFilter, setStationFilter] = useState('all');
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

  const filtered = useMemo(() => {
    if (stationFilter === 'all') return items;
    return items.filter((i) => normalizeStation(i.station) === stationFilter);
  }, [items, stationFilter]);

  const grouped = useMemo(() => {
    return STATIONS.map((s) => ({
      id: s.id,
      label: s.label,
      items: filtered.filter((i) => normalizeStation(i.station) === s.id),
    })).filter((g) => g.items.length > 0);
  }, [filtered]);

  return (
    <div>
      <div className="pos-page-head">
        <div>
          <h1>Inventory</h1>
        </div>
        <button type="button" className="pos-btn primary" onClick={() => setEditing({})}>
          + Add item
        </button>
      </div>
      {error && <div className="pos-alert error">{error}</div>}

      <div className="pos-inv-toolbar">
        <div className="pos-segment" role="tablist" aria-label="Station">
          <button
            type="button"
            role="tab"
            className={stationFilter === 'all' ? 'active' : ''}
            aria-selected={stationFilter === 'all'}
            onClick={() => setStationFilter('all')}
          >
            All
          </button>
          {STATIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              className={stationFilter === s.id ? 'active' : ''}
              aria-selected={stationFilter === s.id}
              onClick={() => setStationFilter(s.id)}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="pos-segment" role="tablist" aria-label="View">
          <button
            type="button"
            role="tab"
            className={view === 'cards' ? 'active' : ''}
            aria-selected={view === 'cards'}
            onClick={() => setView('cards')}
          >
            Cards
          </button>
          <button
            type="button"
            role="tab"
            className={view === 'list' ? 'active' : ''}
            aria-selected={view === 'list'}
            onClick={() => setView('list')}
          >
            List
          </button>
        </div>
      </div>

      {view === 'cards' ? (
        grouped.map((g) => (
          <section key={g.id} className="pos-inv-station">
            <h2 className="pos-inv-station-title">{g.label}</h2>
            <div className="pos-inv-grid">
              {g.items.map((i) => (
                <InventoryCard key={i.id} item={i} onEdit={setEditing} />
              ))}
            </div>
          </section>
        ))
      ) : (
        <div className="pos-card" style={{ overflowX: 'auto', marginBottom: '0.85rem' }}>
          <table className="pos-table stack">
            <thead>
              <tr>
                <th>Item</th>
                <th>Station</th>
                <th>In stock</th>
                <th>Alert at</th>
                <th>Per serving</th>
                <th>Cost / serving</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((i) => {
                const low = Number(i.quantity) <= Number(i.min_threshold);
                const per = Number(i.use_per_serving) || 0;
                return (
                  <tr key={i.id}>
                    <td className="pos-cell-title">
                      <strong>{i.name}</strong>
                    </td>
                    <td data-label="Station">
                      {stationLabel(i.station)}
                    </td>
                    <td data-label="In stock">
                      {formatQty(i.quantity)} {i.unit}
                    </td>
                    <td data-label="Alert at">
                      {formatQty(i.min_threshold)} {i.unit}
                    </td>
                    <td data-label="Per serving">
                      {per > 0 ? (
                        <>
                          {formatQty(per)} {i.unit}
                          {(() => {
                            const note = String(i.serving_note || '').trim();
                            if (!note) return null;
                            const qtyLabel = `${formatQty(per)} ${i.unit}`
                              .toLowerCase()
                              .replace(/\s+/g, '');
                            const noteNorm = note.toLowerCase().replace(/\s+/g, '');
                            if (noteNorm === qtyLabel || noteNorm === String(per)) return null;
                            return <div className="pos-product-meta">{note}</div>;
                          })()}
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td data-label="Cost / serving">
                      {Number(i.cost_per_unit) > 0 && Number(i.use_per_serving) > 0
                        ? formatUnitCost(Number(i.cost_per_unit) * Number(i.use_per_serving))
                        : Number(i.cost_per_unit) > 0
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
              {!filtered.length && (
                <tr>
                  <td colSpan={8}>No inventory items yet. Add your ingredients first.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {!filtered.length && view === 'cards' && (
        <div className="pos-card">No inventory items yet. Add your ingredients first.</div>
      )}

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
