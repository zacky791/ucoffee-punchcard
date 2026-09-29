/**
 * Shift rules (standard attendance / payroll practice):
 *  - A shift belongs to the business date of its clock-in, even if it ends after midnight.
 *  - The business day rolls over at BUSINESS_DAY_CUTOFF_HOUR, not midnight, so a
 *    1 AM punch still belongs to the previous day.
 *  - A clock-in with no clock-out within MAX_SHIFT_HOURS is a missed clock-out:
 *    it is flagged for review and not counted as paid hours.
 * Keep MAX_SHIFT_HOURS in sync with server/src/app.js.
 */
export const BUSINESS_DAY_CUTOFF_HOUR = 6;
export const MAX_SHIFT_HOURS = 16;
const MAX_SHIFT_MS = MAX_SHIFT_HOURS * 60 * 60 * 1000;

function toLocalDateKey(iso) {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Business date (YYYY-MM-DD) of a timestamp, honoring the early-morning cutoff. */
export function businessDateKey(iso) {
  const d = new Date(iso);
  d.setHours(d.getHours() - BUSINESS_DAY_CUTOFF_HOUR);
  return toLocalDateKey(d);
}

/** Punch query window for a Mon–Sun week, including overnight clock-outs after Sunday. */
export function weekPunchRange(weekStart) {
  const from = parseDateKey(weekStart);
  from.setHours(BUSINESS_DAY_CUTOFF_HOUR, 0, 0, 0);
  const to = new Date(from);
  to.setDate(to.getDate() + 7);
  to.setTime(to.getTime() + MAX_SHIFT_MS);
  return { from: from.toISOString(), to: to.toISOString() };
}

/**
 * One business day (6 AM → 6 AM next day). `punchTo` extends past the day so a
 * shift that started that day can still find its clock-out.
 */
export function businessDayRange(dateKey) {
  const from = parseDateKey(dateKey);
  from.setHours(BUSINESS_DAY_CUTOFF_HOUR, 0, 0, 0);
  const to = new Date(from);
  to.setDate(to.getDate() + 1);
  const punchTo = new Date(to.getTime() + MAX_SHIFT_MS);
  return { from: from.toISOString(), to: to.toISOString(), punchTo: punchTo.toISOString() };
}

/**
 * Pair punches into shifts. Each shift: { staff_id, in, out, ms, business_date, status }
 * status: 'closed' | 'open' (still working) | 'missed_out' | 'orphan_out' (out with no in)
 */
export function pairShifts(punches = [], now = new Date()) {
  const shifts = [];
  const open = new Map();
  const sorted = [...punches].sort(
    (a, b) => new Date(a.punched_at) - new Date(b.punched_at)
  );

  const closeAsMissed = (staffId) => {
    const shift = open.get(staffId);
    if (shift) shift.status = 'missed_out';
    open.delete(staffId);
  };

  for (const punch of sorted) {
    const staffId = punch.staff_id || punch.staff?.id || 'unknown';

    if (punch.type === 'in') {
      closeAsMissed(staffId);
      const shift = {
        staff_id: staffId,
        staff: punch.staff,
        in: punch,
        out: null,
        ms: 0,
        business_date: businessDateKey(punch.punched_at),
        status: 'open',
      };
      shifts.push(shift);
      open.set(staffId, shift);
      continue;
    }

    const shift = open.get(staffId);
    const elapsed = shift
      ? new Date(punch.punched_at) - new Date(shift.in.punched_at)
      : Infinity;
    if (shift && elapsed <= MAX_SHIFT_MS) {
      shift.out = punch;
      shift.ms = Math.max(0, elapsed);
      shift.status = 'closed';
      open.delete(staffId);
    } else {
      closeAsMissed(staffId);
      shifts.push({
        staff_id: staffId,
        staff: punch.staff,
        in: null,
        out: punch,
        ms: 0,
        business_date: businessDateKey(punch.punched_at),
        status: 'orphan_out',
      });
    }
  }

  for (const shift of open.values()) {
    if (now - new Date(shift.in.punched_at) > MAX_SHIFT_MS) {
      shift.status = 'missed_out';
    }
  }

  return shifts;
}

/** True if a staff member's last punch is a clock-in that is still within MAX_SHIFT_HOURS. */
export function isActivelyClockedIn(lastPunchType, lastPunchedAt, now = new Date()) {
  return (
    lastPunchType === 'in' &&
    Boolean(lastPunchedAt) &&
    now - new Date(lastPunchedAt) <= MAX_SHIFT_MS
  );
}

/**
 * Pay-period totals per staff. Only shifts whose clock-in business date falls in
 * [fromDate, toDate] count; missed clock-outs are reported, not paid.
 */
export function buildPerformance(punches = [], staffList = [], { fromDate, toDate } = {}) {
  const byStaff = new Map();
  const ensure = (id, staff) => {
    if (!byStaff.has(id)) {
      byStaff.set(id, {
        staff_id: id,
        name: staff?.name || 'Unknown',
        role: staff?.role || '',
        total_ms: 0,
        days: new Set(),
        missed_clock_outs: 0,
        open_now: false,
        shift_count: 0,
      });
    }
    return byStaff.get(id);
  };

  for (const person of staffList) ensure(person.id, person);

  for (const shift of pairShifts(punches)) {
    if (!shift.in) continue;
    if (fromDate && shift.business_date < fromDate) continue;
    if (toDate && shift.business_date > toDate) continue;

    const row = ensure(shift.staff_id, shift.staff);
    row.shift_count += 1;
    if (shift.status === 'closed') {
      row.total_ms += shift.ms;
      row.days.add(shift.business_date);
    } else if (shift.status === 'open') {
      row.open_now = true;
      row.days.add(shift.business_date);
    } else if (shift.status === 'missed_out') {
      row.missed_clock_outs += 1;
    }
  }

  return [...byStaff.values()]
    .map((row) => ({
      staff_id: row.staff_id,
      name: row.name,
      role: row.role,
      shift_count: row.shift_count,
      days_worked: row.days.size,
      total_ms: row.total_ms,
      total_hours: Math.round((row.total_ms / 3600000) * 10) / 10,
      open_now: row.open_now,
      missed_clock_outs: row.missed_clock_outs,
    }))
    .sort((a, b) => b.total_ms - a.total_ms || a.name.localeCompare(b.name));
}

/** Punches for one local calendar day. */
export function punchesForDate(punches = [], dateKey) {
  return punches.filter((p) => toLocalDateKey(p.punched_at) === dateKey);
}

/** Map punch id → business date of the shift it belongs to. */
export function shiftDateKeys(punches = []) {
  const keys = new Map();
  for (const shift of pairShifts(punches)) {
    if (shift.in) keys.set(shift.in.id, shift.business_date);
    if (shift.out) keys.set(shift.out.id, shift.business_date);
  }
  return keys;
}

/**
 * Week attendance board: each day with who worked, who was scheduled but
 * did not punch, and cafe closed status.
 */
export function buildWeekAttendance({
  weekStart,
  punches = [],
  staff = [],
  roster = [],
  hours = [],
} = {}) {
  const staffMap = new Map(staff.map((s) => [s.id, s]));
  const shiftKeys = shiftDateKeys(punches);

  return DAY_ORDER.map((dayOfWeek) => {
    const dateKey = dateForWeekDay(weekStart, dayOfWeek);
    const dayHours =
      hours.find((h) => Number(h.day_of_week) === dayOfWeek) || null;
    const isClosed = Boolean(dayHours?.is_closed);
    const dayPunches = punches.filter((p) => shiftKeys.get(p.id) === dateKey);
    const worked = buildDayStaffSummaries(dayPunches);
    const workedIds = new Set(worked.map((w) => w.staff_id));

    const scheduledIds = [
      ...new Set(
        roster
          .filter((r) => Number(r.day_of_week) === dayOfWeek)
          .map((r) => r.staff_id)
      ),
    ];

    const missed = scheduledIds
      .filter((id) => !workedIds.has(id))
      .map((id) => {
        const person = staffMap.get(id);
        const assignment = roster.find(
          (r) => Number(r.day_of_week) === dayOfWeek && r.staff_id === id
        );
        return {
          staff_id: id,
          name: person?.name || assignment?.staff?.name || 'Unknown',
          role: person?.role || assignment?.staff?.role || '',
          section: assignment?.section || '',
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    return {
      day_of_week: dayOfWeek,
      date: dateKey,
      is_closed: isClosed,
      open_time: dayHours?.open_time || null,
      close_time: dayHours?.close_time || null,
      worked,
      missed,
      worked_count: worked.length,
      missed_count: missed.length,
    };
  });
}

export function formatHours(hours) {
  if (!hours && hours !== 0) return '0h';
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (!m) return `${h}h`;
  return `${h}h ${m}m`;
}

export function formatHoursFromMs(ms) {
  return formatHours(ms / 3600000);
}

/** 12-hour clock, e.g. 9:05 AM */
export function formatClock12(iso) {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(iso));
}

/**
 * Group punches into per-staff day summaries with in/out sessions + total.
 */
export function buildDayStaffSummaries(punches = []) {
  const byStaff = new Map();

  const sorted = [...punches].sort(
    (a, b) => new Date(a.punched_at) - new Date(b.punched_at)
  );

  for (const punch of sorted) {
    const id = punch.staff_id || punch.staff?.id || 'unknown';
    if (!byStaff.has(id)) {
      byStaff.set(id, {
        staff_id: id,
        name: punch.staff?.name || 'Unknown',
        role: punch.staff?.role || '',
        sessions: [],
        openIn: null,
        total_ms: 0,
        firstIn: null,
        lastOut: null,
      });
    }
    const row = byStaff.get(id);

    if (punch.type === 'in') {
      row.openIn = punch;
      if (!row.firstIn) row.firstIn = punch;
    } else if (punch.type === 'out') {
      row.lastOut = punch;
      if (row.openIn) {
        const ms = Math.max(
          0,
          new Date(punch.punched_at) - new Date(row.openIn.punched_at)
        );
        row.sessions.push({
          in: row.openIn,
          out: punch,
          ms,
        });
        row.total_ms += ms;
        row.openIn = null;
      }
    }
  }

  return [...byStaff.values()]
    .map((row) => ({
      ...row,
      still_in: Boolean(row.openIn) && isActivelyClockedIn('in', row.openIn.punched_at),
      missed_out:
        Boolean(row.openIn) && !isActivelyClockedIn('in', row.openIn.punched_at),
      total_label: formatHoursFromMs(row.total_ms),
      in_label: row.firstIn ? formatClock12(row.firstIn.punched_at) : null,
      out_label: row.lastOut ? formatClock12(row.lastOut.punched_at) : null,
      out_date_label:
        row.firstIn &&
        row.lastOut &&
        toLocalDateKey(row.lastOut.punched_at) !== toLocalDateKey(row.firstIn.punched_at)
          ? new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(
              new Date(row.lastOut.punched_at)
            )
          : null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Mon → Sun

export const DAY_LABELS = {
  0: 'Sunday',
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday',
};

export const DAY_SHORT = {
  0: 'Sun',
  1: 'Mon',
  2: 'Tue',
  3: 'Wed',
  4: 'Thu',
  5: 'Fri',
  6: 'Sat',
};

/** Monday date (YYYY-MM-DD) for the week containing `date`. */
export function startOfWeek(date = new Date()) {
  const d = new Date(date);
  d.setHours(12, 0, 0, 0);
  const day = d.getDay(); // 0 Sun … 6 Sat
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return toDateKey(d);
}

export function addDays(dateKey, days) {
  const d = parseDateKey(dateKey);
  d.setDate(d.getDate() + days);
  return toDateKey(d);
}

export function toDateKey(date) {
  const d = date instanceof Date ? date : parseDateKey(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseDateKey(dateKey) {
  const [y, m, d] = String(dateKey).split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

export function formatWeekRange(weekStart) {
  const start = parseDateKey(weekStart);
  const end = parseDateKey(addDays(weekStart, 6));
  const sameMonth =
    start.getMonth() === end.getMonth() &&
    start.getFullYear() === end.getFullYear();
  if (sameMonth) {
    const month = start.toLocaleDateString(undefined, { month: 'long' });
    return `${month} ${start.getDate()}–${end.getDate()}, ${start.getFullYear()}`;
  }
  const startLabel = start.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
  const endLabel = end.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  return `${startLabel} – ${endLabel}`;
}

/** Month label for a week, e.g. "September 2026" */
export function formatWeekMonth(weekStart) {
  const start = parseDateKey(weekStart);
  const end = parseDateKey(addDays(weekStart, 6));
  if (
    start.getMonth() === end.getMonth() &&
    start.getFullYear() === end.getFullYear()
  ) {
    return start.toLocaleDateString(undefined, {
      month: 'long',
      year: 'numeric',
    });
  }
  const a = start.toLocaleDateString(undefined, { month: 'short' });
  const b = end.toLocaleDateString(undefined, {
    month: 'short',
    year: 'numeric',
  });
  return `${a}–${b}`;
}

export function dateForWeekDay(weekStart, dayOfWeek) {
  // weekStart is Monday; DAY_ORDER maps Mon=1 … Sun=0
  const offset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  return addDays(weekStart, offset);
}

export function formatDayDate(dateKey) {
  return parseDateKey(dateKey).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

export function formatTimeLabel(time) {
  if (!time) return '—';
  const [hh, mm] = String(time).slice(0, 5).split(':');
  const h = Number(hh);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 || 12;
  return `${hour12}:${mm} ${suffix}`;
}
