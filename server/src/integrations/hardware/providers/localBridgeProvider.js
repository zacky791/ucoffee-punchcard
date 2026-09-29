/**
 * Local POS hardware bridge provider.
 *
 * Use when the main API is hosted remotely (e.g. Netlify) and cannot reach
 * USB/serial printers on the café cashier PC.
 *
 * Expected local bridge (run on cashier machine), configurable via:
 *   LOCAL_BRIDGE_URL=http://127.0.0.1:9100
 *
 * Bridge should expose:
 *   POST /print   { receipt_text | order }
 *   POST /drawer
 *   GET  /status
 */

const { formatReceiptText } = require('./mockProvider');

function bridgeBase(settings = {}) {
  return (
    settings.local_bridge_url ||
    process.env.LOCAL_BRIDGE_URL ||
    'http://127.0.0.1:9100'
  ).replace(/\/$/, '');
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || data.message || `Bridge error (${res.status})`);
  }
  return data;
}

async function printReceipt(order, settings = {}) {
  const text = formatReceiptText(order, settings);
  const base = bridgeBase(settings);
  try {
    const data = await postJson(`${base}/print`, {
      order_id: order.id,
      order_number: order.order_number,
      receipt_number: order.receipt_number,
      receipt_text: text,
      order,
    });
    return {
      ok: true,
      provider: 'local_bridge',
      message: data.message || 'Sent to local bridge',
      receipt_text: text,
      meta: data,
    };
  } catch (err) {
    return {
      ok: false,
      provider: 'local_bridge',
      message: `Local bridge unreachable at ${base}: ${err.message}`,
      receipt_text: text,
    };
  }
}

async function openCashDrawer(settings = {}) {
  const base = bridgeBase(settings);
  try {
    const data = await postJson(`${base}/drawer`, {});
    return {
      ok: true,
      provider: 'local_bridge',
      message: data.message || 'Drawer kick requested',
      meta: data,
    };
  } catch (err) {
    return {
      ok: false,
      provider: 'local_bridge',
      message: `Local bridge drawer failed: ${err.message}`,
    };
  }
}

async function checkPrinterStatus(settings = {}) {
  const base = bridgeBase(settings);
  try {
    const res = await fetch(`${base}/status`);
    const data = await res.json().catch(() => ({}));
    return {
      ok: res.ok,
      provider: 'local_bridge',
      online: Boolean(data.online ?? res.ok),
      message: data.message || (res.ok ? 'Bridge online' : 'Bridge offline'),
      meta: data,
    };
  } catch (err) {
    return {
      ok: false,
      provider: 'local_bridge',
      online: false,
      message: `Cannot reach bridge at ${base}: ${err.message}`,
    };
  }
}

module.exports = { printReceipt, openCashDrawer, checkPrinterStatus };
