import { api } from '../api';
import { addDays, businessDayRange, pairShifts } from './performance';
import { hourlyRateRm } from './salary';

const CHUNK_DAYS = 28;

/** Punches + staff for business dates [fromKey, toKey], fetched in chunks the API accepts. */
export async function loadPunches(fromKey, toKey) {
  const chunks = [];
  for (let start = fromKey; start <= toKey; start = addDays(start, CHUNK_DAYS)) {
    const last = addDays(start, CHUNK_DAYS - 1) < toKey ? addDays(start, CHUNK_DAYS - 1) : toKey;
    chunks.push({ from: businessDayRange(start).from, to: businessDayRange(last).punchTo });
  }
  const results = await Promise.all(chunks.map((c) => api.getPerformance(c)));
  const seen = new Map();
  for (const r of results) for (const p of r.punches || []) seen.set(p.id, p);
  return { punches: [...seen.values()], staff: results[0]?.staff || [] };
}

/**
 * Salary per business date. Closed shifts are paid; a shift still open counts
 * hours so far; missed clock-outs are unpaid and reported.
 */
export function salaryByDate({ punches, staff }, fromKey, toKey, now = Date.now()) {
  const names = new Map((staff || []).map((s) => [s.id, s.name]));
  const byDate = {};
  const missed = new Set();
  const noRate = new Set();
  let total = 0;
  let hours = 0;

  for (const shift of pairShifts(punches)) {
    if (!shift.in || shift.business_date < fromKey || shift.business_date > toKey) continue;
    const name = names.get(shift.staff_id) || shift.staff?.name || 'Unknown';
    if (shift.status === 'missed_out') {
      missed.add(name);
      continue;
    }
    const ms =
      shift.status === 'closed'
        ? shift.ms
        : shift.status === 'open'
          ? now - new Date(shift.in.punched_at)
          : 0;
    const h = ms / 3600000;
    const rate = hourlyRateRm(name);
    if (rate == null) {
      if (h > 0) noRate.add(name);
      continue;
    }
    const pay = h * rate;
    byDate[shift.business_date] = (byDate[shift.business_date] || 0) + pay;
    total += pay;
    hours += h;
  }

  const round = (n) => Math.round(n * 100) / 100;
  return {
    byDate: Object.fromEntries(Object.entries(byDate).map(([k, v]) => [k, round(v)])),
    total: round(total),
    hours: Math.round(hours * 10) / 10,
    missed: [...missed],
    noRate: [...noRate],
  };
}
