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
  };
}

async function openCashDrawer() {
  return {
    ok: true,
    provider: 'phone',
    skipped: true,
    message: 'No cash drawer connected to the phone printer',
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
