import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api';
import PrinterConnectButton from '../../components/PrinterConnectButton';
import Toast from '../../components/Toast';
import {
  checkPrinterConnection,
  disconnectPrinter,
  getPrinterState,
  kickDrawer,
  printFromResult,
  setPrintMode,
  subscribePrinter,
} from '../../lib/receiptPrinter';

export default function SettingsPage() {
  const [form, setForm] = useState(null);
  const [toast, setToast] = useState(null);
  const clearToast = useCallback(() => setToast(null), []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [hwStatus, setHwStatus] = useState(null);
  const [printer, setPrinter] = useState(getPrinterState);

  useEffect(() => subscribePrinter(setPrinter), []);

  useEffect(() => {
    (async () => {
      try {
        setForm(await api.posGetSettings());
      } catch (err) {
        setError(err.message);
      }
    })();
  }, []);

  function set(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function save(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const saved = await api.posUpdateSettings({
        ...form,
        tax_rate: Number(form.tax_rate) || 0,
        service_charge_rate: Number(form.service_charge_rate) || 0,
        receipt_width_mm: Number(form.receipt_width_mm) || 80,
        payment_methods: Array.isArray(form.payment_methods)
          ? form.payment_methods
          : String(form.payment_methods || '')
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean),
      });
      setForm(saved);
      setToast({ text: 'Settings saved' });
    } catch (err) {
      setToast({ tone: 'error', text: `Save failed: ${err.message}` });
    } finally {
      setSaving(false);
    }
  }

  async function testConnection() {
    setError('');
    setHwStatus(null);
    try {
      if (form.hardware_provider === 'phone') {
        const state = await checkPrinterConnection();
        if (state.mode === 'rawbt') {
          setHwStatus({
            ok: true,
            title: 'Using RawBT app',
            detail:
              'This phone sends receipts to the RawBT app. The browser cannot see the Bluetooth link; tap Test print to confirm the printer responds.',
          });
        } else if (!state.supported) {
          setHwStatus({
            ok: false,
            title: 'Bluetooth not available',
            detail: 'This browser has no Bluetooth access. Use Chrome on Android over https, or switch to RawBT.',
          });
        } else if (state.connected) {
          setHwStatus({
            ok: true,
            title: 'Bluetooth printer connected',
            detail: `Device: ${state.name || 'Unnamed printer'}. Receipts will print after payment.`,
          });
        } else {
          setHwStatus({
            ok: false,
            title: 'Bluetooth printer not connected',
            detail: state.name
              ? `Lost connection to ${state.name}. Check the printer is on and nearby, then tap Connect printer.`
              : 'No printer paired in this session. Tap Connect printer and pick your printer.',
          });
        }
        return;
      }
      if (form.hardware_provider === 'mock') {
        setHwStatus({
          tone: 'warn',
          title: 'Mock mode: no real printer',
          detail:
            'Mock is a pretend printer for testing. It does not use Bluetooth or any device. To use your POS-58B, set Hardware provider to "Cashier phone (Bluetooth printer)", tap Save settings, then Connect printer.',
        });
        return;
      }
      const res = await api.posHardwareStatus();
      setHwStatus({
        ok: Boolean(res.status?.ok),
        title: res.status?.ok ? 'Connection OK' : 'Connection failed',
        detail: `Provider: ${res.status?.provider || form.hardware_provider}. ${res.status?.message || ''}`,
      });
    } catch (err) {
      setError(err.message);
    }
  }

  async function testPrint() {
    setError('');
    setHwStatus(null);
    try {
      const res = await api.posTestPrint();
      if (form.hardware_provider === 'phone' && !res.client_print) {
        setHwStatus({
          ok: false,
          title: 'Test print not sent',
          detail: `The saved provider is still "${res.provider}". Tap Save settings first, then Test print again.`,
        });
        return;
      }
      if (res.provider === 'mock') {
        setHwStatus({
          tone: 'warn',
          title: 'Nothing printed (Mock mode)',
          detail:
            'The test receipt was only written to the server log. Switch Hardware provider to "Cashier phone (Bluetooth printer)" and save to print on paper.',
        });
        return;
      }
      const printed = await printFromResult(res);
      const state = getPrinterState();
      setHwStatus({
        ok: printed.ok,
        title: printed.ok ? 'Test print sent' : 'Test print failed',
        detail: res.client_print
          ? printed.ok
            ? `${printed.message}. If nothing came out, check paper and that the printer is on.`
            : `${printed.message}${
                state.mode === 'bluetooth' && !state.connected
                  ? ' (Bluetooth printer not connected.)'
                  : ''
              }`
          : `Provider: ${res.provider}. ${printed.message}`,
      });
    } catch (err) {
      setError(err.message);
    }
  }

  async function openDrawer() {
    setError('');
    setHwStatus(null);
    try {
      const res = await api.posOpenDrawer();
      if (res.skipped) {
        setHwStatus({
          tone: 'warn',
          title: 'Cash drawer is turned off',
          detail: 'Turn on "Open cash drawer after payment" and tap Save settings first.',
        });
        return;
      }
      if (res.client_drawer) {
        await kickDrawer();
        const state = getPrinterState();
        setHwStatus({
          ok: true,
          title: 'Drawer command sent',
          detail: `Sent to ${
            state.mode === 'rawbt' ? 'the RawBT app' : state.name || 'the printer'
          }. The drawer only opens if its cable is plugged into the printer's drawer (RJ11) port.`,
        });
        return;
      }
      setHwStatus({
        ok: Boolean(res.ok),
        title: res.ok ? 'Drawer command sent' : 'Drawer failed',
        detail: `Provider: ${res.provider || form.hardware_provider}. ${res.message || ''}`,
      });
    } catch (err) {
      setHwStatus({ ok: false, title: 'Drawer failed', detail: err.message });
    }
  }

  if (!form) {
    return (
      <div>
        <div className="pos-page-head">
          <div>
            <h1>Settings</h1>
          </div>
        </div>
        {error ? <div className="pos-alert error">{error}</div> : <div className="pos-card">Loading…</div>}
      </div>
    );
  }

  return (
    <div>
      <div className="pos-page-head">
        <div>
          <h1>Settings</h1>
          <p>Café profile, tax, receipt, and hardware provider</p>
        </div>
      </div>

      {error && <div className="pos-alert error">{error}</div>}
      <Toast toast={toast} onDone={clearToast} />

      <form className="pos-card pos-form-grid" onSubmit={save}>
        <label className="pos-field">
          <span>Café name</span>
          <input
            className="pos-input"
            value={form.cafe_name || ''}
            onChange={(e) => set('cafe_name', e.target.value)}
          />
        </label>
        <label className="pos-field">
          <span>Phone</span>
          <input
            className="pos-input"
            value={form.phone || ''}
            onChange={(e) => set('phone', e.target.value)}
          />
        </label>
        <label className="pos-field full">
          <span>Address</span>
          <input
            className="pos-input"
            value={form.address || ''}
            onChange={(e) => set('address', e.target.value)}
          />
        </label>
        <label className="pos-field">
          <span>Currency</span>
          <input
            className="pos-input"
            value={form.currency || 'MYR'}
            onChange={(e) => set('currency', e.target.value)}
          />
        </label>
        <label className="pos-field">
          <span>Order prefix</span>
          <input
            className="pos-input"
            value={form.order_prefix || 'UC'}
            onChange={(e) => set('order_prefix', e.target.value)}
          />
        </label>
        <label className="pos-field">
          <span>Tax rate (e.g. 0.06)</span>
          <input
            className="pos-input"
            type="number"
            step="0.0001"
            value={form.tax_rate ?? 0}
            onChange={(e) => set('tax_rate', e.target.value)}
          />
        </label>
        <label className="pos-field">
          <span>Service charge rate</span>
          <input
            className="pos-input"
            type="number"
            step="0.0001"
            value={form.service_charge_rate ?? 0}
            onChange={(e) => set('service_charge_rate', e.target.value)}
          />
        </label>
        <label className="pos-field full">
          <span>Receipt footer</span>
          <input
            className="pos-input"
            value={form.receipt_footer || ''}
            onChange={(e) => set('receipt_footer', e.target.value)}
          />
        </label>
        <label className="pos-field">
          <span>Receipt width (mm)</span>
          <select
            className="pos-select"
            value={form.receipt_width_mm || 80}
            onChange={(e) => set('receipt_width_mm', e.target.value)}
          >
            <option value={58}>58</option>
            <option value={80}>80</option>
          </select>
        </label>
        <label className="pos-field">
          <span>Feedback / reviews URL</span>
          <input
            className="pos-input"
            value={form.feedback_qr_url || ''}
            onChange={(e) => set('feedback_qr_url', e.target.value)}
          />
        </label>
        <label className="pos-field full">
          <span>Payment methods (comma-separated)</span>
          <input
            className="pos-input"
            value={
              Array.isArray(form.payment_methods)
                ? form.payment_methods.join(', ')
                : form.payment_methods || ''
            }
            onChange={(e) => set('payment_methods', e.target.value)}
          />
        </label>

        <label className="pos-field">
          <span>Hardware provider</span>
          <select
            className="pos-select"
            value={form.hardware_provider || 'mock'}
            onChange={(e) => set('hardware_provider', e.target.value)}
          >
            <option value="phone">Cashier phone (Bluetooth printer)</option>
            <option value="mock">Mock (dev logs)</option>
            <option value="escpos">ESC/POS (needs device config)</option>
            <option value="local_bridge">Local hardware bridge</option>
            <option value="cashier_api">Cashier software API</option>
          </select>
        </label>
        <label className="pos-field">
          <span>Printer connection</span>
          <select
            className="pos-select"
            value={form.printer_connection || 'usb'}
            onChange={(e) => set('printer_connection', e.target.value)}
          >
            <option value="usb">USB</option>
            <option value="network">Network / TCP</option>
            <option value="serial">Serial</option>
          </select>
        </label>
        <label className="pos-switch-row full">
          <span>
            <strong>Open cash drawer after payment</strong>
            <small>Needs a drawer cable plugged into the printer's drawer port</small>
          </span>
          <span className="pos-switch">
            <input
              type="checkbox"
              role="switch"
              checked={form.cash_drawer_enabled !== false}
              onChange={(e) => set('cash_drawer_enabled', e.target.checked)}
            />
            <span className="pos-switch-track" aria-hidden="true" />
          </span>
        </label>

        <div className="pos-settings-actions full">
          <button type="submit" className="pos-btn primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save settings'}
          </button>
          <button type="button" className="pos-btn ghost" onClick={testConnection}>
            Test connection
          </button>
          <button type="button" className="pos-btn ghost" onClick={testPrint}>
            Test print
          </button>
          <button type="button" className="pos-btn ghost" onClick={openDrawer}>
            Open drawer
          </button>
        </div>

        {hwStatus && (
          <div
            className={`pos-alert ${hwStatus.tone || (hwStatus.ok ? 'ok' : 'error')} full`}
            role="status"
            style={{ gridColumn: '1 / -1', margin: 0 }}
          >
            <strong>
              {hwStatus.tone === 'warn' ? '!' : hwStatus.ok ? '✓' : '✕'} {hwStatus.title}
            </strong>
            <div>{hwStatus.detail}</div>
          </div>
        )}
      </form>

      {form.hardware_provider === 'phone' && (
        <div className="pos-card" style={{ marginTop: '0.85rem' }}>
          <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>Cashier phone printer</h2>
          <p className="pos-meta" style={{ marginTop: 0 }}>
            These options are saved on this phone only. Save settings above first, then
            connect and tap <strong>Test print</strong>.
          </p>
          <div className="pos-form-grid">
            <label className="pos-field">
              <span>Print method on this phone</span>
              <select
                className="pos-select"
                value={printer.mode}
                onChange={(e) => setPrintMode(e.target.value)}
              >
                <option value="bluetooth">Bluetooth direct (Chrome)</option>
                <option value="rawbt">RawBT app (Android)</option>
              </select>
            </label>
            <div className="pos-field" style={{ justifyContent: 'flex-end' }}>
              <span>Status</span>
              <div className="pos-printer-status">
                <PrinterConnectButton onError={setError} />
                {printer.mode === 'bluetooth' && printer.connected && (
                  <button type="button" className="pos-btn ghost" onClick={disconnectPrinter}>
                    Disconnect
                  </button>
                )}
              </div>
            </div>
          </div>
          {printer.mode === 'bluetooth' && !printer.supported && (
            <div className="pos-alert warn" style={{ marginTop: '0.75rem' }}>
              This browser has no Bluetooth access. Open the app in Chrome on Android
              (over https), or switch to RawBT.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
