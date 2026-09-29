/**
 * ESC/POS provider scaffold.
 *
 * Requires café-specific hardware details before enabling in production:
 *  - Connection: USB | Network TCP | Serial
 *  - Printer model / paper width (58mm or 80mm)
 *  - Cash drawer kick code (often ESC p m t1 t2 via printer)
 *
 * Until configured, this provider refuses physical I/O and returns a clear error
 * so checkout can show retry / manual print instead of failing silently.
 */

const { formatReceiptText } = require('./mockProvider');

function missingConfig(settings) {
  const connection = settings.printer_connection || 'usb';
  if (connection === 'network' || connection === 'tcp') {
    if (!settings.printer_host) {
      return 'ESC/POS network printer requires printer_host (and optional printer_port).';
    }
  }
  if (connection === 'serial' && !settings.printer_path) {
    return 'ESC/POS serial printer requires printer_path (e.g. /dev/tty.usbserial).';
  }
  // USB needs OS-specific binding (e.g. node-usb / printer queue). Not assumed.
  if (connection === 'usb' && !settings.printer_device) {
    return 'ESC/POS USB printer requires printer_device / OS print queue name. Use mock until hardware is specified.';
  }
  return null;
}

async function printReceipt(order, settings = {}) {
  const err = missingConfig(settings);
  const text = formatReceiptText(order, settings);
  if (err) {
    console.warn('[ESC/POS] print blocked:', err);
    console.log('[ESC/POS] would print:\n' + text);
    return { ok: false, provider: 'escpos', message: err, receipt_text: text };
  }
  // Real byte stream would go here once device path is known.
  return {
    ok: false,
    provider: 'escpos',
    message:
      'ESC/POS transport not wired for this device yet. Configure hardware details or use mock / local_bridge.',
    receipt_text: text,
  };
}

async function openCashDrawer(settings = {}) {
  const err = missingConfig(settings);
  if (err) {
    return { ok: false, provider: 'escpos', message: err };
  }
  return {
    ok: false,
    provider: 'escpos',
    message: 'Cash drawer kick requires confirmed ESC/POS drawer pin mapping for your printer.',
  };
}

async function checkPrinterStatus(settings = {}) {
  const err = missingConfig(settings);
  return {
    ok: !err,
    provider: 'escpos',
    online: false,
    message: err || 'Status probe not implemented for this device binding.',
  };
}

module.exports = { printReceipt, openCashDrawer, checkPrinterStatus };
