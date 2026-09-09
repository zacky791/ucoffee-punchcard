const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
//location map
const app = express();

app.use(cors({ origin: true }));
app.use(express.json());

const supabaseUrl =
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  process.env.VITE_SUPABASE_PROJECT_URL;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const isPlaceholder =
  !supabaseUrl ||
  !supabaseKey ||
  /YOUR_PROJECT_REF|your_project_ref|your_service_role_key|your_anon_key/i.test(
    `${supabaseUrl}\n${supabaseKey}`
  );

if (isPlaceholder) {
  console.warn(
    '\n⚠️  Supabase is not configured yet.\n' +
      '   Edit server/.env with SUPABASE_URL + SUPABASE_ANON_KEY\n'
  );
} else if (
  !process.env.SUPABASE_SERVICE_ROLE_KEY &&
  (process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY)
) {
  console.log(
    'Using publishable/anon key — make sure you ran supabase/rls-publishable.sql'
  );
}

const supabase = !isPlaceholder
  ? createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

const PUNCH_SELECT =
  'id, staff_id, type, punched_at, note, latitude, longitude, accuracy, location_label, staff:staff_id(id, name, role)';

const CAFE_ZONE = {
  // Persiaran Panglima Hitam, Setia Alam Impian, Section 35, Shah Alam
  latitude: Number(process.env.CAFE_LAT) || 3.028353,
  longitude: Number(process.env.CAFE_LNG) || 101.51512,
  radiusMeters: Number(process.env.CAFE_RADIUS_M) || 500,
};

function distanceMeters(lat1, lng1, lat2, lng2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(a)));
}

function assertInsideCafeZone(latitude, longitude) {
  const distance_m = Math.round(
    distanceMeters(
      CAFE_ZONE.latitude,
      CAFE_ZONE.longitude,
      Number(latitude),
      Number(longitude)
    )
  );
  if (distance_m > CAFE_ZONE.radiusMeters) {
    return {
      error: `Outside safe area (${distance_m}m away). Must be within ${CAFE_ZONE.radiusMeters}m of U Coffee.`,
    };
  }
  return { distance_m };
}

const ROLE_ORDER = {
  head_chef: 1,
  assistant_chef: 2,
  kitchen: 3,
  shift_lead: 4,
  manager: 5,
  barista: 10,
};

function requireDb(req, res, next) {
  if (!supabase) {
    return res.status(503).json({
      error:
        'Database not configured. On Netlify set SUPABASE_URL and SUPABASE_ANON_KEY (Site settings → Environment variables), then redeploy.',
    });
  }
  next();
}

function sortStaff(list) {
  return [...list].sort((a, b) => {
    const ra = ROLE_ORDER[a.role] ?? 50;
    const rb = ROLE_ORDER[b.role] ?? 50;
    if (ra !== rb) return ra - rb;
    return String(a.name).localeCompare(String(b.name));
  });
}

function parseLocation(body = {}) {
  const latitude =
    body.latitude === undefined || body.latitude === null
      ? null
      : Number(body.latitude);
  const longitude =
    body.longitude === undefined || body.longitude === null
      ? null
      : Number(body.longitude);
  const accuracy =
    body.accuracy === undefined || body.accuracy === null
      ? null
      : Number(body.accuracy);

  if (latitude !== null && Number.isNaN(latitude)) {
    return { error: 'Invalid latitude' };
  }
  if (longitude !== null && Number.isNaN(longitude)) {
    return { error: 'Invalid longitude' };
  }

  return {
    latitude,
    longitude,
    accuracy: accuracy !== null && !Number.isNaN(accuracy) ? accuracy : null,
    location_label: body.location_label
      ? String(body.location_label).slice(0, 200)
      : null,
  };
}

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'u-coffee-punch',
    db: Boolean(supabase),
  });
});

app.get('/api/staff', requireDb, async (_req, res) => {
  try {
    const { data: staff, error } = await supabase
      .from('staff')
      .select('id, name, role, active, created_at')
      .eq('active', true);

    if (error) throw error;

    const { data: statusRows, error: statusError } = await supabase
      .from('staff_status')
      .select('staff_id, last_punch_type, last_punched_at, is_clocked_in');

    if (statusError) throw statusError;

    const statusMap = Object.fromEntries(
      (statusRows || []).map((row) => [row.staff_id, row])
    );

    const enriched = sortStaff(
      (staff || []).map((person) => ({
        ...person,
        is_clocked_in: statusMap[person.id]?.is_clocked_in ?? false,
        last_punch_type: statusMap[person.id]?.last_punch_type ?? null,
        last_punched_at: statusMap[person.id]?.last_punched_at ?? null,
      }))
    );

    res.json(enriched);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Failed to load staff' });
  }
});

app.post('/api/staff', requireDb, async (req, res) => {
  try {
    const { name, role = 'barista' } = req.body || {};

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const { data, error } = await supabase
      .from('staff')
      .insert({
        name: name.trim(),
        pin: '0000',
        role: String(role).trim() || 'barista',
      })
      .select('id, name, role, active, created_at')
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Failed to create staff' });
  }
});

app.patch('/api/staff/:id', requireDb, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = {};
    if (typeof req.body?.active === 'boolean') updates.active = req.body.active;
    if (req.body?.name) updates.name = String(req.body.name).trim();
    if (req.body?.role) updates.role = String(req.body.role).trim();

    if (!Object.keys(updates).length) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    const { data, error } = await supabase
      .from('staff')
      .update(updates)
      .eq('id', id)
      .select('id, name, role, active, created_at')
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Failed to update staff' });
  }
});

app.post('/api/punch', requireDb, async (req, res) => {
  try {
    const { staff_id, note } = req.body || {};
    const location = parseLocation(req.body);

    if (!staff_id) {
      return res.status(400).json({ error: 'staff_id is required' });
    }
    if (location.error) {
      return res.status(400).json({ error: location.error });
    }
    if (location.latitude === null || location.longitude === null) {
      return res.status(400).json({
        error: 'Location is required to clock in or out. Please allow GPS access.',
      });
    }

    const zoneCheck = assertInsideCafeZone(location.latitude, location.longitude);
    if (zoneCheck.error) {
      return res.status(403).json({ error: zoneCheck.error });
    }

    const { data: person, error: staffError } = await supabase
      .from('staff')
      .select('id, name, active')
      .eq('id', staff_id)
      .single();

    if (staffError || !person) {
      return res.status(404).json({ error: 'Staff member not found' });
    }
    if (!person.active) {
      return res.status(403).json({ error: 'Staff member is inactive' });
    }

    const { data: lastPunch, error: lastError } = await supabase
      .from('punches')
      .select('type, punched_at')
      .eq('staff_id', staff_id)
      .order('punched_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastError) throw lastError;

    const nextType = lastPunch?.type === 'in' ? 'out' : 'in';

    const { data: punch, error: punchError } = await supabase
      .from('punches')
      .insert({
        staff_id,
        type: nextType,
        note: note ? String(note).slice(0, 200) : null,
        latitude: location.latitude,
        longitude: location.longitude,
        accuracy: location.accuracy,
        location_label: location.location_label,
      })
      .select(PUNCH_SELECT)
      .single();

    if (punchError) throw punchError;

    res.status(201).json({
      punch,
      staff_name: person.name,
      message:
        nextType === 'in'
          ? `${person.name} clocked in`
          : `${person.name} clocked out`,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Failed to punch' });
  }
});

app.get('/api/punches', requireDb, async (req, res) => {
  try {
    const { staff_id, date, limit = '50' } = req.query;
    let query = supabase
      .from('punches')
      .select(PUNCH_SELECT)
      .order('punched_at', { ascending: false })
      .limit(Math.min(Number(limit) || 50, 500));

    if (staff_id) query = query.eq('staff_id', staff_id);

    if (date) {
      const start = new Date(`${date}T00:00:00`);
      const end = new Date(`${date}T23:59:59.999`);
      if (!Number.isNaN(start.getTime())) {
        query = query
          .gte('punched_at', start.toISOString())
          .lte('punched_at', end.toISOString());
      }
    }

    const { data, error } = await query;
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Failed to load punches' });
  }
});

app.get('/api/punches/today', requireDb, async (_req, res) => {
  try {
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

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Failed to load today' });
  }
});

app.get('/api/hours', requireDb, async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from('cafe_hours')
      .select('day_of_week, is_closed, open_time, close_time')
      .order('day_of_week');
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Failed to load hours' });
  }
});

app.put('/api/hours', requireDb, async (req, res) => {
  try {
    const rows = Array.isArray(req.body) ? req.body : req.body?.hours;
    if (!Array.isArray(rows) || !rows.length) {
      return res.status(400).json({ error: 'hours array is required' });
    }

    const payload = rows.map((row) => ({
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
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Failed to save hours' });
  }
});

app.get('/api/roster', requireDb, async (req, res) => {
  try {
    const weekStart = req.query.week_start;
    let query = supabase
      .from('roster_assignments')
      .select(
        'id, week_start, day_of_week, staff_id, section, staff:staff_id(id, name, role)'
      )
      .order('day_of_week');

    if (weekStart) query = query.eq('week_start', weekStart);

    const { data, error } = await query;
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Failed to load roster' });
  }
});

app.put('/api/roster/:day', requireDb, async (req, res) => {
  try {
    const day = Number(req.params.day);
    if (Number.isNaN(day) || day < 0 || day > 6) {
      return res.status(400).json({ error: 'day must be 0-6' });
    }

    const weekStart = req.body?.week_start;
    if (!weekStart || !/^\d{4}-\d{2}-\d{2}$/.test(String(weekStart))) {
      return res.status(400).json({ error: 'week_start (YYYY-MM-DD) is required' });
    }

    const kitchen = Array.isArray(req.body?.kitchen) ? req.body.kitchen : [];
    const barista = Array.isArray(req.body?.barista) ? req.body.barista : [];

    const { error: delError } = await supabase
      .from('roster_assignments')
      .delete()
      .eq('day_of_week', day)
      .eq('week_start', weekStart);
    if (delError) throw delError;

    const rows = [
      ...kitchen.map((staff_id) => ({
        week_start: weekStart,
        day_of_week: day,
        staff_id,
        section: 'kitchen',
      })),
      ...barista.map((staff_id) => ({
        week_start: weekStart,
        day_of_week: day,
        staff_id,
        section: 'barista',
      })),
    ];

    if (rows.length) {
      const { error: insError } = await supabase
        .from('roster_assignments')
        .insert(rows);
      if (insError) throw insError;
    }

    const { data, error } = await supabase
      .from('roster_assignments')
      .select(
        'id, week_start, day_of_week, staff_id, section, staff:staff_id(id, name, role)'
      )
      .eq('day_of_week', day)
      .eq('week_start', weekStart);
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Failed to save roster' });
  }
});

app.get('/api/performance', requireDb, async (req, res) => {
  try {
    const weekStart = String(req.query.week_start || '');
    let start;
    let end = null;
    let days;

    if (/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
      start = new Date(`${weekStart}T00:00:00`);
      if (Number.isNaN(start.getTime())) {
        return res.status(400).json({ error: 'Invalid week_start' });
      }
      end = new Date(start);
      end.setDate(end.getDate() + 6);
      end.setHours(23, 59, 59, 999);
      days = 7;
    } else {
      days = Math.min(Math.max(Number(req.query.days) || 30, 1), 90);
      start = new Date();
      start.setHours(0, 0, 0, 0);
      start.setDate(start.getDate() - (days - 1));
    }

    const { data: staff, error: staffError } = await supabase
      .from('staff')
      .select('id, name, role, active')
      .eq('active', true);
    if (staffError) throw staffError;

    let punchQuery = supabase
      .from('punches')
      .select(PUNCH_SELECT)
      .gte('punched_at', start.toISOString())
      .order('punched_at', { ascending: true });
    if (end) punchQuery = punchQuery.lte('punched_at', end.toISOString());

    const { data: punches, error: punchError } = await punchQuery;
    if (punchError) throw punchError;

    res.json({
      days,
      week_start: weekStart || null,
      from: start.toISOString(),
      to: end ? end.toISOString() : null,
      punches: punches || [],
      staff: staff || [],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Failed to load performance' });
  }
});

module.exports = app;