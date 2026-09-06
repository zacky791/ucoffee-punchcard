import { useEffect, useState } from 'react';

export function useClock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return now;
}

export function formatTime(date) {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  }).format(date instanceof Date ? date : new Date(date));
}

export function formatDate(date) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(date instanceof Date ? date : new Date(date));
}

export function formatShort(date) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date instanceof Date ? date : new Date(date));
}

export function roleLabel(role) {
  const labels = {
    head_chef: 'Head chef',
    assistant_chef: 'Assistant chef',
    barista: 'Barista',
    kitchen: 'Kitchen',
    shift_lead: 'Shift lead',
    manager: 'Manager',
  };
  if (labels[role]) return labels[role];
  return String(role || 'barista')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
