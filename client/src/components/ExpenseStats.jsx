import { formatMoney } from '../context/CartContext';

/** "Expenses" and "Sales vs expenses" stat boxes for the reports. */
export default function ExpenseStats({ sales, expenses, currency }) {
  const diff = Math.round((sales - expenses) * 100) / 100;
  const ratio = sales > 0 ? Math.round((expenses / sales) * 1000) / 10 : null;
  return (
    <>
      <div className="pos-card pos-stat">
        <span>Expenses</span>
        <strong>{formatMoney(expenses, currency)}</strong>
        <small className="pos-stat-sub">Bought (Expenses tab)</small>
      </div>
      <div className="pos-card pos-stat">
        <span>Sales vs expenses</span>
        <strong className={diff < 0 ? 'pos-neg' : 'pos-pos'}>
          {diff > 0 ? '+' : ''}
          {formatMoney(diff, currency)}
        </strong>
        <small className="pos-stat-sub">
          {expenses === 0
            ? 'No expenses recorded'
            : ratio == null
              ? 'No sales'
              : `Expenses = ${ratio.toFixed(1)}% of sales`}
        </small>
      </div>
    </>
  );
}
