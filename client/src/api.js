import { createClient } from '@supabase/supabase-js';

const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL ||
  import.meta.env.VITE_SUPABASE_PROJECT_URL ||
  '';
const supabaseKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  '';

const hasSupabase = Boolean(supabaseUrl && supabaseKey);

const supabase = hasSupabase
  ? createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

const PUNCH_SELECT =
  'id, staff_id, type, punched_at, note, latitude, longitude, accuracy, location_label, staff:staff_id(id, name, role)';

const ROLE_ORDER = {
  head_chef: 1,
  assistant_chef: 2,
  kitchen: 3,
  shift_lead: 4,
  manager: 5,
  barista: 10,
};

function sortStaff(list) {
  return [...list].sort((a, b) => {
    const ra = ROLE_ORDER[a.role] ?? 50;
    const rb = ROLE_ORDER[b.role] ?? 50;
    if (ra !== rb) return ra - rb;
    return String(a.name).localeCompare(String(b.name));
  });
}

function requireSupabase() {
  if (!supabase) {
    throw new Error(
      'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.'
    );
  }
}

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

async function getStaffDirect() {
  requireSupabase();
  const { data: staff, error } = await supabase
    .from('staff')
    .select('id, name, role, active, created_at')
    .eq('active', true);
  if (error) throw new Error(error.message);

  const { data: statusRows, error: statusError } = await supabase
    .from('staff_status')
    .select('staff_id, last_punch_type, last_punched_at, is_clocked_in');
  if (statusError) throw new Error(statusError.message);

  const statusMap = Object.fromEntries(
    (statusRows || []).map((row) => [row.staff_id, row])
  );

  return sortStaff(
    (staff || []).map((person) => ({
      ...person,
      is_clocked_in: statusMap[person.id]?.is_clocked_in ?? false,
      last_punch_type: statusMap[person.id]?.last_punch_type ?? null,
      last_punched_at: statusMap[person.id]?.last_punched_at ?? null,
    }))
  );
}

async function createStaffDirect(body) {
  requireSupabase();
  const name = body?.name?.trim();
  if (!name) throw new Error('Name is required');
  const { data, error } = await supabase
    .from('staff')
    .insert({
      name,
      pin: '0000',
      role: String(body.role || 'barista').trim() || 'barista',
    })
    .select('id, name, role, active, created_at')
    .single();
  if (error) throw new Error(error.message);
  return data;
}

async function updateStaffDirect(id, body) {
  requireSupabase();
  const updates = {};
  if (typeof body?.active === 'boolean') updates.active = body.active;
  if (body?.name) updates.name = String(body.name).trim();
  if (body?.role) updates.role = String(body.role).trim();
  if (!Object.keys(updates).length) throw new Error('No updates provided');

  const { data, error } = await supabase
    .from('staff')
    .update(updates)
    .eq('id', id)
    .select('id, name, role, active, created_at')
    .single();
  if (error) throw new Error(error.message);
  return data;
}

async function punchDirect(body) {
  requireSupabase();
  const { staff_id, note, latitude, longitude, accuracy, location_label } =
    body || {};
  if (!staff_id) throw new Error('staff_id is required');
  if (latitude == null || longitude == null) {
    throw new Error(
      'Location is required to clock in or out. Please allow GPS access.'
    );
  }

  const { data: person, error: staffError } = await supabase
    .from('staff')
    .select('id, name, active')
    .eq('id', staff_id)
    .single();
  if (staffError || !person) throw new Error('Staff member not found');
  if (!person.active) throw new Error('Staff member is inactive');

  const { data: lastPunch, error: lastError } = await supabase
    .from('punches')
    .select('type, punched_at')
    .eq('staff_id', staff_id)
    .order('punched_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastError) throw new Error(lastError.message);

  const nextType = lastPunch?.type === 'in' ? 'out' : 'in';

  const { data: punch, error: punchError } = await supabase
    .from('punches')
    .insert({
      staff_id,
      type: nextType,
      note: note ? String(note).slice(0, 200) : null,
      latitude: Number(latitude),
      longitude: Number(longitude),
      accuracy: accuracy == null ? null : Number(accuracy),
      location_label: location_label
        ? String(location_label).slice(0, 200)
        : null,
    })
    .select(PUNCH_SELECT)
    .single();
  if (punchError) throw new Error(punchError.message);

  return {
    punch,
    staff_name: person.name,
    message:
      nextType === 'in'
        ? `${person.name} clocked in`
        : `${person.name} clocked out`,
  };
}

async function getPunchesDirect(params = {}) {
  requireSupabase();
  const limit = Math.min(Number(params.limit) || 50, 500);
  let query = supabase
    .from('punches')
    .select(PUNCH_SELECT)
    .order('punched_at', { ascending: false })
    .limit(limit);

  if (params.staff_id) query = query.eq('staff_id', params.staff_id);

  if (params.date) {
    const start = new Date(`${params.date}T00:00:00`);
    const end = new Date(`${params.date}T23:59:59.999`);
    if (!Number.isNaN(start.getTime())) {
      query = query
        .gte('punched_at', start.toISOString())
        .lte('punched_at', end.toISOString());
    }
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data || [];
}

async function getTodayDirect() {
  requireSupabase();
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);

  const { data, error } = await supabase
    .from('punches')
    .select(PUNCH_SELECT)
    .gte('punched_at', start.toISOString())
    .lte('punched_at', end.toISOString())
    .order('punched_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}

export const api = {
  health: async () => {
    if (hasSupabase) return { ok: true, service: 'u-coffee-direct', db: true };
    return request('/api/health');
  },
  getStaff: () => (hasSupabase ? getStaffDirect() : request('/api/staff')),
  createStaff: (body) =>
    hasSupabase
      ? createStaffDirect(body)
      : request('/api/staff', { method: 'POST', body: JSON.stringify(body) }),
  updateStaff: (id, body) =>
    hasSupabase
      ? updateStaffDirect(id, body)
      : request(`/api/staff/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        }),
  punch: (body) =>
    hasSupabase
      ? punchDirect(body)
      : request('/api/punch', { method: 'POST', body: JSON.stringify(body) }),
  getPunches: (params = {}) => {
    if (hasSupabase) return getPunchesDirect(params);
    const qs = new URLSearchParams(params).toString();
    return request(`/api/punches${qs ? `?${qs}` : ''}`);
  },
  getToday: () =>
    hasSupabase ? getTodayDirect() : request('/api/punches/today'),
};
