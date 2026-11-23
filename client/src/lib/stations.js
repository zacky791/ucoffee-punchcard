export const INV_STATIONS = [
  { id: 'barista', label: 'Barista' },
  { id: 'kitchen', label: 'Kitchen' },
  { id: 'bakery', label: 'Bakery' },
];

export function normalizeStation(value) {
  const station = String(value || 'barista').trim().toLowerCase();
  return station === 'kitchen' || station === 'bakery' ? station : 'barista';
}

export function stationLabel(value) {
  const id = normalizeStation(value);
  return INV_STATIONS.find((s) => s.id === id)?.label || 'Barista';
}

export function groupByStation(items = [], getItem = (i) => i) {
  const groups = { barista: [], kitchen: [], bakery: [] };
  for (const raw of items) {
    const item = getItem(raw) || raw;
    groups[normalizeStation(item.station)].push(
      item === raw ? raw : { ...item, ...raw }
    );
  }
  return groups;
}
