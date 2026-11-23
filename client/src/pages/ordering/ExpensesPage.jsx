import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../api';
import PeriodRangeNav, { PeriodCustomRange } from '../../components/PeriodRangeNav';
import { formatMoney } from '../../context/CartContext';
import Toast from '../../components/Toast';
import { businessDateKey } from '../../lib/performance';
import { usePeriodRange } from '../../lib/periodRange';
import { restockList } from '../../lib/restock';

function fmtQty(n) {
  return Number(n || 0).toLocaleString('en-MY', { maximumFractionDigits: 3 });
}

const round2 = (n) => Math.round(n * 100) / 100;

export default function ExpensesPage() {
  const today = businessDateKey(new Date().toISOString());
  const period = usePeriodRange(today);
  const {
    mode,
    from,
    to,
    label,
    canGoForward,
    showCustom,
    presets,
    pickers,
    shiftRange,
    setFromDate,
    setToDate,
  } = period;
  const navigate = useNavigate();
  const [purchases, setPurchases] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [currency, setCurrency] = useState('MYR');
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [error, setError] = useState('');
  const clearToast = useCallback(() => setToast(null), []);

  const load = useCallback(async () => {
    const [list, inv, settings] = await Promise.all([
      api.posGetPurchases({ from, to }).catch((err) => err),
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
  }, [from, to]);

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

  const singleDay = from === to;
  const isToday = singleDay && from === today;

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
        <p className="pos-meta">Bought · {label}</p>
        <PeriodRangeNav
          mode={mode}
          presets={presets}
          pickers={pickers}
          shiftRange={shiftRange}
          canGoForward={canGoForward}
        />
      </div>

      {showCustom && (
        <PeriodCustomRange
          from={from}
          to={to}
          today={today}
          setFromDate={setFromDate}
          setToDate={setToDate}
        />
      )}

      {error && <div className="pos-alert error">{error}</div>}

      <div className="pos-grid-stats">
        <div className="pos-card pos-stat">
          <span>{isToday ? 'Spent today' : singleDay ? 'Spent this day' : 'Spent in period'}</span>
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
                    purchase_date: to,
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
          {singleDay ? (isToday ? 'Today’s list' : 'Day list') : 'Period list'}
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
                <td colSpan={4}>Nothing recorded for this period.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Toast toast={toast} onDone={clearToast} />
    </div>
  );
}
