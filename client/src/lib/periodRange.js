import { useCallback, useMemo, useState } from 'react';
import {
  addDays,
  formatWeekRange,
  parseDateKey,
  startOfWeek,
} from './performance';

export function lastDayOfMonth(ym) {
  const [y, m] = ym.split('-').map(Number);
  return `${ym}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
}

export function shiftMonthKey(ym, delta) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function clampToToday(key, today) {
  return key > today ? today : key;
}

export function weekBounds(monday, today) {
  return { from: monday, to: clampToToday(addDays(monday, 6), today) };
}

export function monthBounds(ym, today) {
  return { from: `${ym}-01`, to: clampToToday(lastDayOfMonth(ym), today) };
}

export function dayName(key, today) {
  if (key === today) return 'Today';
  if (key === addDays(today, -1)) return 'Yesterday';
  return parseDateKey(key).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

export function rangeLabel(from, to, today, mode) {
  if (mode === 'week') return formatWeekRange(from);
  if (mode === 'month') {
    return parseDateKey(from).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  }
  if (from === to) return dayName(from, today);
  const a = parseDateKey(from).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
  });
  const b = parseDateKey(to).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: from.slice(0, 4) === to.slice(0, 4) ? undefined : 'numeric',
  });
  return `${a} – ${b}`;
}

const PRESETS = [
  { id: 'day', label: 'Today' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
  { id: 'custom', label: 'Custom' },
];

/**
 * Shared Today / Week / Month / Custom range state for Profit, Dashboard, Orders, etc.
 * @param {string} today YYYY-MM-DD business date
 * @param {{ initialMode?: string, initialFrom?: string, initialTo?: string }} [opts]
 */
export function usePeriodRange(today, opts = {}) {
  const initialMode = opts.initialMode || 'day';
  const seeded =
    initialMode === 'week'
      ? weekBounds(opts.initialFrom || startOfWeek(parseDateKey(today)), today)
      : initialMode === 'month'
        ? monthBounds(opts.initialFrom || today.slice(0, 7), today)
        : { from: opts.initialFrom || today, to: opts.initialTo || today };
  const [mode, setMode] = useState(initialMode);
  const [from, setFrom] = useState(seeded.from);
  const [to, setTo] = useState(seeded.to);

  const applyWeek = useCallback(
    (monday = startOfWeek(parseDateKey(today))) => {
      const bounds = weekBounds(monday, today);
      if (bounds.from > today) return;
      setMode('week');
      setFrom(bounds.from);
      setTo(bounds.to);
    },
    [today]
  );

  const applyMonth = useCallback(
    (ym = today.slice(0, 7)) => {
      const bounds = monthBounds(ym, today);
      if (bounds.from > today) return;
      setMode('month');
      setFrom(bounds.from);
      setTo(bounds.to);
    },
    [today]
  );

  const applyDay = useCallback(() => {
    setMode('day');
    setFrom(today);
    setTo(today);
  }, [today]);

  const applyCustom = useCallback(() => {
    setMode('custom');
  }, []);

  const shiftRange = useCallback(
    (delta) => {
      if (mode === 'week') {
        applyWeek(addDays(from, 7 * delta));
        return;
      }
      if (mode === 'month') {
        applyMonth(shiftMonthKey(from.slice(0, 7), delta));
        return;
      }
      if (mode === 'day') {
        const next = addDays(from, delta);
        if (next > today) return;
        setFrom(next);
        setTo(next);
        return;
      }
      const span = Math.round((parseDateKey(to) - parseDateKey(from)) / 86400000);
      const nextTo = addDays(to, delta);
      if (nextTo > today) return;
      const cappedTo = clampToToday(nextTo, today);
      setTo(cappedTo);
      setFrom(addDays(cappedTo, -span));
    },
    [mode, from, to, today, applyWeek, applyMonth]
  );

  const setFromDate = useCallback(
    (value) => {
      setMode('custom');
      setFrom(value);
      if (value > to) setTo(value);
    },
    [to]
  );

  const setToDate = useCallback(
    (value) => {
      setMode('custom');
      setTo(value);
      if (value < from) setFrom(value);
    },
    [from]
  );

  const pickers = useMemo(
    () => ({
      day: applyDay,
      week: () => applyWeek(),
      month: () => applyMonth(),
      custom: applyCustom,
    }),
    [applyDay, applyWeek, applyMonth, applyCustom]
  );

  return {
    mode,
    from,
    to,
    setFrom,
    setTo,
    setMode,
    presets: PRESETS,
    pickers,
    shiftRange,
    setFromDate,
    setToDate,
    canGoForward: to < today,
    label: rangeLabel(from, to, today, mode),
    showCustom: mode === 'custom',
  };
}
