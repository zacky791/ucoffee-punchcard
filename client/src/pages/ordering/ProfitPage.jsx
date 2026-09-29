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
import { formatUnitCost } from './InventoryPage';

const PERIODS = [
  { value: 'daily', label: 'Today' },
  { value: 'weekly', label: 'Last 7 days' },
  { value: 'monthly', label: 'This month' },
];

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
  const [extraCost, setExtraCost] = useState(
    Number(product.extra_cost) ? String(product.extra_cost) : ''
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const byId = useMemo(() => Object.fromEntries(inventory.map((i) => [i.id, i])), [inventory]);
  const price = Number(product.base_price);
  const recipeCost = ingredientCost(rows, byId);
  const totalCost = recipeCost + (Number(extraCost) || 0);
  const profit = price - totalCost;
  const margin = price > 0 ? (profit / price) * 100 : null;

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.posSaveCosting(product.id, {
        extra_cost: Number(extraCost) || 0,
        ingredients: toIngredientPayload(rows),
      });
      onSaved(`${product.name} cost saved`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

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
            No inventory items yet. <Link to="/ordering/inventory">Add ingredients</Link> first,
            or just use "Other cost" below.
          </div>
        )}
        <IngredientRows
          rows={rows}
          onChange={setRows}
          inventory={inventory}
          byId={byId}
          currency={currency}
        />

        <label className="pos-field" style={{ marginTop: '0.9rem' }}>
          <span>Other cost per item (RM) – cup, lid, straw, packaging…</span>
          <input
            className="pos-input"
            type="number"
            min="0"
            step="0.01"
            value={extraCost}
            onChange={(e) => setExtraCost(e.target.value)}
          />
        </label>

        <div className="pos-totals" style={{ marginTop: '0.9rem' }}>
          <div>
            <span>Ingredient cost</span>
            <span>{formatUnitCost(recipeCost, currency)}</span>
          </div>
          <div>
            <span>Other cost</span>
            <span>{formatMoney(Number(extraCost) || 0, currency)}</span>
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

export default function ProfitPage() {
  const [period, setPeriod] = useState('daily');
  const [report, setReport] = useState(null);
  const [products, setProducts] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [currency, setCurrency] = useState('MYR');
  const [editing, setEditing] = useState(null);
  const [toast, setToast] = useState(null);
  const [error, setError] = useState('');
  const clearToast = useCallback(() => setToast(null), []);

  const loadCosting = useCallback(async () => {
    const [costing, inv, settings] = await Promise.all([
      api.posGetCosting(),
      api.posGetInventory(),
      api.posGetSettings(),
    ]);
    setProducts(costing || []);
    setInventory((inv || []).filter((i) => i.active !== false));
    setCurrency(settings?.currency || 'MYR');
  }, []);

  useEffect(() => {
    loadCosting().catch((err) => setError(err.message));
  }, [loadCosting]);

  useEffect(() => {
    let alive = true;
    api
      .posProfitReport({ period })
      .then((r) => alive && setReport(r))
      .catch((err) => alive && setError(err.message));
    return () => {
      alive = false;
    };
  }, [period]);

  const unset = products.filter((p) => !Number(p.total_cost)).length;

  return (
    <div>
      <div className="pos-page-head">
        <div>
          <h1>Profit</h1>
          <p>Enter costs to see profit (RM) and margin (%) per item and from real sales</p>
        </div>
        <select className="pos-select" value={period} onChange={(e) => setPeriod(e.target.value)}>
          {PERIODS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      {error && <div className="pos-alert error">{error}</div>}

      {report && (
        <>
          <div className="pos-grid-stats four">
            <div className="pos-card pos-stat">
              <span>Sales</span>
              <strong>{formatMoney(report.sales, currency)}</strong>
            </div>
            <div className="pos-card pos-stat">
              <span>Cost</span>
              <strong>{formatMoney(report.cost, currency)}</strong>
            </div>
            <div className="pos-card pos-stat">
              <span>Profit</span>
              <strong className={report.profit < 0 ? 'pos-neg' : ''}>
                {formatMoney(report.profit, currency)}
              </strong>
            </div>
            <div className="pos-card pos-stat">
              <span>Margin</span>
              <strong>
                <Margin value={report.margin} />
              </strong>
            </div>
          </div>
          {report.estimated_items > 0 && (
            <div className="pos-alert warn">
              {report.estimated_items} item(s) were sold before their cost was recorded, so
              today's cost is used for them.
            </div>
          )}
        </>
      )}

      <div className="pos-card" style={{ overflowX: 'auto', marginBottom: '0.85rem' }}>
        <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>Menu costing</h2>
        {unset > 0 && (
          <p className="pos-meta" style={{ marginBottom: '0.6rem' }}>
            {unset} item(s) have no cost yet, so they show 100% margin. Tap Set cost to add
            the recipe.
          </p>
        )}
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
                <tr key={p.id}>
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
                    {hasCost ? formatMoney(p.total_cost, currency) : <span className="pos-badge off">Not set</span>}
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
                    <button type="button" className="pos-btn ghost" onClick={() => setEditing(p)}>
                      {hasCost ? 'Edit cost' : 'Set cost'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {report && (
        <div className="pos-card" style={{ overflowX: 'auto' }}>
          <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>
            Sold – {PERIODS.find((p) => p.value === period)?.label.toLowerCase()}
          </h2>
          {report.products.length ? (
            <table className="pos-table stack">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Qty</th>
                  <th>Sales</th>
                  <th>Cost</th>
                  <th>Profit</th>
                  <th>Margin</th>
                </tr>
              </thead>
              <tbody>
                {report.products.map((p) => (
                  <tr key={p.product_name}>
                    <td className="pos-cell-title">
                      <strong>{p.product_name}</strong>
                    </td>
                    <td data-label="Qty">{p.quantity}</td>
                    <td data-label="Sales">{formatMoney(p.sales, currency)}</td>
                    <td data-label="Cost">{formatMoney(p.cost, currency)}</td>
                    <td data-label="Profit">
                      <span className={p.profit < 0 ? 'pos-neg' : ''}>
                        {formatMoney(p.profit, currency)}
                      </span>
                    </td>
                    <td data-label="Margin">
                      <Margin value={p.margin} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="pos-meta">No paid orders in this period.</p>
          )}
        </div>
      )}

      {editing && (
        <CostingModal
          product={editing}
          inventory={inventory}
          currency={currency}
          onClose={() => setEditing(null)}
          onSaved={async (text) => {
            setEditing(null);
            setToast({ tone: 'ok', text });
            await loadCosting().catch((err) => setError(err.message));
            api.posProfitReport({ period }).then(setReport).catch(() => {});
          }}
        />
      )}
      <Toast toast={toast} onDone={clearToast} />
    </div>
  );
}
