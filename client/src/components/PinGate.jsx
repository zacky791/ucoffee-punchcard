import { useState } from 'react';

const STAFF_PIN = String(import.meta.env.VITE_STAFF_PIN || '9897');

export default function PinGate({
  title = 'Staff access',
  subtitle = 'Enter the staff PIN to continue.',
  onUnlock,
  children,
}) {
  const [unlocked, setUnlocked] = useState(false);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  if (unlocked) {
    return typeof children === 'function'
      ? children({ lock: () => setUnlocked(false) })
      : children;
  }

  function submit(e) {
    e.preventDefault();
    if (String(pin) === STAFF_PIN) {
      setUnlocked(true);
      onUnlock?.();
      return;
    }
    setError('Incorrect PIN');
    setPin('');
  }

  return (
    <section className="page staff-lock">
      <div className="staff-lock-card">
        <p className="eyebrow">Restricted</p>
        <h1>{title}</h1>
        <p className="lede">{subtitle}</p>
        <form className="staff-lock-form" onSubmit={submit}>
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
          <button type="submit" className="btn primary">
            Unlock
          </button>
        </form>
      </div>
    </section>
  );
}
