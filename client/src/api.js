// Empty = use Vite proxy (/api → localhost:3001). Override with VITE_API_URL if needed.
const API_BASE = import.meta.env.VITE_API_URL ?? '';

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

export const api = {
  health: () => request('/api/health'),
  getStaff: () => request('/api/staff'),
  createStaff: (body) =>
    request('/api/staff', { method: 'POST', body: JSON.stringify(body) }),
  updateStaff: (id, body) =>
    request(`/api/staff/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  punch: (body) =>
    request('/api/punch', { method: 'POST', body: JSON.stringify(body) }),
  getPunches: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/api/punches${qs ? `?${qs}` : ''}`);
  },
  getToday: () => request('/api/punches/today'),
};
