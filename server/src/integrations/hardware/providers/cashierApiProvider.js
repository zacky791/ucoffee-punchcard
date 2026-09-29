/**
 * Existing cashier / register software API adapter (stub).
 *
 * Do not invent vendor endpoints. Set CASHIER_API_URL + CASHIER_API_KEY and
 * map fields once the café's cashier API documentation is available.
 * Retries must be idempotent (pass a client_request_id / order id).
 */

const { formatReceiptText } = require('./mockProvider');

function apiConfig(settings = {}) {
  return {
    url: (settings.cashier_api_url || process.env.CASHIER_API_URL || '').replace(/\/$/, ''),
    key: settings.cashier_api_key || process.env.CASHIER_API_KEY || '',
  };
}

async function printReceipt(order, settings = {}) {
  const text = formatReceiptText(order, settings);
  const { url, key } = apiConfig(settings);
  if (!url) {
    return {
      ok: false,
      provider: 'cashier_api',
      message:
        'Cashier API URL not configured. Provide documented endpoints before enabling this provider.',
      receipt_text: text,
    };
  }
  try {
    const res = await fetch(`${url}/print-receipt`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(key ? { Authorization: `Bearer ${key}` } : {}),
      },
      body: JSON.stringify({
        client_request_id: `print-${order.id}-${order.receipt_number || 'r'}`,
        order_id: order.id,
        order_number: order.order_number,
        receipt_text: text,
        order,
      }),
    });
    const data = await res.json().catch(() => ({}));
    return {
      ok: res.ok,
      provider: 'cashier_api',
      message: data.message || (res.ok ? 'Print requested' : `API error (${res.status})`),
      receipt_text: text,
      meta: data,
    };
  } catch (err) {
    return {
      ok: false,
      provider: 'cashier_api',
      message: err.message,
      receipt_text: text,
    };
  }
}

async function openCashDrawer(settings = {}) {
  const { url, key } = apiConfig(settings);
  if (!url) {
    return {
      ok: false,
      provider: 'cashier_api',
      message: 'Cashier API URL not configured.',
    };
  }
  try {
    const res = await fetch(`${url}/open-drawer`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(key ? { Authorization: `Bearer ${key}` } : {}),
      },
      body: JSON.stringify({ client_request_id: `drawer-${Date.now()}` }),
    });
    const data = await res.json().catch(() => ({}));
    return {
      ok: res.ok,
      provider: 'cashier_api',
      message: data.message || (res.ok ? 'Drawer requested' : `API error (${res.status})`),
      meta: data,
    };
  } catch (err) {
    return { ok: false, provider: 'cashier_api', message: err.message };
  }
}

async function checkPrinterStatus(settings = {}) {
  const { url, key } = apiConfig(settings);
  if (!url) {
    return {
      ok: false,
      provider: 'cashier_api',
      online: false,
      message: 'Cashier API URL not configured.',
    };
  }
  try {
    const res = await fetch(`${url}/status`, {
      headers: key ? { Authorization: `Bearer ${key}` } : {},
    });
    const data = await res.json().catch(() => ({}));
    return {
      ok: res.ok,
      provider: 'cashier_api',
      online: Boolean(data.online ?? res.ok),
      message: data.message || 'Status checked',
      meta: data,
    };
  } catch (err) {
    return {
      ok: false,
      provider: 'cashier_api',
      online: false,
      message: err.message,
    };
  }
}

module.exports = { printReceipt, openCashDrawer, checkPrinterStatus };
