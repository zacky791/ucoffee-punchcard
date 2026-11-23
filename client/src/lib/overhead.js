import { api } from '../api';
import { addDays, parseDateKey } from './performance';

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

/** Weekday set marked closed in cafe hours. Empty hours → Monday closed (cafe default). */
export function closedWeekdaysFromHours(hours) {
  if (hours && hours.length) {
    return new Set(
      hours.filter((h) => h.is_closed).map((h) => Number(h.day_of_week))
    );
  }
  return new Set([1]); // Monday
}

export function isOpenDateKey(dateKey, closedWeekdays) {
  if (!closedWeekdays || closedWeekdays.size === 0) return true;
  return !closedWeekdays.has(parseDateKey(dateKey).getDay());
}

/** Open days in a YYYY-MM month (at least 1 so monthly ÷ never blows up). */
export function openDaysInMonth(ym, closedWeekdays) {
  const dim = daysInMonth(ym);
  if (!closedWeekdays || closedWeekdays.size === 0) return dim;
  let n = 0;
  for (let d = 1; d <= dim; d++) {
    const key = `${ym}-${String(d).padStart(2, '0')}`;
    if (isOpenDateKey(key, closedWeekdays)) n += 1;
  }
  return Math.max(1, n);
}

/** Overheads can't load before pos-overheads.sql is run; reports treat that as none. */
export async function loadExpenses() {
  try {
    return { expenses: await api.posGetExpenses(), error: null };
  } catch (err) {
    return { expenses: [], error: err.message };
  }
}

/** Electric / water stay day-spread; rent, wifi, etc. can be charged as full months. */
function isVariableUtility(e) {
  return e.category === 'electricity' || e.category === 'water';
}

function bumpExpense(byCategory, byExpense, e, share) {
  byCategory[e.category] = (byCategory[e.category] || 0) + share;
  const id = e.id || e.name;
  const row = (byExpense[id] ||= {
    id,
    name: e.name,
    category: e.category,
    kind: e.kind,
    amount: Number(e.amount) || 0,
    total: 0,
  });
  row.total += share;
}

/**
 * Spread overheads over open dates in [fromKey, toKey]:
 * monthly amounts ÷ open days in that month; closed weekdays get no rent/utilities;
 * one-offs still land on their date even if closed.
 *
 * opts.fixedMonthly: for Month view, charge full rent / fixed bills (not electric/water)
 * once per calendar month instead of spreading per open day.
 */
export function overheadByDate(expenses, fromKey, toKey, closedWeekdays = null, opts = {}) {
  const byDate = {};
  const byCategory = {};
  const byExpense = {};
  let total = 0;
  let days = 0;
  if (!fromKey || !toKey || fromKey > toKey) {
    return { byDate, byCategory, byExpense, total, days, perDay: 0 };
  }

  const fixedMonthly = Boolean(opts.fixedMonthly);
  const openDimCache = {};
  const openDim = (ym) => {
    if (openDimCache[ym] == null) openDimCache[ym] = openDaysInMonth(ym, closedWeekdays);
    return openDimCache[ym];
  };

  if (fixedMonthly) {
    const months = new Set();
    for (let key = fromKey; key <= toKey; key = addDays(key, 1)) {
      months.add(key.slice(0, 7));
      if (isOpenDateKey(key, closedWeekdays)) days += 1;
    }
    for (const ym of months) {
      for (const e of expenses || []) {
        if (isVariableUtility(e) || e.kind === 'one_off') continue;
        const start = String(e.start_date);
        let amount = 0;
        if (e.kind === 'recurring') {
          const endYm = e.end_date ? String(e.end_date).slice(0, 7) : null;
          if (ym >= start.slice(0, 7) && (!endYm || ym <= endYm)) amount = Number(e.amount) || 0;
        } else if (e.kind === 'month' && start.slice(0, 7) === ym) {
          amount = Number(e.amount) || 0;
        }
        if (amount) {
          total += amount;
          bumpExpense(byCategory, byExpense, e, amount);
        }
      }
    }
  }

  for (let key = fromKey; key <= toKey; key = addDays(key, 1)) {
    const open = isOpenDateKey(key, closedWeekdays);
    if (!fixedMonthly && open) days += 1;
    const ym = key.slice(0, 7);
    const dim = openDim(ym);
    let day = 0;
    for (const e of expenses || []) {
      // Month view: fixed bills already counted in full above.
      if (fixedMonthly && !isVariableUtility(e) && e.kind !== 'one_off') continue;
      const start = String(e.start_date);
      let share = 0;
      if (e.kind === 'recurring') {
        if (!open) continue;
        const endYm = e.end_date ? String(e.end_date).slice(0, 7) : null;
        if (ym >= start.slice(0, 7) && (!endYm || ym <= endYm)) share = Number(e.amount) / dim;
      } else if (e.kind === 'month') {
        if (!open) continue;
        if (start.slice(0, 7) === ym) share = Number(e.amount) / dim;
      } else if (start === key) {
        share = Number(e.amount);
      }
      if (share) {
        day += share;
        total += share;
        bumpExpense(byCategory, byExpense, e, share);
      }
    }
    if (day) byDate[key] = day;
  }

  const round = (n) => Math.round(n * 100) / 100;
  return {
    byDate: Object.fromEntries(Object.entries(byDate).map(([k, v]) => [k, round(v)])),
    byCategory: Object.fromEntries(Object.entries(byCategory).map(([k, v]) => [k, round(v)])),
    byExpense: Object.fromEntries(
      Object.entries(byExpense).map(([k, v]) => [k, { ...v, total: round(v.total) }])
    ),
    total: round(total),
    days,
    perDay: days > 0 ? round(total / days) : 0,
    fixedMonthly,
  };
}

/** Estimated monthly bill for open days only in the range (same as recurring overheads). */
export function monthlyEstimateForRange(monthlyAmount, fromKey, toKey, closedWeekdays = null) {
  if (!fromKey || !toKey || fromKey > toKey || !monthlyAmount) return 0;
  let total = 0;
  const openDimCache = {};
  for (let key = fromKey; key <= toKey; key = addDays(key, 1)) {
    if (!isOpenDateKey(key, closedWeekdays)) continue;
    const ym = key.slice(0, 7);
    if (openDimCache[ym] == null) openDimCache[ym] = openDaysInMonth(ym, closedWeekdays);
    total += monthlyAmount / openDimCache[ym];
  }
  return Math.round(total * 100) / 100;
}
