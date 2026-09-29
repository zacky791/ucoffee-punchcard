import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import ManualClockOutModal from '../components/ManualClockOutModal';
import {
  DAY_LABELS,
  DAY_SHORT,
  addDays,
  buildWeekAttendance,
  formatDayDate,
  formatWeekMonth,
  formatWeekRange,
  startOfWeek,
  toDateKey,
  weekPunchRange,
} from '../lib/performance';
import { roleLabel } from '../lib/time';

export default function WeekOverview() {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [punches, setPunches] = useState([]);
  const [staff, setStaff] = useState([]);
  const [roster, setRoster] = useState([]);
  const [hours, setHours] = useState([]);
  const [editing, setEditing] = useState(null);
  const [notice, setNotice] = useState('');

  const thisWeek = startOfWeek(new Date());
  const isThisWeek = weekStart === thisWeek;
  const todayKey = toDateKey(new Date());
  const monthLabel = formatWeekMonth(weekStart);

  async function load(selectedWeek = weekStart) {
    setLoading(true);
    setError('');
    try {
      const [perf, rosterData, hoursData] = await Promise.all([
        api.getPerformance({
          week_start: selectedWeek,
          ...weekPunchRange(selectedWeek),
        }),
        api.getRoster({ week_start: selectedWeek }).catch(() => []),
        api.getHours().catch(() => []),
      ]);
      setPunches(perf.punches || []);
      setStaff(perf.staff || []);
      setRoster(rosterData || []);
      setHours(hoursData || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(weekStart);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart]);

  const days = useMemo(
    () =>
      buildWeekAttendance({
        weekStart,
        punches,
        staff,
        roster,
        hours,
      }),
    [weekStart, punches, staff, roster, hours]
  );

  function jumpToDate(value) {
    if (!value) return;
    setWeekStart(startOfWeek(new Date(`${value}T12:00:00`)));
  }

  return (
    <section className="page">
      <header className="page-header">
        <h1>Working schedule</h1>
      </header>

      <div className="week-nav">
        <div className="week-nav-block">
          <span className="week-nav-title">Week</span>
          <div className="week-nav-row">
            <button
              type="button"
              className="btn ghost compact"
              onClick={() => setWeekStart(addDays(weekStart, -7))}
              aria-label="Previous week"
            >
              ←
            </button>
            <div className="week-nav-label">
              <strong>{formatWeekRange(weekStart)}</strong>
            </div>
            <button
              type="button"
              className="btn ghost compact"
              onClick={() => setWeekStart(addDays(weekStart, 7))}
              aria-label="Next week"
            >
              →
            </button>
            {!isThisWeek && (
              <button
                type="button"
                className="btn ghost compact"
                onClick={() => setWeekStart(thisWeek)}
              >
                Today
              </button>
            )}
          </div>
        </div>
        <div className="week-nav-block">
          <span className="week-nav-title">Calendar</span>
          <input
            type="date"
            className="week-jump-input"
            value={weekStart}
            onChange={(e) => jumpToDate(e.target.value)}
            aria-label="Jump to calendar date"
          />
        </div>
      </div>

      {notice && <p className="banner ok">{notice}</p>}
      {error && <p className="banner error">{error}</p>}

      {editing && (
        <ManualClockOutModal
          person={editing.person}
          closeTime={editing.closeTime}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setNotice(`${editing.person.name} clocked out manually`);
            setEditing(null);
            load(weekStart);
          }}
        />
      )}

      {loading ? (
        <p className="state-msg">Loading week…</p>
      ) : (
        <>
          <p className="week-month-label">{monthLabel}</p>
          <div className="week-card-grid">
            {days.map((day) => (
              <article
                key={day.date}
                className={`week-mini-card ${
                  day.date === todayKey ? 'is-today' : ''
                } ${day.is_closed ? 'is-closed' : ''}`}
              >
                <header className="week-mini-head">
                  <strong>{DAY_SHORT[day.day_of_week]}</strong>
                  <span className="week-mini-daynum">
                    <span className="week-mini-daynum-short">
                      {parseInt(day.date.slice(8), 10)}
                    </span>
                    <span className="week-mini-daynum-full">
                      {formatDayDate(day.date)}
                    </span>
                  </span>
                  {day.is_closed && <em>Closed</em>}
                </header>

                {day.worked.length === 0 && day.missed.length === 0 ? (
                  <p className="week-mini-empty">—</p>
                ) : (
                  <ul className="week-mini-list">
                    {day.worked.map((person) => (
                      <li key={person.staff_id} className="week-mini-worked">
                        <strong>{person.name}</strong>
                        <span className="week-mini-in">
                          In {person.in_label || '—'}
                        </span>
                        {person.missed_out ? (
                          <span className="week-mini-meta week-mini-missed-out">
                            Missed clock-out · {person.total_label}
                            {person.openIn && (
                              <button
                                type="button"
                                className="week-mini-edit"
                                onClick={() => {
                                  setNotice('');
                                  setEditing({ person, closeTime: day.close_time });
                                }}
                                aria-label={`Add clock-out for ${person.name}`}
                                title="Add clock-out"
                              >
                                <svg
                                  viewBox="0 0 24 24"
                                  width="14"
                                  height="14"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  aria-hidden="true"
                                >
                                  <path d="M12 20h9" />
                                  <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                                </svg>
                              </button>
                            )}
                          </span>
                        ) : (
                          <span className="week-mini-meta">
                            Out{' '}
                            {person.still_in
                              ? 'still in'
                              : person.out_label || '—'}
                            {!person.still_in && person.out_date_label && (
                              <> ({person.out_date_label})</>
                            )}
                            {' · '}
                            {person.total_label}
                          </span>
                        )}
                      </li>
                    ))}
                    {day.missed.map((person) => (
                      <li key={person.staff_id} className="week-mini-missed">
                        <strong>{person.name}</strong>
                        <span>No punch</span>
                      </li>
                    ))}
                  </ul>
                )}
                <span className="visually-hidden">
                  {DAY_LABELS[day.day_of_week]}
                </span>
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
