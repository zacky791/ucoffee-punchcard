import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../api';
import {
  BUSINESS_DAY_CUTOFF_HOUR,
  MAX_SHIFT_HOURS,
  formatDayDate,
  pairShifts,
  parseDateKey,
} from '../lib/performance';

const STAFF_PIN = String(import.meta.env.VITE_STAFF_PIN || '9897');
const MAX_SHIFT_MS = MAX_SHIFT_HOURS * 60 * 60 * 1000;

function timeOf(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Clock-in on the business day: times before the cutoff belong to the early hours after it. */
function inDate(dateKey, time) {
  const [hh, mm] = time.split(':').map(Number);
  const d = parseDateKey(dateKey);
  d.setHours(hh, mm, 0, 0);
  if (hh < BUSINESS_DAY_CUTOFF_HOUR) d.setDate(d.getDate() + 1);
  return d;
}

/** Clock-out is the first matching time after the clock-in (rolls past midnight). */
function outDate(inAt, time) {
  const [hh, mm] = time.split(':').map(Number);
  const d = new Date(inAt);
  d.setHours(hh, mm, 0, 0);
  if (d <= inAt) d.setDate(d.getDate() + 1);
  return d;
}

const sameMinute = (a, b) => Math.floor(new Date(a) / 60000) === Math.floor(new Date(b) / 60000);

let nextKey = 0;

function rowsForDay(punches, dateKey) {
  return pairShifts(punches)
    .filter((s) => s.business_date === dateKey)
    .map((s) => ({
      key: `row-${nextKey++}`,
      staff_id: s.staff_id,
      inTime: timeOf(s.in?.punched_at),
      outTime: timeOf(s.out?.punched_at),
      orig: { staff_id: s.staff_id, in: s.in, out: s.out },
    }));
}

export default function DayAttendanceModal({ date, punches, staff, onClose, onSaved }) {
  const [step, setStep] = useState('pin');
  const [pin, setPin] = useState('');
  const [rows, setRows] = useState(() => rowsForDay(punches, date));
  const [removed, setRemoved] = useState([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const staffName = (id) => staff.find((s) => s.id === id)?.name || 'this person';
  const activeStaff = staff.filter((s) => s.active !== false);

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape' && !saving) onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, saving]);

  function submitPin(e) {
    e.preventDefault();
    if (String(pin) === STAFF_PIN) {
      setStep('edit');
      setError('');
      return;
    }
    setError('Incorrect PIN');
    setPin('');
  }

  function update(key, patch) {
    setRows((list) => list.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    setError('');
  }

  function removeRow(row) {
    setRows((list) => list.filter((r) => r.key !== row.key));
    if (row.orig) setRemoved((list) => [...list, row.orig]);
  }

  function addRow() {
    setRows((list) => [
      ...list,
      { key: `row-${nextKey++}`, staff_id: '', inTime: '', outTime: '', orig: null },
    ]);
  }

  /** Validates the rows and returns the punch changes to send, or throws a readable error. */
  function buildChanges() {
    const now = Date.now() + 5 * 60 * 1000;
    const shifts = rows.map((r) => {
      if (!r.staff_id) throw new Error('Choose who worked for every row.');
      const name = staffName(r.staff_id);
      if (!r.inTime) throw new Error(`Enter the clock-in time for ${name}.`);
      const inAt = inDate(date, r.inTime);
      const outAt = r.outTime ? outDate(inAt, r.outTime) : null;
      if (inAt.getTime() > now) throw new Error(`${name}'s clock-in is in the future.`);
      if (outAt && outAt.getTime() > now) throw new Error(`${name}'s clock-out is in the future.`);
      if (outAt && outAt - inAt > MAX_SHIFT_MS) {
        throw new Error(`${name}'s shift is longer than ${MAX_SHIFT_HOURS} hours. Check the times.`);
      }
      return { row: r, name, inAt, outAt };
    });

    const byStaff = new Map();
    for (const s of shifts) {
      byStaff.set(s.row.staff_id, [...(byStaff.get(s.row.staff_id) || []), s]);
    }
    for (const list of byStaff.values()) {
      list.sort((a, b) => a.inAt - b.inAt);
      for (let i = 1; i < list.length; i += 1) {
        const prev = list[i - 1];
        if (!prev.outAt || prev.outAt > list[i].inAt) {
          throw new Error(`${prev.name} has two shifts that overlap. Fix the times or remove one.`);
        }
      }
    }

    const create = [];
    const update = [];
    const remove = [];
    for (const orig of removed) {
      if (orig.in) remove.push(orig.in.id);
      if (orig.out) remove.push(orig.out.id);
    }
    for (const { row, inAt, outAt } of shifts) {
      const orig = row.orig;
      if (!orig || orig.staff_id !== row.staff_id) {
        if (orig?.in) remove.push(orig.in.id);
        if (orig?.out) remove.push(orig.out.id);
        create.push({ staff_id: row.staff_id, type: 'in', punched_at: inAt.toISOString() });
        if (outAt) create.push({ staff_id: row.staff_id, type: 'out', punched_at: outAt.toISOString() });
        continue;
      }
      if (orig.in && !sameMinute(orig.in.punched_at, inAt)) {
        update.push({ id: orig.in.id, punched_at: inAt.toISOString() });
      } else if (!orig.in) {
        create.push({ staff_id: row.staff_id, type: 'in', punched_at: inAt.toISOString() });
      }
      if (orig.out && !outAt) remove.push(orig.out.id);
      else if (orig.out && !sameMinute(orig.out.punched_at, outAt)) {
        update.push({ id: orig.out.id, punched_at: outAt.toISOString() });
      } else if (!orig.out && outAt) {
        create.push({ staff_id: row.staff_id, type: 'out', punched_at: outAt.toISOString() });
      }
    }
    return { create, update, remove };
  }

  async function save(e) {
    e.preventDefault();
    let changes;
    try {
      changes = buildChanges();
    } catch (err) {
      setError(err.message);
      return;
    }
    if (!changes.create.length && !changes.update.length && !changes.remove.length) {
      onClose();
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api.savePunches(changes);
      onSaved();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return createPortal(
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={`Edit attendance for ${formatDayDate(date)}`}
      onClick={() => !saving && onClose()}
    >
      <div
        className={`staff-lock-card ${step === 'edit' ? 'day-attendance-card' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="eyebrow">Working schedule</p>
        <h1>{step === 'pin' ? 'Staff access' : formatDayDate(date)}</h1>

        {step === 'pin' ? (
          <form className="staff-lock-form" onSubmit={submitPin}>
            <p className="lede">Enter the staff PIN to edit who worked on {formatDayDate(date)}.</p>
            <label>
              Staff PIN
              <input
                type="password"
                inputMode="numeric"
                pattern="\d*"
                maxLength={8}
                autoFocus
                autoComplete="off"
                value={pin}
                onChange={(e) => {
                  setPin(e.target.value.replace(/\D/g, '').slice(0, 8));
                  setError('');
                }}
                placeholder="Enter PIN"
              />
            </label>
            {error && <p className="banner error">{error}</p>}
            <div className="modal-actions">
              <button type="button" className="btn ghost" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="btn primary">
                Unlock
              </button>
            </div>
          </form>
        ) : (
          <form className="staff-lock-form" onSubmit={save}>
            <p className="lede">
              Who worked this day. Leave clock-out empty if they have not clocked out yet.
            </p>

            {rows.length === 0 && <p className="week-mini-empty">Nobody recorded yet.</p>}

            <ul className="day-attendance-list">
              {rows.map((r) => (
                <li key={r.key} className="day-attendance-row">
                  <label className="day-attendance-staff">
                    Staff
                    <select
                      value={r.staff_id}
                      onChange={(e) => update(r.key, { staff_id: e.target.value })}
                    >
                      <option value="">Choose…</option>
                      {(activeStaff.some((s) => s.id === r.staff_id)
                        ? activeStaff
                        : [...activeStaff, ...staff.filter((s) => s.id === r.staff_id)]
                      ).map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Clock in
                    <input
                      type="time"
                      value={r.inTime}
                      onChange={(e) => update(r.key, { inTime: e.target.value })}
                    />
                  </label>
                  <label>
                    Clock out
                    <input
                      type="time"
                      value={r.outTime}
                      onChange={(e) => update(r.key, { outTime: e.target.value })}
                    />
                  </label>
                  <button
                    type="button"
                    className="day-attendance-remove"
                    aria-label={`Remove ${r.staff_id ? staffName(r.staff_id) : 'row'}`}
                    title="Remove"
                    onClick={() => removeRow(r)}
                  >
                    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                      <path
                        d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4h6v3"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>

            <button type="button" className="btn ghost" onClick={addRow}>
              + Add person
            </button>

            {error && <p className="banner error">{error}</p>}
            <div className="modal-actions">
              <button type="button" className="btn ghost" onClick={onClose} disabled={saving}>
                Cancel
              </button>
              <button type="submit" className="btn primary" disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body
  );
}
