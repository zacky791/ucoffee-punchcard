import { useEffect, useState } from 'react';
import { api } from '../../api';

export default function SettingsPage() {
  const [form, setForm] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [hwStatus, setHwStatus] = useState(null);

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
    setMessage('');
    try {
      const saved = await api.posUpdateSettings({
        ...form,
        tax_rate: Number(form.tax_rate) || 0,
        service_charge_rate: Number(form.service_charge_rate) || 0,
        receipt_width_mm: Number(form.receipt_width_mm) || 80,
        printer_port: form.printer_port ? Number(form.printer_port) : null,
        payment_methods: Array.isArray(form.payment_methods)
          ? form.payment_methods
          : String(form.payment_methods || '')
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean),
      });
      setForm(saved);
      setMessage('Settings saved');
    } catch (err) {
      setError(err.message);
    }
  }

  async function testConnection() {
    setError('');
    setMessage('');
    try {
      const res = await api.posHardwareStatus();
      setHwStatus(res.status);
      setMessage(res.status?.message || 'Status checked');
    } catch (err) {
      setError(err.message);
    }
  }

  async function testPrint() {
    setError('');
    setMessage('');
    try {
      const res = await api.posTestPrint();
      setMessage(res.message || (res.ok ? 'Test print OK' : 'Test print failed'));
      if (!res.ok) setError(res.message);
    } catch (err) {
      setError(err.message);
    }
  }

  async function openDrawer() {
    setError('');
    setMessage('');
    try {
      const res = await api.posOpenDrawer();
      setMessage(res.message || 'Drawer command sent');
      if (!res.ok) setError(res.message);
    } catch (err) {
      setError(err.message);
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
      {message && <div className="pos-alert ok">{message}</div>}

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
        <label className="pos-field">
          <span>Printer host</span>
          <input
            className="pos-input"
            value={form.printer_host || ''}
            onChange={(e) => set('printer_host', e.target.value)}
            placeholder="192.168.1.50"
          />
        </label>
        <label className="pos-field">
          <span>Printer port</span>
          <input
            className="pos-input"
            value={form.printer_port || ''}
            onChange={(e) => set('printer_port', e.target.value)}
            placeholder="9100"
          />
        </label>
        <label className="pos-field" style={{ flexDirection: 'row', alignItems: 'center' }}>
          <input
            type="checkbox"
            checked={form.cash_drawer_enabled !== false}
            onChange={(e) => set('cash_drawer_enabled', e.target.checked)}
          />
          <span>Open cash drawer after payment</span>
        </label>

        <div className="pos-field full" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <button type="submit" className="pos-btn primary">
            Save settings
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
      </form>

      {hwStatus && (
        <div className="pos-card" style={{ marginTop: '0.85rem' }}>
          <strong>Hardware status</strong>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.85rem' }}>
            {JSON.stringify(hwStatus, null, 2)}
          </pre>
        </div>
      )}

      <div className="pos-card" style={{ marginTop: '0.85rem' }}>
        <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>How hardware works</h2>
        <p className="pos-meta" style={{ marginTop: 0 }}>
          After payment, the API calls <code>HardwareIntegrationService</code>. The
          browser never talks to the printer directly. Use <strong>mock</strong> locally
          (receipt text appears in the Node server console). For a remote API + USB
          printer on the cashier PC, run a local bridge and set provider to{' '}
          <strong>local_bridge</strong>. ESC/POS and cashier API need your real device /
          vendor docs before they can send live commands.
        </p>
      </div>
    </div>
  );
}
