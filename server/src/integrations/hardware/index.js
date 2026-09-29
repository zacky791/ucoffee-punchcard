/**
 * HardwareIntegrationService — provider-based cashier / printer / cash drawer layer.
 *
 * Browser APIs cannot open a physical cash drawer or silently print to ESC/POS printers.
 * Checkout calls this service on the Node backend (or via a local bridge when the API is remote).
 *
 * Providers:
 *  - mock: logs actions (default for development)
 *  - escpos: ESC/POS USB/TCP/serial when hardware details are configured
 *  - local_bridge: forwards jobs to a café-PC print bridge
 *  - cashier_api: adapter stub for an existing cashier software API (needs real docs)
 *  - phone: returns receipt text; the cashier phone prints it over Bluetooth
 */

const mockProvider = require('./providers/mockProvider');
const phoneProvider = require('./providers/phoneProvider');
const escposProvider = require('./providers/escposProvider');
const localBridgeProvider = require('./providers/localBridgeProvider');
const cashierApiProvider = require('./providers/cashierApiProvider');

const PROVIDERS = {
  mock: mockProvider,
  escpos: escposProvider,
  local_bridge: localBridgeProvider,
  cashier_api: cashierApiProvider,
  phone: phoneProvider,
};

function getProvider(name) {
  return PROVIDERS[name] || PROVIDERS.mock;
}

async function printReceipt(order, settings = {}) {
  const provider = getProvider(settings.hardware_provider || 'mock');
  return provider.printReceipt(order, settings);
}

async function openCashDrawer(settings = {}) {
  if (settings.cash_drawer_enabled === false) {
    return { ok: true, skipped: true, message: 'Cash drawer disabled in settings' };
  }
  const provider = getProvider(settings.hardware_provider || 'mock');
  return provider.openCashDrawer(settings);
}

async function checkPrinterStatus(settings = {}) {
  const provider = getProvider(settings.hardware_provider || 'mock');
  return provider.checkPrinterStatus(settings);
}

async function retryPrint(order, settings = {}) {
  return printReceipt(order, { ...settings, cash_drawer_enabled: false });
}

async function afterPayment(order, settings = {}) {
  const isCash = String(order.payment?.method || '').toLowerCase() === 'cash';
  const effective = isCash ? settings : { ...settings, cash_drawer_enabled: false };
  const printResult = await printReceipt(order, effective);
  let drawerResult = { ok: true, skipped: true };
  if (!isCash) {
    drawerResult = { ok: true, skipped: true, message: 'Drawer only opens for cash payments' };
  } else if (settings.cash_drawer_enabled !== false) {
    drawerResult = await openCashDrawer(settings);
  }
  return { printResult, drawerResult };
}

module.exports = {
  printReceipt,
  openCashDrawer,
  checkPrinterStatus,
  retryPrint,
  afterPayment,
  getProvider,
  PROVIDERS: Object.keys(PROVIDERS),
};
