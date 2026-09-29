/**
 * Prints receipts from the cashier phone to a Bluetooth ESC/POS printer (e.g. POS-58B).
 *
 * Modes (saved per device in localStorage):
 *  - bluetooth: Chrome Web Bluetooth, direct to BLE printers. Requires HTTPS (or localhost)
 *    and Chrome on Android / desktop. The link is kept open and re-established on its own
 *    after drops (printer sleep, out of range, tab in background). After a page reload it
 *    is restored where Chrome allows it (navigator.bluetooth.getDevices); otherwise the
 *    cashier taps "Connect printer" once, since browsers require a tap to pick a device.
 *  - rawbt: hands the ESC/POS bytes to the RawBT Android app, which works with
 *    classic-Bluetooth printers that Web Bluetooth cannot see.
 */

const MODE_KEY = 'ucoffee.printMode';
const DEVICE_KEY = 'ucoffee.printerDevice';
const RETRY_DELAYS_MS = [1000, 2000, 4000, 8000, 15000, 30000];

// Service UUIDs used by common cheap BLE thermal printers.
const PRINTER_SERVICES = [
  '000018f0-0000-1000-8000-00805f9b34fb',
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
  '49535343-fe7d-4ae5-8fa9-9fafd205e455',
  '0000ff00-0000-1000-8000-00805f9b34fb',
  '0000ffe0-0000-1000-8000-00805f9b34fb',
  '0000fee7-0000-1000-8000-00805f9b34fb',
  '0000ae30-0000-1000-8000-00805f9b34fb',
];

const CHUNK_SIZE = 100;

let device = null;
let characteristic = null;
let attaching = null;
let reconnecting = false;
let retryTimer = null;
let retryIndex = 0;
let manualDisconnect = false;
const listeners = new Set();

function notify() {
  const state = getPrinterState();
  for (const fn of listeners) fn(state);
}

export function subscribePrinter(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getPrintMode() {
  return localStorage.getItem(MODE_KEY) || 'bluetooth';
}

export function setPrintMode(mode) {
  localStorage.setItem(MODE_KEY, mode);
  notify();
}

export function isBluetoothSupported() {
  return typeof navigator !== 'undefined' && Boolean(navigator.bluetooth);
}

export function getPrinterState() {
  return {
    mode: getPrintMode(),
    supported: isBluetoothSupported(),
    connected: Boolean(device?.gatt?.connected && characteristic),
    reconnecting: reconnecting && !(device?.gatt?.connected && characteristic),
    name: device?.name || null,
  };
}

async function findWritable(server) {
  const services = await server.getPrimaryServices();
  for (const service of services) {
    const chars = await service.getCharacteristics();
    const writable = chars.find(
      (c) => c.properties.writeWithoutResponse || c.properties.write
    );
    if (writable) return writable;
  }
  throw new Error('This Bluetooth device has no printable channel. Is it the receipt printer?');
}

/** Connects (or re-uses) the GATT link. Concurrent callers share one attempt. */
function attach() {
  if (!device) return Promise.reject(new Error('No printer selected'));
  if (device.gatt.connected && characteristic) return Promise.resolve();
  if (!attaching) {
    attaching = (async () => {
      const server = device.gatt.connected ? device.gatt : await device.gatt.connect();
      characteristic = await findWritable(server);
      reconnecting = false;
      retryIndex = 0;
      clearTimeout(retryTimer);
      notify();
    })().finally(() => {
      attaching = null;
    });
  }
  return attaching;
}

function scheduleReconnect() {
  if (!device || manualDisconnect || getPrintMode() !== 'bluetooth') return;
  clearTimeout(retryTimer);
  reconnecting = true;
  notify();
  const delay = RETRY_DELAYS_MS[Math.min(retryIndex, RETRY_DELAYS_MS.length - 1)];
  retryIndex += 1;
  retryTimer = setTimeout(async () => {
    if (document.visibilityState === 'hidden') return;
    try {
      await attach();
    } catch {
      scheduleReconnect();
    }
  }, delay);
}

function onDisconnected() {
  characteristic = null;
  notify();
  scheduleReconnect();
}

function useDevice(next) {
  if (device === next) return;
  device?.removeEventListener('gattserverdisconnected', onDisconnected);
  device = next;
  device.addEventListener('gattserverdisconnected', onDisconnected);
  localStorage.setItem(DEVICE_KEY, JSON.stringify({ id: next.id, name: next.name || null }));
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !device || manualDisconnect) return;
    if (getPrinterState().connected) return;
    retryIndex = 0;
    attach().catch(scheduleReconnect);
  });
}

/** Must be called from a tap (browser shows the device picker). */
export async function connectPrinter() {
  if (!isBluetoothSupported()) {
    throw new Error(
      'This browser cannot use Bluetooth. Use Chrome on Android over https, or switch to RawBT mode.'
    );
  }
  const picked = await navigator.bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: PRINTER_SERVICES,
  });
  if (device && device !== picked) device.gatt?.disconnect();
  manualDisconnect = false;
  useDevice(picked);
  await attach();
  return getPrinterState();
}

/**
 * Silently reconnects to the printer picked earlier (e.g. after a page reload).
 * Works where Chrome remembers Bluetooth permissions; otherwise does nothing.
 */
export async function restorePrinter() {
  if (device || getPrintMode() !== 'bluetooth' || !isBluetoothSupported()) return;
  if (typeof navigator.bluetooth.getDevices !== 'function') return;
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(DEVICE_KEY) || 'null');
  } catch {
    saved = null;
  }
  if (!saved?.id) return;
  try {
    const known = await navigator.bluetooth.getDevices();
    const match = known.find((d) => d.id === saved.id);
    if (!match) return;
    manualDisconnect = false;
    useDevice(match);
    notify();
    await attach();
  } catch {
    if (device) scheduleReconnect();
  }
}

/** Re-links to the last picked printer if the link dropped; no device picker. */
export async function checkPrinterConnection() {
  if (getPrintMode() === 'bluetooth' && device && !getPrinterState().connected) {
    try {
      await attach();
    } catch {
      characteristic = null;
    }
  }
  return getPrinterState();
}

export function disconnectPrinter() {
  manualDisconnect = true;
  clearTimeout(retryTimer);
  reconnecting = false;
  device?.removeEventListener('gattserverdisconnected', onDisconnected);
  device?.gatt?.disconnect();
  device = null;
  characteristic = null;
  localStorage.removeItem(DEVICE_KEY);
  notify();
}

// ESC p 0 25 250: pulse drawer pin 2. Only works if the printer has a drawer (RJ11/DK) port.
const DRAWER_KICK = [0x1b, 0x70, 0x00, 0x19, 0xfa];

function toEscPos(text, { openDrawer = false } = {}) {
  const ascii = String(text || '')
    .replace(/\r/g, '')
    .replace(/[^\x0A\x20-\x7E]/g, '?');
  const body = new TextEncoder().encode(ascii);
  const init = [0x1b, 0x40]; // ESC @ reset
  const feed = [0x0a, 0x0a, 0x0a, 0x0a];
  const kick = openDrawer ? DRAWER_KICK : [];
  const bytes = new Uint8Array(init.length + kick.length + body.length + feed.length);
  bytes.set(init, 0);
  bytes.set(kick, init.length);
  bytes.set(body, init.length + kick.length);
  bytes.set(feed, init.length + kick.length + body.length);
  return bytes;
}

async function sendBytes(bytes) {
  if (getPrintMode() === 'rawbt') {
    printRawBT(bytes);
    return;
  }
  await printBluetooth(bytes);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function printBluetooth(bytes) {
  if (!device) {
    throw new Error('Printer not connected. Tap "Connect printer" first.');
  }
  if (!device.gatt.connected || !characteristic) await attach();
  const withoutResponse =
    characteristic.properties.writeWithoutResponse &&
    typeof characteristic.writeValueWithoutResponse === 'function';
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    const chunk = bytes.slice(i, i + CHUNK_SIZE);
    if (withoutResponse) {
      await characteristic.writeValueWithoutResponse(chunk);
      await sleep(20);
    } else {
      await characteristic.writeValue(chunk);
    }
  }
}

function printRawBT(bytes) {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  const b64 = btoa(binary);
  window.location.href = `intent:base64,${b64}#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;end;`;
}

/** Sends plain receipt text (already laid out to 32/42 columns) to the printer. */
export async function printReceiptText(text, options) {
  await sendBytes(toEscPos(text, options));
}

/** Asks the printer to pulse its cash drawer port. */
export async function kickDrawer() {
  await sendBytes(new Uint8Array([0x1b, 0x40, ...DRAWER_KICK]));
}

/**
 * Handles a hardware print result from the API. When the server's provider is
 * "phone", the receipt is printed here; otherwise the server result is returned as-is.
 */
export async function printFromResult(printResult) {
  if (!printResult?.client_print) {
    return {
      ok: Boolean(printResult?.ok),
      message: printResult?.message || (printResult?.ok ? 'Printed' : 'Print failed'),
    };
  }
  try {
    await printReceiptText(printResult.receipt_text, {
      openDrawer: Boolean(printResult.open_drawer),
    });
    const { mode, name } = getPrinterState();
    return {
      ok: true,
      message:
        mode === 'rawbt'
          ? 'Receipt sent to the RawBT app'
          : `Receipt sent to ${name || 'printer'} via Bluetooth`,
    };
  } catch (err) {
    return { ok: false, message: err.message || 'Print failed' };
  }
}
