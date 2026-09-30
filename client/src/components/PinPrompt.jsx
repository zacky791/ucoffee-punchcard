import { useState } from 'react';

const STAFF_PIN = String(import.meta.env.VITE_STAFF_PIN || '9897');

/** Inline staff PIN check for sensitive actions inside a pop-up. */
export default function PinPrompt({ title, onCancel, onUnlock }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  function submit(e) {
    e.preventDefault();
    if (String(pin) === STAFF_PIN) {
      onUnlock();
      return;
    }
    setError('Incorrect PIN');
    setPin('');
  }

  return (
    <form className="pos-pin" onSubmit={submit}>
      <strong>{title}</strong>
      <span className="pos-product-meta">Enter the staff PIN to continue.</span>
      <input
        className="pos-input"
        type="password"
        inputMode="numeric"
        pattern="\d*"
        maxLength={8}
        autoFocus
        autoComplete="off"
        placeholder="Staff PIN"
        value={pin}
        onChange={(e) => {
          setPin(e.target.value.replace(/\D/g, '').slice(0, 8));
          setError('');
        }}
      />
      {error && <div className="pos-alert error" style={{ margin: 0 }}>{error}</div>}
      <div className="pos-pin-actions">
        <button type="button" className="pos-btn ghost" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="pos-btn primary" disabled={!pin}>
          Unlock
        </button>
      </div>
    </form>
  );
}
