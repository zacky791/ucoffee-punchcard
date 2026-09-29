import { useEffect, useState } from 'react';
import {
  connectPrinter,
  getPrinterState,
  subscribePrinter,
} from '../lib/receiptPrinter';

export default function PrinterConnectButton({ onError }) {
  const [state, setState] = useState(getPrinterState);
  const [busy, setBusy] = useState(false);

  useEffect(() => subscribePrinter(setState), []);

  if (state.mode === 'rawbt') {
    return <span className="pos-badge ok">Printer: RawBT app</span>;
  }

  if (state.connected) {
    return (
      <span className="pos-badge ok" title="Receipts print automatically after payment">
        Printer: {state.name || 'connected'}
      </span>
    );
  }

  return (
    <button
      type="button"
      className="pos-btn ghost"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await connectPrinter();
        } catch (err) {
          if (err?.name !== 'NotFoundError') onError?.(err.message);
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? 'Connecting…' : 'Connect printer'}
    </button>
  );
}
