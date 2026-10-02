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

// Many cheap BLE printers keep the default 23-byte MTU, so only 20 bytes fit per write.
const CHUNK_SIZE = 20;
const WRITE_ATTEMPTS = 3;

let device = null;
let characteristic = null;
let attaching = null;
let reconnecting = false;
let retryTimer = null;
let retryIndex = 0;
let manualDisconnect = false;
let lastError = null;
const listeners = new Set();

/**
 * Error shown to the cashier. `message` is complete on its own (what happened, what to do,
 * and a short code); `code` and `detail` (the raw browser error) help when troubleshooting.
 */
export class PrinterError extends Error {
  constructor(code, problem, fix, cause) {
    const detail = cause ? `${cause.name || 'Error'}: ${cause.message || 'no details'}` : '';
    super(`${problem} Try: ${fix} (Code ${code}${detail ? ` · ${detail}` : ''})`);
    this.name = 'PrinterError';
    this.code = code;
    this.problem = problem;
    this.fix = fix;
    this.detail = detail;
    this.cause = cause;
  }
}

const CHECK_PRINTER =
  'make sure the printer is switched on, has paper, and is within 2 metres of this phone';

/** Turns a raw Web Bluetooth error into a PrinterError for the step that failed. */
function describeError(step, err) {
  if (err instanceof PrinterError) return err;
  const name = err?.name;
  const raw = String(err?.message || '').toLowerCase();
  const printer = device?.name ? `"${device.name}"` : 'The printer';

  if (name === 'SecurityError') {
    return new PrinterError(
      'BT-SECURITY',
      'The browser blocked Bluetooth for this page.',
      'open the app over https (not http) in Chrome, and allow Bluetooth when asked.',
      err
    );
  }
  if (name === 'NotAllowedError') {
    return new PrinterError(
      'BT-PERMISSION',
      'Bluetooth permission was refused or the request did not come from a tap.',
      'tap "Connect printer" again and allow Bluetooth. Check Android Settings > Apps > Chrome > Permissions > Nearby devices.',
      err
    );
  }
  if (name === 'InvalidStateError' || raw.includes('in progress')) {
    return new PrinterError(
      'BT-BUSY',
      'The printer was still busy with the previous job.',
      'wait a few seconds and print again.',
      err
    );
  }

  if (step === 'pick') {
    return new PrinterError(
      'BT-PICK',
      'Could not open the Bluetooth device list.',
      'turn on Bluetooth and Location on this phone, then tap "Connect printer" again.',
      err
    );
  }
  if (step === 'connect') {
    return new PrinterError(
      'BT-CONNECT',
      `${printer} did not answer the connection request.`,
      `${CHECK_PRINTER}. If another phone or tablet is connected to it, disconnect that one first, then tap "Connect printer".`,
      err
    );
  }
  if (step === 'channel') {
    return new PrinterError(
      'BT-CHANNEL',
      `Connected to ${printer}, but it has no print channel this app recognises.`,
      'check you picked the receipt printer (not headphones or a watch). If it is the right printer, switch Print mode to RawBT in Settings.',
      err
    );
  }
  if (raw.includes('disconnected') || !device?.gatt?.connected) {
    return new PrinterError(
      'BT-DROPPED',
      `${printer} disconnected while the receipt was being sent.`,
      `${CHECK_PRINTER}, then print again. Part of the receipt may have printed.`,
      err
    );
  }
  return new PrinterError(
    'BT-SEND',
    `${printer} is connected but rejected the receipt data.`,
    `turn the printer off and on, tap "Connect printer", then print again. ${CHECK_PRINTER[0].toUpperCase()}${CHECK_PRINTER.slice(1)}.`,
    err
  );
}

function recordError(err) {
  lastError = err;
  console.warn(`[printer] ${err.code}`, {
    problem: err.problem,
    fix: err.fix,
    detail: err.detail,
    device: device ? { name: device.name, id: device.id } : null,
    mode: getPrintMode(),
  });
  notify();
  return err;
}

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
    lastError,
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
  throw describeError('channel', new Error('No writable characteristic found'));
}

/** Connects (or re-uses) the GATT link. Concurrent callers share one attempt. */
function attach() {
  if (!device) return Promise.reject(notConnectedError());
  if (device.gatt.connected && characteristic) return Promise.resolve();
  if (!attaching) {
    attaching = (async () => {
      let server = device.gatt;
      if (!server.connected) {
        try {
          server = await device.gatt.connect();
        } catch (err) {
          throw describeError('connect', err);
        }
      }
      try {
        characteristic = await findWritable(server);
      } catch (err) {
        throw describeError('channel', err);
      }
      lastError = null;
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

function notConnectedError() {
  return new PrinterError(
    'BT-NOT-PAIRED',
    'No printer is connected on this phone yet.',
    'tap "Connect printer" and pick your receipt printer from the list.'
  );
}

/** Must be called from a tap (browser shows the device picker). */
export async function connectPrinter() {
  if (!isBluetoothSupported()) {
    throw recordError(
      new PrinterError(
        'BT-UNSUPPORTED',
        'This browser cannot use Bluetooth.',
        'open the app in Chrome on Android over https, or switch Print mode to RawBT in Settings.'
      )
    );
  }
  let picked;
  try {
    picked = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: PRINTER_SERVICES,
    });
  } catch (err) {
    // NotFoundError here means the cashier closed the picker without choosing.
    if (err?.name === 'NotFoundError') throw err;
    throw recordError(describeError('pick', err));
  }
  if (device && device !== picked) device.gatt?.disconnect();
  manualDisconnect = false;
  useDevice(picked);
  try {
    await attach();
  } catch (err) {
    throw recordError(describeError('connect', err));
  }
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
  } catch (err) {
    recordError(describeError('connect', err));
    if (device) scheduleReconnect();
  }
}

/** Re-links to the last picked printer if the link dropped; no device picker. */
export async function checkPrinterConnection() {
  if (getPrintMode() === 'bluetooth' && device && !getPrinterState().connected) {
    try {
      await attach();
    } catch (err) {
      characteristic = null;
      recordError(describeError('connect', err));
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
  lastError = null;
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

async function writeChunk(chunk) {
  if (
    characteristic.properties.writeWithoutResponse &&
    typeof characteristic.writeValueWithoutResponse === 'function'
  ) {
    await characteristic.writeValueWithoutResponse(chunk);
    await sleep(20);
  } else {
    await characteristic.writeValue(chunk);
  }
}

/** Drops a stale GATT link so the next attach() starts from a fresh connection. */
async function resetLink() {
  characteristic = null;
  device?.gatt?.disconnect();
  await sleep(500);
}

// Web Bluetooth rejects overlapping GATT operations, so print jobs run one at a time.
let printQueue = Promise.resolve();

function printBluetooth(bytes) {
  const job = printQueue.then(() => printBluetoothNow(bytes));
  printQueue = job.catch(() => {});
  return job;
}

async function printBluetoothNow(bytes) {
  if (!device) throw recordError(notConnectedError());
  let offset = 0;
  let failures = 0;
  while (offset < bytes.length) {
    try {
      if (!device.gatt.connected || !characteristic) await attach();
      await writeChunk(bytes.slice(offset, offset + CHUNK_SIZE));
      offset += CHUNK_SIZE;
      failures = 0;
    } catch (err) {
      failures += 1;
      if (failures >= WRITE_ATTEMPTS) throw recordError(describeError('send', err));
      await resetLink();
    }
  }
  lastError = null;
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
    return { ok: false, message: err.message || 'Print failed', code: err.code || null };
  }
}
