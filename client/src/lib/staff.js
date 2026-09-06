/** Local staff photos by normalized name */
export const STAFF_PHOTOS = {
  haziq: '/staff/haziq.png',
};

export function staffPhoto(name) {
  const key = String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  return STAFF_PHOTOS[key] || null;
}

export function initials(name) {
  return String(name)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('');
}
