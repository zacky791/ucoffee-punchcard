function formatReceiptText(order, settings = {}) {
  const width = Number(settings.receipt_width_mm) === 58 ? 32 : 42;
  const line = (ch = '-') => ch.repeat(width);
  const money = (n) =>
    `${settings.currency || 'MYR'} ${Number(n || 0).toFixed(2)}`;
  const rows = [];

  rows.push(center(settings.cafe_name || 'U Coffee', width));
  if (settings.address) rows.push(center(settings.address, width));
  if (settings.phone) rows.push(center(settings.phone, width));
  rows.push(line());
  rows.push(`Receipt: ${order.receipt_number || '-'}`);
  rows.push(`Order:   ${order.order_number}`);
  rows.push(`Date:    ${formatDate(order.paid_at || order.created_at || new Date())}`);
  rows.push(`Type:    ${order.order_type || '-'}`);
  if (order.table_label) rows.push(`Table:   ${order.table_label}`);
  rows.push(line());

  for (const item of order.items || []) {
    rows.push(`${item.quantity}x ${item.product_name}`);
    for (const mod of item.modifiers || []) {
      rows.push(`  + ${mod.name}${mod.price_delta ? ` (${money(mod.price_delta)})` : ''}`);
    }
    if (item.notes) rows.push(`  note: ${item.notes}`);
    rows.push(padRight(money(item.line_total), width));
  }

  rows.push(line());
  rows.push(pair('Subtotal', money(order.subtotal), width));
  if (Number(order.discount) > 0) rows.push(pair('Discount', `-${money(order.discount)}`, width));
  if (Number(order.tax_amount) > 0) rows.push(pair('Tax', money(order.tax_amount), width));
  if (Number(order.service_charge) > 0) {
    rows.push(pair('Service', money(order.service_charge), width));
  }
  if (Number(order.rounding)) rows.push(pair('Rounding', money(order.rounding), width));
  rows.push(pair('TOTAL', money(order.grand_total), width));
  rows.push(line());

  const payment = order.payment || {};
  rows.push(`Paid: ${payment.method || '-'}`);
  if (payment.amount_received != null) {
    rows.push(pair('Received', money(payment.amount_received), width));
    rows.push(pair('Change', money(payment.change_due || 0), width));
  }
  rows.push(line());
  if (settings.receipt_footer) rows.push(center(settings.receipt_footer, width));
  if (settings.feedback_qr_url) {
    rows.push(center(`[QR] ${settings.feedback_qr_url}`, width));
  }
  rows.push('');
  return rows.join('\n');
}

function formatDate(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: process.env.CAFE_TZ || 'Asia/Kuala_Lumpur',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
}

function center(text, width) {
  const s = String(text || '');
  if (s.length >= width) return s.slice(0, width);
  const pad = Math.floor((width - s.length) / 2);
  return ' '.repeat(pad) + s;
}

function pair(label, value, width) {
  const left = String(label);
  const right = String(value);
  const spaces = Math.max(1, width - left.length - right.length);
  return left + ' '.repeat(spaces) + right;
}

function padRight(value, width) {
  const s = String(value);
  return ' '.repeat(Math.max(0, width - s.length)) + s;
}

async function printReceipt(order, settings = {}) {
  const text = formatReceiptText(order, settings);
  console.log('\n[MOCK PRINTER] ——— receipt ———\n' + text + '\n———————————————\n');
  return {
    ok: true,
    provider: 'mock',
    message: 'Mock receipt printed to server logs',
    receipt_text: text,
  };
}

async function openCashDrawer(_settings = {}) {
  console.log('[MOCK CASH DRAWER] kick pulse sent');
  return {
    ok: true,
    provider: 'mock',
    message: 'Mock cash drawer opened',
  };
}

async function checkPrinterStatus(_settings = {}) {
  return {
    ok: true,
    provider: 'mock',
    online: true,
    message: 'Mock mode: simulated printer, no real device connected',
  };
}

module.exports = {
  printReceipt,
  openCashDrawer,
  checkPrinterStatus,
  formatReceiptText,
};
