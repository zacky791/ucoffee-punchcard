/** Hourly rates in RM. Match by full or first name (lowercase). */
export const HOURLY_RATES_RM = {
  faqih: 8,
  nadhirah: 8,
  nadirah: 8,
};

export function normalizeNameKey(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function hourlyRateRm(name) {
  const key = normalizeNameKey(name);
  if (Object.prototype.hasOwnProperty.call(HOURLY_RATES_RM, key)) {
    return HOURLY_RATES_RM[key];
  }
  const first = key.split(' ')[0];
  if (Object.prototype.hasOwnProperty.call(HOURLY_RATES_RM, first)) {
    return HOURLY_RATES_RM[first];
  }
  return null;
}

export function calcPayRm(hours, rate) {
  if (rate == null || hours == null) return null;
  return Math.round(Number(hours) * Number(rate) * 100) / 100;
}

export function formatRm(amount) {
  if (amount == null || Number.isNaN(Number(amount))) return '—';
  return `RM ${Number(amount).toFixed(2)}`;
}

export const KITCHEN_ROLES = new Set([
  'head_chef',
  'assistant_chef',
  'assistant_manager',
  'manager',
  'kitchen',
]);

export function isKitchenRole(role) {
  return KITCHEN_ROLES.has(role);
}
