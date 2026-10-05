const path = require('path');
// Local only — Netlify injects env at runtime; don't rely on a .env file there
if (!process.env.NETLIFY && !process.env.AWS_LAMBDA_FUNCTION_NAME) {
  require('dotenv').config({ path: path.join(__dirname, '../.env') });
}
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const { createPosRouter } = require('./pos/routes');
//location map
const app = express();

app.use(cors({ origin: true }));
app.use(express.json());

function readSupabaseConfig() {
  // Bracket access so esbuild does NOT inline empty values at Netlify build time
  const env = process.env;
  const url =
    env['SUPABASE_URL'] ||
    env['VITE_SUPABASE_URL'] ||
    env['VITE_SUPABASE_PROJECT_URL'] ||
    '';
  const key =
    env['SUPABASE_SERVICE_ROLE_KEY'] ||
    env['SUPABASE_ANON_KEY'] ||
    env['SUPABASE_PUBLISHABLE_KEY'] ||
    env['VITE_SUPABASE_ANON_KEY'] ||
    env['VITE_SUPABASE_PUBLISHABLE_KEY'] ||
    '';
  const placeholder =
    /YOUR_PROJECT_REF|your_project_ref|your_service_role_key|your_anon_key/i.test(
      `${url}\n${key}`
    );
  return {
    url: String(url).trim(),
    key: String(key).trim(),
    ok: Boolean(url && key && !placeholder),
  };
}

let supabase = null;

function getSupabase() {
  if (supabase) return supabase;
  const cfg = readSupabaseConfig();
  if (!cfg.ok) return null;
  supabase = createClient(cfg.url, cfg.key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return supabase;
}

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

// A clock-in older than this with no clock-out is a missed clock-out.
// Keep in sync with MAX_SHIFT_HOURS in client/src/lib/performance.js.
const MAX_SHIFT_MS = 16 * 60 * 60 * 1000;

function isActivelyClockedIn(lastPunchType, lastPunchedAt) {
  return (
    lastPunchType === 'in' &&
    Boolean(lastPunchedAt) &&
    Date.now() - new Date(lastPunchedAt).getTime() <= MAX_SHIFT_MS
  );
}

const ROLE_ORDER = {
  head_chef: 1,
  manager: 2,
  assistant_manager: 3,
  assistant_chef: 4,
  kitchen: 5,
  shift_lead: 6,
  barista: 10,
};

function requireDb(req, res, next) {
  const db = getSupabase();
  if (!db) {
    const cfg = readSupabaseConfig();
    return res.status(503).json({
      error:
        'Database not configured. On Netlify set SUPABASE_URL and SUPABASE_ANON_KEY (Site settings → Environment variables), then redeploy.',
      debug: {
        hasUrl: Boolean(cfg.url),
        hasKey: Boolean(cfg.key),
        netlify: Boolean(
          process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME
        ),
      },
    });
  }
  req.supabase = db;
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
  const cfg = readSupabaseConfig();
  res.json({
    ok: true,
    service: 'u-coffee-punch',
    db: Boolean(getSupabase()),
    env: {
      hasUrl: Boolean(cfg.url),
      hasKey: Boolean(cfg.key),
    },
  });
});

// Café Ordering System / POS APIs
app.use('/api/pos', createPosRouter(getSupabase));

app.get('/api/staff', requireDb, async (_req, res) => {
  try {
    const { data: staff, error } = await getSupabase()
      .from('staff')
      .select('id, name, role, active, created_at')
      .eq('active', true);

    if (error) throw error;

    const { data: statusRows, error: statusError } = await getSupabase()
      .from('staff_status')
      .select('staff_id, last_punch_type, last_punched_at, is_clocked_in');

    if (statusError) throw statusError;

    const statusMap = Object.fromEntries(
      (statusRows || []).map((row) => [row.staff_id, row])
    );

    const enriched = sortStaff(
      (staff || []).map((person) => ({
        ...person,
        is_clocked_in: isActivelyClockedIn(
          statusMap[person.id]?.last_punch_type,
          statusMap[person.id]?.last_punched_at
        ),
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

    const { data, error } = await getSupabase()
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

    const { data, error } = await getSupabase()
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

    const { data: person, error: staffError } = await getSupabase()
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

    const { data: lastPunch, error: lastError } = await getSupabase()
      .from('punches')
      .select('type, punched_at')
      .eq('staff_id', staff_id)
      .order('punched_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastError) throw lastError;

    const nextType = isActivelyClockedIn(lastPunch?.type, lastPunch?.punched_at)
      ? 'out'
      : 'in';

    const { data: punch, error: punchError } = await getSupabase()
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
    let query = getSupabase()
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

app.post('/api/punches/manual-out', requireDb, async (req, res) => {
  try {
    const { in_punch_id, punched_at, note } = req.body || {};
    if (!in_punch_id) {
      return res.status(400).json({ error: 'in_punch_id is required' });
    }
    const outAt = new Date(punched_at);
    if (!punched_at || Number.isNaN(outAt.getTime())) {
      return res.status(400).json({ error: 'A valid clock-out time is required' });
    }

    const { data: inPunch, error: inError } = await getSupabase()
      .from('punches')
      .select('id, staff_id, type, punched_at, staff:staff_id(id, name)')
      .eq('id', in_punch_id)
      .maybeSingle();
    if (inError) throw inError;
    if (!inPunch || inPunch.type !== 'in') {
      return res.status(404).json({ error: 'Clock-in not found' });
    }

    const inAt = new Date(inPunch.punched_at);
    if (outAt <= inAt) {
      return res.status(400).json({ error: 'Clock-out must be after the clock-in time' });
    }
    if (outAt - inAt > MAX_SHIFT_MS) {
      return res.status(400).json({ error: 'Shift cannot be longer than 16 hours' });
    }
    if (outAt > new Date()) {
      return res.status(400).json({ error: 'Clock-out cannot be in the future' });
    }

    const { data: nextPunch, error: nextError } = await getSupabase()
      .from('punches')
      .select('type, punched_at')
      .eq('staff_id', inPunch.staff_id)
      .gt('punched_at', inPunch.punched_at)
      .order('punched_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (nextError) throw nextError;
    if (nextPunch?.type === 'out') {
      return res.status(409).json({ error: 'This shift already has a clock-out' });
    }
    if (nextPunch && outAt >= new Date(nextPunch.punched_at)) {
      return res.status(400).json({
        error: 'Clock-out must be before the next clock-in',
      });
    }

    const { data: punch, error: punchError } = await getSupabase()
      .from('punches')
      .insert({
        staff_id: inPunch.staff_id,
        type: 'out',
        punched_at: outAt.toISOString(),
        note: note ? String(note).slice(0, 200) : 'Manual clock-out',
        location_label: 'Manual entry',
      })
      .select(PUNCH_SELECT)
      .single();
    if (punchError) throw punchError;

    res.status(201).json({
      punch,
      message: `${inPunch.staff?.name || 'Staff'} clocked out manually`,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Failed to save clock-out' });
  }
});

// Manual attendance edits from the Working schedule (PIN-checked on the client).
app.post('/api/punches/batch', requireDb, async (req, res) => {
  try {
    const { create = [], update = [], remove = [] } = req.body || {};
    const latest = Date.now() + 5 * 60 * 1000;
    const validTime = (value) => {
      const at = new Date(value);
      if (!value || Number.isNaN(at.getTime())) return 'Each time must be a valid date and time';
      if (at.getTime() > latest) return 'Times cannot be in the future';
      return null;
    };
    for (const p of create) {
      if (!p.staff_id) return res.status(400).json({ error: 'Choose who worked for each row' });
      if (!['in', 'out'].includes(p.type)) return res.status(400).json({ error: 'Invalid punch type' });
      const bad = validTime(p.punched_at);
      if (bad) return res.status(400).json({ error: bad });
    }
    for (const p of update) {
      if (!p.id) return res.status(400).json({ error: 'Missing punch id' });
      const bad = validTime(p.punched_at);
      if (bad) return res.status(400).json({ error: bad });
    }

    const db = getSupabase();
    if (remove.length) {
      const { error } = await db.from('punches').delete().in('id', remove);
      if (error) throw error;
    }
    for (const p of update) {
      const { error } = await db
        .from('punches')
        .update({ punched_at: new Date(p.punched_at).toISOString() })
        .eq('id', p.id);
      if (error) throw error;
    }
    if (create.length) {
      const { error } = await db.from('punches').insert(
        create.map((p) => ({
          staff_id: p.staff_id,
          type: p.type,
          punched_at: new Date(p.punched_at).toISOString(),
          note: 'Manual entry',
          location_label: 'Manual entry',
        }))
      );
      if (error) throw error;
    }
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Failed to save attendance' });
  }
});

app.get('/api/punches/today', requireDb, async (_req, res) => {
  try {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);

    const { data, error } = await getSupabase()
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
    const { data, error } = await getSupabase()
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

    const { data, error } = await getSupabase()
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
    let query = getSupabase()
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

    const { error: delError } = await getSupabase()
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
      const { error: insError } = await getSupabase()
        .from('roster_assignments')
        .insert(rows);
      if (insError) throw insError;
    }

    const { data, error } = await getSupabase()
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
    const from = req.query.from ? new Date(String(req.query.from)) : null;
    const to = req.query.to ? new Date(String(req.query.to)) : null;
    let start;
    let end = null;
    let days;

    if (from && to && !Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime())) {
      if (to - from > 31 * 24 * 60 * 60 * 1000 || to <= from) {
        return res.status(400).json({ error: 'from/to must span 1–31 days' });
      }
      start = from;
      end = to;
      days = 7;
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
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

    const { data: staff, error: staffError } = await getSupabase()
      .from('staff')
      .select('id, name, role, active')
      .eq('active', true);
    if (staffError) throw staffError;

    let punchQuery = getSupabase()
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