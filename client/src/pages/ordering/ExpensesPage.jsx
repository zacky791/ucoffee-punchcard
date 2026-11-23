import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../api';
import { formatMoney } from '../../context/CartContext';
import Toast from '../../components/Toast';
import { addDays, businessDateKey, parseDateKey } from '../../lib/performance';
import { restockList } from '../../lib/restock';

function fmtQty(n) {
  return Number(n || 0).toLocaleString('en-MY', { maximumFractionDigits: 3 });
}

const round2 = (n) => Math.round(n * 100) / 100;

export default function ExpensesPage() {
  const today = businessDateKey(new Date().toISOString());
  const navigate = useNavigate();
  const [date, setDate] = useState(today);
  const [purchases, setPurchases] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [currency, setCurrency] = useState('MYR');
  const [loading, setLoading] = useState(true);
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
          ? 'Restock is not set up yet. Run supabase/pos-purchases.sql in the Supabase SQL Editor.'
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
    () =>
      round2(
        purchases.filter((p) => p.inventory_item_id).reduce((s, p) => s + Number(p.amount || 0), 0)
      ),
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

  function goAdd(purchase = {}) {
    navigate('/ordering/restock', { state: { purchase } });
  }

  return (
    <div>
      <div className="pos-page-head">
        <div>
          <h1>Restock Overview</h1>
        </div>
        <Link to="/ordering/restock" className="pos-btn primary">
          + Add restock
        </Link>
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
            aria-label="Restock date"
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
                  goAdd({
                    type: 'stock',
                    inventory_item_id: i.id,
                    ...(i.packs ? { packs: i.packs } : { quantity: i.need }),
                    ...(i.cost ? { amount: i.cost } : {}),
                    purchase_date: date,
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
          Today’s list
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
                    <button type="button" className="pos-btn ghost" onClick={() => goAdd(p)}>
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

      <Toast toast={toast} onDone={clearToast} />
    </div>
  );
}
