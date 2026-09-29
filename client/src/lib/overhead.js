import { api } from '../api';
import { addDays } from './performance';

export const EXPENSE_CATEGORIES = [
  { value: 'rent', label: 'Rent' },
  { value: 'electricity', label: 'Electricity' },
  { value: 'water', label: 'Water' },
  { value: 'internet', label: 'Internet / phone' },
  { value: 'gas', label: 'Gas' },
  { value: 'maintenance', label: 'Maintenance / repair' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'other', label: 'Other' },
];

export const EXPENSE_KINDS = [
  { value: 'recurring', label: 'Every month', hint: 'Same amount every month, e.g. rent, internet' },
  { value: 'month', label: 'Bill for one month', hint: 'Changes each month, e.g. electricity, water' },
  { value: 'one_off', label: 'One-off', hint: 'Single cost on a date, e.g. repair' },
];

export const categoryLabel = (v) => EXPENSE_CATEGORIES.find((c) => c.value === v)?.label || 'Other';
export const kindLabel = (v) => EXPENSE_KINDS.find((k) => k.value === v)?.label || v;

function daysInMonth(ym) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

/** Overheads can't load before pos-overheads.sql is run; reports treat that as none. */
export async function loadExpenses() {
  try {
    return { expenses: await api.posGetExpenses(), error: null };
  } catch (err) {
    return { expenses: [], error: err.message };
  }
}

/**
 * Spread overheads over business dates [fromKey, toKey]:
 * monthly amounts are split evenly across that month's days, one-offs land on their date.
 */
export function overheadByDate(expenses, fromKey, toKey) {
  const byDate = {};
  const byCategory = {};
  let total = 0;
  if (!fromKey || !toKey || fromKey > toKey) return { byDate, byCategory, total };

  for (let key = fromKey; key <= toKey; key = addDays(key, 1)) {
    const ym = key.slice(0, 7);
    const dim = daysInMonth(ym);
    let day = 0;
    for (const e of expenses || []) {
      const start = String(e.start_date);
      let share = 0;
      if (e.kind === 'recurring') {
        const endYm = e.end_date ? String(e.end_date).slice(0, 7) : null;
        if (ym >= start.slice(0, 7) && (!endYm || ym <= endYm)) share = Number(e.amount) / dim;
      } else if (e.kind === 'month') {
        if (start.slice(0, 7) === ym) share = Number(e.amount) / dim;
      } else if (start === key) {
        share = Number(e.amount);
      }
      if (share) {
        day += share;
        byCategory[e.category] = (byCategory[e.category] || 0) + share;
      }
    }
    if (day) byDate[key] = day;
    total += day;
  }

  const round = (n) => Math.round(n * 100) / 100;
  return {
    byDate: Object.fromEntries(Object.entries(byDate).map(([k, v]) => [k, round(v)])),
    byCategory: Object.fromEntries(Object.entries(byCategory).map(([k, v]) => [k, round(v)])),
    total: round(total),
  };
}
