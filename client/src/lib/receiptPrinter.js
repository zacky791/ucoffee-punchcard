/**
 * Prints receipts from the cashier phone to a Bluetooth ESC/POS printer (e.g. POS-58B).
 *
 * Modes (saved per device in localStorage):
 *  - bluetooth: Chrome Web Bluetooth, direct to BLE printers. Requires HTTPS (or localhost)
 *    and Chrome on Android / desktop. The connection is lost on page reload, so the
 *    cashier taps "Connect printer" again (browsers require a tap to pick a device).
 *  - rawbt: hands the ESC/POS bytes to the RawBT Android app, which works with
 *    classic-Bluetooth printers that Web Bluetooth cannot see.
 */

const MODE_KEY = 'ucoffee.printMode';

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

async function attach() {
  const server = device.gatt.connected ? device.gatt : await device.gatt.connect();
  characteristic = await findWritable(server);
  notify();
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
  device = picked;
  device.addEventListener('gattserverdisconnected', () => {
    characteristic = null;
    notify();
  });
  await attach();
  return getPrinterState();
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
  device?.gatt?.disconnect();
  device = null;
  characteristic = null;
  notify();
}

function toEscPos(text) {
  const ascii = String(text || '')
    .replace(/\r/g, '')
    .replace(/[^\x0A\x20-\x7E]/g, '?');
  const body = new TextEncoder().encode(ascii);
  const init = [0x1b, 0x40]; // ESC @ reset
  const feed = [0x0a, 0x0a, 0x0a, 0x0a];
  const bytes = new Uint8Array(init.length + body.length + feed.length);
  bytes.set(init, 0);
  bytes.set(body, init.length);
  bytes.set(feed, init.length + body.length);
  return bytes;
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
export async function printReceiptText(text) {
  const bytes = toEscPos(text);
  if (getPrintMode() === 'rawbt') {
    printRawBT(bytes);
    return;
  }
  await printBluetooth(bytes);
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
    await printReceiptText(printResult.receipt_text);
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
