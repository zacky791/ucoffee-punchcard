import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { formatMoney } from '../../context/CartContext';
import Toast from '../../components/Toast';
import IngredientRows, {
  ingredientCost,
  toIngredientPayload,
  toIngredientRows,
} from '../../components/IngredientRows';
import { kindOf } from '../../lib/menuKind';
import { formatUnitCost } from './InventoryPage';

function stationOf(product) {
  return kindOf(product) === 'food' ? 'kitchen' : 'barista';
}

function marginTone(margin) {
  if (margin == null) return '';
  if (margin >= 60) return 'good';
  if (margin >= 30) return 'mid';
  return 'low';
}

function Margin({ value }) {
  if (value == null) return <span className="pos-margin">—</span>;
  return <span className={`pos-margin ${marginTone(value)}`}>{value.toFixed(1)}%</span>;
}

function CostingModal({ product, inventory, currency, onClose, onSaved }) {
  const [rows, setRows] = useState(() => toIngredientRows(product.ingredients));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const byId = useMemo(() => Object.fromEntries(inventory.map((i) => [i.id, i])), [inventory]);
  const price = Number(product.base_price);
  const recipeCost = ingredientCost(rows, byId);
  const totalCost = recipeCost;
  const profit = price - totalCost;
  const margin = price > 0 ? (profit / price) * 100 : null;

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.posSaveCosting(product.id, {
        extra_cost: 0,
        ingredients: toIngredientPayload(rows),
      });
      onSaved(`${product.name} cost saved`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function clearCost() {
    if (!window.confirm(`Clear cost for ${product.name}? The recipe will be removed.`)) return;
    setBusy(true);
    setError('');
    try {
      await api.posSaveCosting(product.id, {
        extra_cost: 0,
        ingredients: [],
      });
      onSaved(`${product.name} cost cleared`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const hasSavedCost =
    Number(product.total_cost) > 0 || (product.ingredients && product.ingredients.length > 0);

  return (
    <div className="pos-modal-backdrop" onClick={busy ? undefined : onClose}>
      <form className="pos-modal wide" onClick={(e) => e.stopPropagation()} onSubmit={save}>
        <h2>{product.name}</h2>
        <p className="hint">
          Selling price {formatMoney(price, currency)}. The recipe below is deducted from
          inventory on every sale.
        </p>
        {error && <div className="pos-alert error">{error}</div>}

        <h3 className="pos-costing-title">Recipe (per 1 item sold)</h3>
        {!inventory.length && (
          <div className="pos-alert warn">
            No inventory items yet. <Link to="/ordering/inventory">Add ingredients</Link> first.
          </div>
        )}
        <IngredientRows
          rows={rows}
          onChange={setRows}
          inventory={inventory}
          byId={byId}
          currency={currency}
        />

        <div className="pos-totals" style={{ marginTop: '0.9rem' }}>
          <div>
            <span>Ingredient cost</span>
            <span>{formatUnitCost(recipeCost, currency)}</span>
          </div>
          <div>
            <span>Total cost</span>
            <span>{formatMoney(totalCost, currency)}</span>
          </div>
          <div className="grand">
            <span>Profit</span>
            <span className={profit < 0 ? 'pos-neg' : ''}>{formatMoney(profit, currency)}</span>
          </div>
          <div>
            <span>Margin</span>
            <Margin value={margin} />
          </div>
        </div>

        <div className="pos-modal-actions">
          {hasSavedCost && (
            <button
              type="button"
              className="pos-btn danger"
              style={{ marginRight: 'auto' }}
              disabled={busy}
              onClick={clearCost}
            >
              Delete cost
            </button>
          )}
          <button type="button" className="pos-btn ghost" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="pos-btn primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save cost'}
          </button>
        </div>
      </form>
    </div>
  );
}

function CostingTable({ products, currency, onEdit }) {
  if (!products.length) {
    return <p className="pos-meta">No products in this station.</p>;
  }

  return (
    <table className="pos-table stack">
      <thead>
        <tr>
          <th>Product</th>
          <th>Price</th>
          <th>Cost</th>
          <th>Profit</th>
          <th>Margin</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {products.map((p) => {
          const hasCost = Number(p.total_cost) > 0;
          return (
            <tr
              key={p.id}
              className="pos-row-link"
              tabIndex={0}
              role="button"
              onClick={() => onEdit(p)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onEdit(p);
                }
              }}
            >
              <td className="pos-cell-title">
                <strong>{p.name}</strong>
                <div className="pos-product-meta">
                  {p.category?.name || 'No category'}
                  {p.ingredients.length
                    ? ` · ${p.ingredients.length} ingredient(s)`
                    : ' · no recipe'}
                </div>
              </td>
              <td data-label="Price">{formatMoney(p.base_price, currency)}</td>
              <td data-label="Cost">
                {hasCost ? (
                  formatMoney(p.total_cost, currency)
                ) : (
                  <span className="pos-badge off">Not set</span>
                )}
              </td>
              <td data-label="Profit">
                <span className={p.profit < 0 ? 'pos-neg' : ''}>
                  {formatMoney(p.profit, currency)}
                </span>
              </td>
              <td data-label="Margin">
                <Margin value={p.margin} />
              </td>
              <td className="pos-cell-action">
                <button
                  type="button"
                  className="pos-btn ghost"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit(p);
                  }}
                >
                  {hasCost ? 'Edit cost' : 'Set cost'}
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export default function MarginProductPage() {
  const [products, setProducts] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [currency, setCurrency] = useState('MYR');
  const [editing, setEditing] = useState(null);
  const [toast, setToast] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [station, setStation] = useState('barista');
  const clearToast = useCallback(() => setToast(null), []);

  const loadCosting = useCallback(async () => {
    setLoading(true);
    try {
      const [costing, inv, settings] = await Promise.all([
        api.posGetCosting(),
        api.posGetInventory(),
        api.posGetSettings(),
      ]);
      setProducts(costing || []);
      setInventory((inv || []).filter((i) => i.active !== false));
      setCurrency(settings?.currency || 'MYR');
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCosting();
  }, [loadCosting]);

  const counts = useMemo(() => {
    const c = { barista: 0, kitchen: 0 };
    for (const p of products) c[stationOf(p)] += 1;
    return c;
  }, [products]);

  const filtered = useMemo(
    () => products.filter((p) => stationOf(p) === station),
    [products, station]
  );

  const unset = filtered.filter((p) => !Number(p.total_cost)).length;

  return (
    <div>
      <div className="pos-page-head">
        <div>
          <h1>Margin product</h1>
        </div>
      </div>

      {error && <div className="pos-alert error">{error}</div>}

      <div className="pos-inv-toolbar">
        <div className="pos-segment" role="tablist" aria-label="Station">
          {[
            ['barista', 'Barista'],
            ['kitchen', 'Kitchen'],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              className={station === value ? 'active' : ''}
              aria-selected={station === value}
              onClick={() => setStation(value)}
            >
              {label} <span>{counts[value]}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="pos-card" style={{ overflowX: 'auto', marginBottom: '0.85rem' }}>
        <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>
          {station === 'barista' ? 'Barista' : 'Kitchen'} costing
        </h2>
        {unset > 0 && (
          <p className="pos-meta" style={{ marginBottom: '0.6rem' }}>
            {unset} item(s) have no cost yet, so they show 100% margin. Tap Set cost to add
            the recipe.
          </p>
        )}
        {loading ? (
          <p className="pos-meta">Loading…</p>
        ) : (
          <CostingTable products={filtered} currency={currency} onEdit={setEditing} />
        )}
      </div>

      {editing && (
        <CostingModal
          product={editing}
          inventory={inventory}
          currency={currency}
          onClose={() => setEditing(null)}
          onSaved={async (text) => {
            setEditing(null);
            setToast({ tone: 'ok', text });
            await loadCosting();
          }}
        />
      )}
      <Toast toast={toast} onDone={clearToast} />
    </div>
  );
}
