import { useEffect } from 'react';

export default function Toast({ toast, onDone, duration = 2600 }) {
  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(onDone, duration);
    return () => clearTimeout(t);
  }, [toast, onDone, duration]);

  if (!toast) return null;

  return (
    <div className={`pos-toast ${toast.tone || 'ok'}`} role="status" aria-live="polite">
      <span aria-hidden="true">{toast.tone === 'error' ? '✕' : '✓'}</span>
      {toast.text}
    </div>
  );
}
