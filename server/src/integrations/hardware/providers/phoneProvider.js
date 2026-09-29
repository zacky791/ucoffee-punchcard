/**
 * Cashier phone provider.
 *
 * The server cannot reach a Bluetooth printer next to the cashier, so it only
 * formats the receipt. The POS screen on the phone receives `receipt_text`
 * (with client_print: true) and sends it to the printer via Web Bluetooth or RawBT.
 */

const { formatReceiptText } = require('./mockProvider');

async function printReceipt(order, settings = {}) {
  return {
    ok: true,
    provider: 'phone',
    client_print: true,
    message: 'Receipt sent to cashier phone for printing',
    receipt_text: formatReceiptText(order, settings),
    open_drawer: settings.cash_drawer_enabled !== false,
  };
}

async function openCashDrawer() {
  return {
    ok: true,
    provider: 'phone',
    client_drawer: true,
    message: 'Drawer command sent to cashier phone',
  };
}

async function checkPrinterStatus() {
  return {
    ok: true,
    provider: 'phone',
    online: null,
    message: 'Printing happens on the cashier phone. Use "Connect printer" on that phone.',
  };
}

module.exports = { printReceipt, openCashDrawer, checkPrinterStatus };
