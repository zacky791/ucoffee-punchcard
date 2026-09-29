import { useEffect, useState } from 'react';
import { api } from '../api';
import { MAX_SHIFT_HOURS, formatClock12 } from '../lib/performance';

const STAFF_PIN = String(import.meta.env.VITE_STAFF_PIN || '9897');

function toInputValue(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

function defaultOutTime(inAt, maxAt, closeTime) {
  if (closeTime) {
    const [hh, mm] = String(closeTime).slice(0, 5).split(':').map(Number);
    const close = new Date(inAt);
    close.setHours(hh, mm, 0, 0);
    if (close <= inAt) close.setDate(close.getDate() + 1);
    if (close <= maxAt) return close;
  }
  const eightHours = new Date(inAt.getTime() + 8 * 60 * 60 * 1000);
  return eightHours <= maxAt ? eightHours : maxAt;
}

export default function ManualClockOutModal({ person, closeTime, onClose, onSaved }) {
  const inPunch = person.openIn;
  const inAt = new Date(inPunch.punched_at);
  const maxAt = new Date(
    Math.min(inAt.getTime() + MAX_SHIFT_HOURS * 60 * 60 * 1000, Date.now())
  );

  const [step, setStep] = useState('pin');
  const [pin, setPin] = useState('');
  const [outValue, setOutValue] = useState(() =>
    toInputValue(defaultOutTime(inAt, maxAt, closeTime))
  );
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

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
      setStep('time');
      setError('');
      return;
    }
    setError('Incorrect PIN');
    setPin('');
  }

  async function submitTime(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.manualClockOut({
        in_punch_id: inPunch.id,
        punched_at: new Date(outValue).toISOString(),
        note: note.trim() || undefined,
      });
      onSaved();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Manual clock-out"
      onClick={() => !saving && onClose()}
    >
      <div className="staff-lock-card" onClick={(e) => e.stopPropagation()}>
        <p className="eyebrow">Missed clock-out</p>
        <h1>{step === 'pin' ? 'Staff access' : 'Clock out'}</h1>
        <p className="lede">
          {person.name} clocked in at {formatClock12(inPunch.punched_at)} on{' '}
          {inAt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}.
        </p>

        {step === 'pin' ? (
          <form className="staff-lock-form" onSubmit={submitPin}>
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
          <form className="staff-lock-form" onSubmit={submitTime}>
            <label>
              Clock-out time
              <input
                type="datetime-local"
                required
                autoFocus
                min={toInputValue(inAt)}
                max={toInputValue(maxAt)}
                value={outValue}
                onChange={(e) => {
                  setOutValue(e.target.value);
                  setError('');
                }}
              />
            </label>
            <label>
              Note (optional)
              <input
                maxLength={200}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. Forgot to clock out"
              />
            </label>
            {error && <p className="banner error">{error}</p>}
            <div className="modal-actions">
              <button
                type="button"
                className="btn ghost"
                onClick={onClose}
                disabled={saving}
              >
                Cancel
              </button>
              <button type="submit" className="btn primary" disabled={saving}>
                {saving ? 'Saving…' : 'Save clock-out'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
