import { createClient } from '@supabase/supabase-js';
import { CAFE_ZONE, checkZone } from './lib/geofence';

const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL ||
  import.meta.env.VITE_SUPABASE_PROJECT_URL ||
  '';
const supabaseKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  '';

// Prefer Render/API when VITE_API_URL is set; otherwise use Supabase direct or Vite proxy.
const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
const hasSupabase = Boolean(supabaseUrl && supabaseKey);
const useDirectSupabase = hasSupabase && !API_BASE;

const supabase = useDirectSupabase
  ? createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

const PUNCH_SELECT =
  'id, staff_id, type, punched_at, note, latitude, longitude, accuracy, location_label, staff:staff_id(id, name, role)';

const ROLE_ORDER = {
  head_chef: 1,
  manager: 2,
  assistant_manager: 3,
  assistant_chef: 4,
  kitchen: 5,
  shift_lead: 6,
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

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(
      res.ok
        ? 'API returned non-JSON (check Netlify /api redirects)'
        : `Request failed (${res.status})`
    );
  }
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

  const zone = checkZone(latitude, longitude, CAFE_ZONE);
  if (!zone.within) {
    throw new Error(
      `Outside safe area (${zone.distance_m}m away). Must be within ${CAFE_ZONE.radiusMeters}m of U Coffee.`
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

async function getHoursDirect() {
  requireSupabase();
  const { data, error } = await supabase
    .from('cafe_hours')
    .select('day_of_week, is_closed, open_time, close_time')
    .order('day_of_week');
  if (error) throw new Error(error.message);
  return data || [];
}

async function saveHoursDirect(hours) {
  requireSupabase();
  const payload = hours.map((row) => ({
    day_of_week: Number(row.day_of_week),
    is_closed: Boolean(row.is_closed),
    open_time: row.is_closed ? null : row.open_time || null,
    close_time: row.is_closed ? null : row.close_time || null,
  }));
  const { data, error } = await supabase
    .from('cafe_hours')
    .upsert(payload, { onConflict: 'day_of_week' })
    .select('day_of_week, is_closed, open_time, close_time')
    .order('day_of_week');
  if (error) throw new Error(error.message);
  return data || [];
}

async function getRosterDirect(params = {}) {
  requireSupabase();
  let query = supabase
    .from('roster_assignments')
    .select(
      'id, week_start, day_of_week, staff_id, section, staff:staff_id(id, name, role)'
    )
    .order('day_of_week');
  if (params.week_start) query = query.eq('week_start', params.week_start);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data || [];
}

async function saveRosterDayDirect(day, body) {
  requireSupabase();
  const weekStart = body?.week_start;
  if (!weekStart) throw new Error('week_start is required');

  const kitchen = Array.isArray(body?.kitchen) ? body.kitchen : [];
  const barista = Array.isArray(body?.barista) ? body.barista : [];

  const { error: delError } = await supabase
    .from('roster_assignments')
    .delete()
    .eq('day_of_week', day)
    .eq('week_start', weekStart);
  if (delError) throw new Error(delError.message);

  const rows = [
    ...kitchen.map((staff_id) => ({
      week_start: weekStart,
      day_of_week: Number(day),
      staff_id,
      section: 'kitchen',
    })),
    ...barista.map((staff_id) => ({
      week_start: weekStart,
      day_of_week: Number(day),
      staff_id,
      section: 'barista',
    })),
  ];

  if (rows.length) {
    const { error: insError } = await supabase
      .from('roster_assignments')
      .insert(rows);
    if (insError) throw new Error(insError.message);
  }

  const { data, error } = await supabase
    .from('roster_assignments')
    .select(
      'id, week_start, day_of_week, staff_id, section, staff:staff_id(id, name, role)'
    )
    .eq('day_of_week', day)
    .eq('week_start', weekStart);
  if (error) throw new Error(error.message);
  return data || [];
}

async function getPerformanceDirect(params = {}) {
  requireSupabase();
  const weekStart = String(params.week_start || '');
  let start;
  let end = null;
  let days;

  if (/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
    start = new Date(`${weekStart}T00:00:00`);
    if (Number.isNaN(start.getTime())) throw new Error('Invalid week_start');
    end = new Date(start);
    end.setDate(end.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    days = 7;
  } else {
    days = Math.min(Math.max(Number(params.days) || 30, 1), 90);
    start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (days - 1));
  }

  const { data: staff, error: staffError } = await supabase
    .from('staff')
    .select('id, name, role, active')
    .eq('active', true);
  if (staffError) throw new Error(staffError.message);

  let punchQuery = supabase
    .from('punches')
    .select(PUNCH_SELECT)
    .gte('punched_at', start.toISOString())
    .order('punched_at', { ascending: true });
  if (end) punchQuery = punchQuery.lte('punched_at', end.toISOString());

  const { data: punches, error: punchError } = await punchQuery;
  if (punchError) throw new Error(punchError.message);

  return {
    days,
    week_start: weekStart || null,
    from: start.toISOString(),
    to: end ? end.toISOString() : null,
    punches: punches || [],
    staff: staff || [],
  };
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

export const api = {
  health: async () => {
    if (useDirectSupabase) return { ok: true, service: 'u-coffee-direct', db: true };
    return request('/api/health');
  },
  getStaff: async () =>
    asArray(await (useDirectSupabase ? getStaffDirect() : request('/api/staff'))),
  createStaff: (body) =>
    useDirectSupabase
      ? createStaffDirect(body)
      : request('/api/staff', { method: 'POST', body: JSON.stringify(body) }),
  updateStaff: (id, body) =>
    useDirectSupabase
      ? updateStaffDirect(id, body)
      : request(`/api/staff/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        }),
  punch: (body) =>
    useDirectSupabase
      ? punchDirect(body)
      : request('/api/punch', { method: 'POST', body: JSON.stringify(body) }),
  getPunches: async (params = {}) => {
    if (useDirectSupabase) return asArray(await getPunchesDirect(params));
    const qs = new URLSearchParams(params).toString();
    return asArray(await request(`/api/punches${qs ? `?${qs}` : ''}`));
  },
  getToday: async () =>
    asArray(
      await (useDirectSupabase ? getTodayDirect() : request('/api/punches/today'))
    ),
  getHours: async () =>
    asArray(await (useDirectSupabase ? getHoursDirect() : request('/api/hours'))),
  saveHours: (hours) =>
    useDirectSupabase
      ? saveHoursDirect(hours)
      : request('/api/hours', {
          method: 'PUT',
          body: JSON.stringify(hours),
        }),
  getRoster: async (params = {}) => {
    if (useDirectSupabase) return asArray(await getRosterDirect(params));
    const qs = new URLSearchParams(params).toString();
    return asArray(await request(`/api/roster${qs ? `?${qs}` : ''}`));
  },
  saveRosterDay: (day, body) =>
    useDirectSupabase
      ? saveRosterDayDirect(day, body)
      : request(`/api/roster/${day}`, {
          method: 'PUT',
          body: JSON.stringify(body),
        }),
  getPerformance: async (params = {}) => {
    const data = await (useDirectSupabase
      ? getPerformanceDirect(params)
      : request(
          `/api/performance${
            new URLSearchParams(params).toString()
              ? `?${new URLSearchParams(params)}`
              : ''
          }`
        ));
    return {
      ...(data && typeof data === 'object' ? data : {}),
      punches: asArray(data?.punches),
      staff: asArray(data?.staff),
    };
  },
};
