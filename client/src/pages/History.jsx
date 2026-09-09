import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import LocationMap from '../components/LocationMap';
import {
  buildDayStaffSummaries,
  formatClock12,
  formatHoursFromMs,
} from '../lib/performance';
import { staffPhoto, initials } from '../lib/staff';
import { roleLabel } from '../lib/time';

function toLocalDateKey(iso) {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDayHeading(dateKey) {
  const d = new Date(`${dateKey}T12:00:00`);
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(d);
}

function groupByDate(punches) {
  const map = new Map();
  for (const punch of punches) {
    const key = toLocalDateKey(punch.punched_at);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(punch);
  }
  return [...map.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, dayPunches]) => ({
      date,
      staff: buildDayStaffSummaries(dayPunches),
    }));
}

export default function History() {
  const [punches, setPunches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState({});
  const [mapPunch, setMapPunch] = useState(null);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = await api.getPunches({ limit: '500' });
      setPunches(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const days = useMemo(() => groupByDate(punches), [punches]);

  function toggleStaff(date, staffId) {
    const key = `${date}:${staffId}`;
    setExpanded((current) => ({ ...current, [key]: !current[key] }));
  }

  return (
    <section className="page history-page">
      <header className="page-header">
        <h1>Punch history</h1>
      </header>

      {error && <p className="banner error">{error}</p>}
      {loading ? (
        <p className="state-msg">Loading punches…</p>
      ) : days.length === 0 ? (
        <p className="state-msg">No punch records yet.</p>
      ) : (
        <div className="history-by-date">
          {days.map((day) => (
            <section key={day.date} className="history-day">
              <header className="history-day-head">
                <h2>{formatDayHeading(day.date)}</h2>
                <span className="team-count">{day.staff.length} people</span>
              </header>

              <ul className="history-groups">
                {day.staff.map((person) => {
                  const key = `${day.date}:${person.staff_id}`;
                  const open = Boolean(expanded[key]);
                  const photo = staffPhoto(person.name);

                  return (
                    <li
                      key={key}
                      className={`history-group ${open ? 'open' : ''}`}
                    >
                      <button
                        type="button"
                        className="history-summary"
                        onClick={() => toggleStaff(day.date, person.staff_id)}
                      >
                        {photo ? (
                          <img className="history-avatar" src={photo} alt="" />
                        ) : (
                          <span className="history-avatar initials">
                            {initials(person.name)}
                          </span>
                        )}
                        <div className="history-summary-text">
                          <strong>{person.name}</strong>
                          <span className="history-inout">
                            {roleLabel(person.role)}
                            {' · '}
                            In {person.in_label || '—'}
                            {' · '}
                            Out{' '}
                            {person.still_in
                              ? 'still in'
                              : person.out_label || '—'}
                          </span>
                        </div>
                        <div className="history-total">
                          <span className="tag in">{person.total_label}</span>
                          <span className="history-chevron" aria-hidden="true">
                            {open ? '−' : '+'}
                          </span>
                        </div>
                      </button>

                      {open && (
                        <ul className="history-detail">
                          {person.sessions.length === 0 && person.still_in ? (
                            <li className="history-session-row">
                              <span className="tag in">In</span>
                              <span>
                                {formatClock12(person.openIn.punched_at)} · still
                                on floor
                              </span>
                              <button
                                type="button"
                                className="history-punch-map"
                                onClick={() => setMapPunch(person.openIn)}
                              >
                                Map
                              </button>
                            </li>
                          ) : null}

                          {person.sessions.map((session, idx) => (
                            <li key={session.in.id || idx} className="history-session">
                              <div className="history-session-row">
                                <span className="tag in">In</span>
                                <span>{formatClock12(session.in.punched_at)}</span>
                                <button
                                  type="button"
                                  className="history-punch-map"
                                  onClick={() => setMapPunch(session.in)}
                                >
                                  Map
                                </button>
                              </div>
                              <div className="history-session-row">
                                <span className="tag out">Out</span>
                                <span>{formatClock12(session.out.punched_at)}</span>
                                <button
                                  type="button"
                                  className="history-punch-map"
                                  onClick={() => setMapPunch(session.out)}
                                >
                                  Map
                                </button>
                              </div>
                              <p className="history-session-total">
                                Total {formatHoursFromMs(session.ms)}
                              </p>
                            </li>
                          ))}

                          {person.still_in && person.sessions.length > 0 && (
                            <li className="history-session-row">
                              <span className="tag in">In</span>
                              <span>
                                {formatClock12(person.openIn.punched_at)} · still
                                on floor
                              </span>
                              <button
                                type="button"
                                className="history-punch-map"
                                onClick={() => setMapPunch(person.openIn)}
                              >
                                Map
                              </button>
                            </li>
                          )}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      {mapPunch && (
        <div className="pin-overlay" role="dialog" aria-modal="true">
          <div className="result-sheet">
            <p className="pin-eyebrow">Location</p>
            <h2 className="pin-title">{mapPunch.staff?.name || 'Staff'}</h2>
            <p className="pin-hint">
              Clock {mapPunch.type} · {formatClock12(mapPunch.punched_at)}
            </p>
            <LocationMap
              latitude={mapPunch.latitude}
              longitude={mapPunch.longitude}
              label={mapPunch.location_label || mapPunch.staff?.name}
              height={260}
            />
            {mapPunch.location_label && (
              <p className="map-address">{mapPunch.location_label}</p>
            )}
            <button
              type="button"
              className="btn ghost wide"
              onClick={() => setMapPunch(null)}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
