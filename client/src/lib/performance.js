/** Pair clock-in/out punches into worked sessions and totals. */

export function buildPerformance(punches = [], staffList = []) {
  const byStaff = new Map();

  for (const person of staffList) {
    byStaff.set(person.id, {
      staff_id: person.id,
      name: person.name,
      role: person.role,
      punches: [],
      sessions: [],
      total_ms: 0,
      days: new Set(),
      open_session: null,
      punch_count: 0,
    });
  }

  const sorted = [...punches].sort(
    (a, b) => new Date(a.punched_at) - new Date(b.punched_at)
  );

  for (const punch of sorted) {
    const id = punch.staff_id;
    if (!byStaff.has(id)) {
      byStaff.set(id, {
        staff_id: id,
        name: punch.staff?.name || 'Unknown',
        role: punch.staff?.role || '',
        punches: [],
        sessions: [],
        total_ms: 0,
        days: new Set(),
        open_session: null,
        punch_count: 0,
      });
    }
    const row = byStaff.get(id);
    row.punches.push(punch);
    row.punch_count += 1;
    row.days.add(new Date(punch.punched_at).toDateString());

    if (punch.type === 'in') {
      row.open_session = punch;
    } else if (punch.type === 'out' && row.open_session) {
      const start = new Date(row.open_session.punched_at);
      const end = new Date(punch.punched_at);
      const ms = Math.max(0, end - start);
      row.sessions.push({
        in: row.open_session,
        out: punch,
        ms,
      });
      row.total_ms += ms;
      row.open_session = null;
    }
  }

  return [...byStaff.values()]
    .map((row) => ({
      staff_id: row.staff_id,
      name: row.name,
      role: row.role,
      punch_count: row.punch_count,
      days_worked: row.days.size,
      total_ms: row.total_ms,
      total_hours: Math.round((row.total_ms / 3600000) * 10) / 10,
      open_now: Boolean(row.open_session),
    }))
    .filter((row) => row.punch_count > 0 || staffList.some((s) => s.id === row.staff_id))
    .sort((a, b) => b.total_ms - a.total_ms || a.name.localeCompare(b.name));
}

function toLocalDateKey(iso) {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Punches for one local calendar day. */
export function punchesForDate(punches = [], dateKey) {
  return punches.filter((p) => toLocalDateKey(p.punched_at) === dateKey);
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

  return DAY_ORDER.map((dayOfWeek) => {
    const dateKey = dateForWeekDay(weekStart, dayOfWeek);
    const dayHours =
      hours.find((h) => Number(h.day_of_week) === dayOfWeek) || null;
    const isClosed = Boolean(dayHours?.is_closed);
    const dayPunches = punchesForDate(punches, dateKey);
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
      still_in: Boolean(row.openIn),
      total_label: formatHoursFromMs(row.total_ms),
      in_label: row.firstIn ? formatClock12(row.firstIn.punched_at) : null,
      out_label: row.lastOut ? formatClock12(row.lastOut.punched_at) : null,
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
