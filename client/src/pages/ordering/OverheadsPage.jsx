import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../api';
import { formatMoney } from '../../context/CartContext';
import Toast from '../../components/Toast';
import { BarList } from '../../components/ReportCharts';
import { businessDateKey, parseDateKey } from '../../lib/performance';
import {
  EXPENSE_CATEGORIES,
  EXPENSE_KINDS,
  categoryLabel,
  kindLabel,
  overheadByDate,
} from '../../lib/overhead';

const PRESETS = [
  { name: 'Shop rent', category: 'rent', kind: 'recurring' },
  { name: 'Electricity bill', category: 'electricity', kind: 'month' },
  { name: 'Water bill', category: 'water', kind: 'month' },
  { name: 'Internet', category: 'internet', kind: 'recurring' },
];

function monthLabel(ym) {
  return parseDateKey(`${ym}-01`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

function shortMonth(ym) {
  return parseDateKey(`${ym}-01`).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
}

function shiftMonth(ym, delta) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function lastDay(ym) {
  const [y, m] = ym.split('-').map(Number);
  return `${ym}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
}

function whenLabel(e) {
  const start = String(e.start_date);
  if (e.kind === 'one_off') {
    return parseDateKey(start).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  if (e.kind === 'month') return shortMonth(start.slice(0, 7));
  const end = e.end_date ? ` to ${shortMonth(String(e.end_date).slice(0, 7))}` : ' onwards';
  return `From ${shortMonth(start.slice(0, 7))}${end}`;
}

function ExpenseModal({ expense, defaultMonth, onClose, onSaved }) {
  const isNew = !expense.id;
  const [form, setForm] = useState(() => ({
    name: expense.name || '',
    category: expense.category || 'rent',
    kind: expense.kind || 'recurring',
    amount: expense.amount != null ? String(expense.amount) : '',
    month: expense.start_date ? String(expense.start_date).slice(0, 7) : defaultMonth,
    endMonth: expense.end_date ? String(expense.end_date).slice(0, 7) : '',
    date: expense.start_date ? String(expense.start_date) : `${defaultMonth}-01`,
    note: expense.note || '',
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const payload = {
        name: form.name,
        category: form.category,
        kind: form.kind,
        amount: Number(form.amount),
        start_date: form.kind === 'one_off' ? form.date : `${form.month}-01`,
        end_date: form.kind === 'recurring' && form.endMonth ? lastDay(form.endMonth) : null,
        note: form.note,
      };
      if (isNew) await api.posCreateExpense(payload);
      else await api.posUpdateExpense(expense.id, payload);
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
        <h2>{isNew ? 'Add overhead' : `Edit ${expense.name}`}</h2>
        {error && <div className="pos-alert error">{error}</div>}

        <div className="pos-kind-options" role="radiogroup" aria-label="Type">
          {EXPENSE_KINDS.map((k) => (
            <button
              key={k.value}
              type="button"
              role="radio"
              aria-checked={form.kind === k.value}
              className={form.kind === k.value ? 'active' : ''}
              onClick={() => set({ kind: k.value })}
            >
              <strong>{k.label}</strong>
              <span>{k.hint}</span>
            </button>
          ))}
        </div>

        <div className="pos-form-grid" style={{ marginTop: '0.85rem' }}>
          <label className="pos-field full">
            <span>Name</span>
            <input
              className="pos-input"
              required
              placeholder="e.g. Shop rent"
              value={form.name}
              onChange={(e) => set({ name: e.target.value })}
            />
          </label>
          <label className="pos-field">
            <span>Category</span>
            <select
              className="pos-select"
              value={form.category}
              onChange={(e) => set({ category: e.target.value })}
            >
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="pos-field">
            <span>{form.kind === 'one_off' ? 'Amount (RM)' : 'Amount per month (RM)'}</span>
            <input
              className="pos-input"
              type="number"
              min="0"
              step="0.01"
              required
              value={form.amount}
              onChange={(e) => set({ amount: e.target.value })}
            />
          </label>

          {form.kind === 'one_off' ? (
            <label className="pos-field full">
              <span>Date</span>
              <input
                className="pos-input"
                type="date"
                required
                value={form.date}
                onChange={(e) => set({ date: e.target.value })}
              />
            </label>
          ) : (
            <>
              <label className="pos-field">
                <span>{form.kind === 'month' ? 'Bill month' : 'Start month'}</span>
                <input
                  className="pos-input"
                  type="month"
                  required
                  value={form.month}
                  onChange={(e) => set({ month: e.target.value })}
                />
              </label>
              {form.kind === 'recurring' && (
                <label className="pos-field">
                  <span>End month (optional)</span>
                  <input
                    className="pos-input"
                    type="month"
                    min={form.month}
                    value={form.endMonth}
                    onChange={(e) => set({ endMonth: e.target.value })}
                  />
                </label>
              )}
            </>
          )}

          <label className="pos-field full">
            <span>Note (optional)</span>
            <input
              className="pos-input"
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

export default function OverheadsPage() {
  const todayKey = businessDateKey(new Date().toISOString());
  const [month, setMonth] = useState(todayKey.slice(0, 7));
  const [expenses, setExpenses] = useState([]);
  const [currency, setCurrency] = useState('MYR');
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [toast, setToast] = useState(null);
  const [error, setError] = useState('');
  const clearToast = useCallback(() => setToast(null), []);

  const load = useCallback(async () => {
    try {
      const [list, settings] = await Promise.all([api.posGetExpenses(), api.posGetSettings()]);
      setExpenses(list || []);
      setCurrency(settings?.currency || 'MYR');
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const monthTotals = useMemo(
    () => overheadByDate(expenses, `${month}-01`, lastDay(month)),
    [expenses, month]
  );

  const monthShare = useCallback(
    (e) => overheadByDate([e], `${month}-01`, lastDay(month)).total,
    [month]
  );

  const days = Number(lastDay(month).slice(-2));

  async function remove(e) {
    if (!window.confirm(`Delete ${e.name}?`)) return;
    try {
      await api.posDeleteExpense(e.id);
      setToast({ tone: 'ok', text: `${e.name} deleted` });
      await load();
    } catch (err) {
      setToast({ tone: 'error', text: err.message });
    }
  }

  return (
    <div>
      <div className="pos-page-head">
        <div>
          <h1>Overheads</h1>
          <p>Rent, electricity, water and other running costs. Reports subtract these from profit.</p>
        </div>
        <button type="button" className="pos-btn primary" onClick={() => setEditing({})}>
          + Add overhead
        </button>
      </div>

      {error && <div className="pos-alert error">{error}</div>}

      <div className="pos-report-bar">
        <p className="pos-meta">Overheads for {monthLabel(month)}</p>
        <div className="pos-day-nav">
          <button
            type="button"
            className="pos-btn ghost"
            aria-label="Previous month"
            onClick={() => setMonth(shiftMonth(month, -1))}
          >
            ←
          </button>
          <strong className="pos-period-label">{monthLabel(month)}</strong>
          <button
            type="button"
            className="pos-btn ghost"
            aria-label="Next month"
            onClick={() => setMonth(shiftMonth(month, 1))}
          >
            →
          </button>
        </div>
      </div>

      <div className="pos-split" style={{ marginBottom: '0.85rem' }}>
        <div className="pos-card">
          <div className="pos-grid-stats" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', marginBottom: '0.85rem' }}>
            <div className="pos-stat">
              <span>Total this month</span>
              <strong>{formatMoney(monthTotals.total, currency)}</strong>
            </div>
            <div className="pos-stat">
              <span>Per day</span>
              <strong>{formatMoney(monthTotals.total / days, currency)}</strong>
            </div>
          </div>
          <p className="pos-meta">
            Your café needs about <strong>{formatMoney(monthTotals.total / days, currency)}</strong>{' '}
            gross profit every day just to cover overheads, before salary.
          </p>
        </div>
        <div className="pos-card">
          <h2 className="pos-card-title">By category</h2>
          {Object.keys(monthTotals.byCategory).length ? (
            <BarList
              rows={Object.entries(monthTotals.byCategory)
                .sort((a, b) => b[1] - a[1])
                .map(([cat, amount]) => ({
                  key: cat,
                  label: categoryLabel(cat),
                  value: amount,
                  display: formatMoney(amount, currency),
                }))}
            />
          ) : (
            <p className="pos-meta">Nothing recorded for this month.</p>
          )}
        </div>
      </div>

      {!loading && !expenses.length && !error && (
        <div className="pos-card" style={{ marginBottom: '0.85rem' }}>
          <h2 className="pos-card-title">Quick start</h2>
          <p className="pos-meta" style={{ marginBottom: '0.6rem' }}>
            Add your usual running costs:
          </p>
          <div className="pos-filters" style={{ marginBottom: 0 }}>
            {PRESETS.map((p) => (
              <button
                key={p.name}
                type="button"
                className="pos-btn ghost"
                onClick={() => setEditing({ ...p, start_date: `${month}-01` })}
              >
                + {p.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="pos-card" style={{ overflowX: 'auto' }}>
        <h2 className="pos-card-title">All overheads</h2>
        <table className="pos-table stack">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>When</th>
              <th>Amount</th>
              <th>{shortMonth(month)}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {expenses.map((e) => {
              const share = monthShare(e);
              return (
                <tr key={e.id} className={share ? '' : 'pos-row-muted'}>
                  <td className="pos-cell-title">
                    <strong>{e.name}</strong>
                    <div className="pos-product-meta">
                      {categoryLabel(e.category)}
                      {e.note ? ` · ${e.note}` : ''}
                    </div>
                  </td>
                  <td data-label="Type">{kindLabel(e.kind)}</td>
                  <td data-label="When">{whenLabel(e)}</td>
                  <td data-label="Amount">
                    {formatMoney(e.amount, currency)}
                    {e.kind !== 'one_off' ? ' / month' : ''}
                  </td>
                  <td data-label={shortMonth(month)}>{share ? formatMoney(share, currency) : '—'}</td>
                  <td className="pos-cell-action">
                    <div className="pos-row-actions">
                      <button type="button" className="pos-btn ghost" onClick={() => setEditing(e)}>
                        Edit
                      </button>
                      <button type="button" className="pos-btn ghost" onClick={() => remove(e)}>
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!loading && !expenses.length && (
              <tr>
                <td colSpan={6}>No overheads yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <ExpenseModal
          expense={editing}
          defaultMonth={month}
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
