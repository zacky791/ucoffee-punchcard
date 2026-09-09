import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import {
  DAY_LABELS,
  DAY_ORDER,
  DAY_SHORT,
  addDays,
  dateForWeekDay,
  formatDayDate,
  formatWeekRange,
  startOfWeek,
  toDateKey,
} from '../lib/performance';
import { roleLabel } from '../lib/time';

const KITCHEN_ROLES = new Set([
  'head_chef',
  'assistant_chef',
  'assistant_manager',
  'manager',
  'kitchen',
]);

const DEFAULT_HOURS = DAY_ORDER.map((day) => {
  if (day === 1) {
    return { day_of_week: day, is_closed: true, open_time: null, close_time: null };
  }
  if (day === 0 || day === 6) {
    return {
      day_of_week: day,
      is_closed: false,
      open_time: '12:00',
      close_time: '13:00',
    };
  }
  return {
    day_of_week: day,
    is_closed: false,
    open_time: '06:00',
    close_time: '12:00',
  };
});

function normalizeTime(value) {
  if (!value) return '';
  return String(value).slice(0, 5);
}

export default function Schedule() {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [hours, setHours] = useState(DEFAULT_HOURS);
  const [roster, setRoster] = useState([]);
  const [staff, setStaff] = useState([]);
  const [activeDay, setActiveDay] = useState(() => {
    const today = new Date().getDay();
    return today === 0 ? 0 : today; // keep today selected
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const thisWeek = startOfWeek(new Date());
  const isThisWeek = weekStart === thisWeek;

  async function load(selectedWeek = weekStart) {
    setLoading(true);
    setError('');
    try {
      const [hoursData, rosterData, staffData] = await Promise.all([
        api.getHours().catch(() => DEFAULT_HOURS),
        api.getRoster({ week_start: selectedWeek }).catch(() => []),
        api.getStaff(),
      ]);
      setHours(
        DAY_ORDER.map((day) => {
          const found = (hoursData || []).find(
            (h) => Number(h.day_of_week) === day
          );
          return found || DEFAULT_HOURS.find((h) => h.day_of_week === day);
        })
      );
      setRoster(Array.isArray(rosterData) ? rosterData : []);
      setStaff(Array.isArray(staffData) ? staffData : []);
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

  const kitchenStaff = useMemo(
    () => staff.filter((s) => KITCHEN_ROLES.has(s.role)),
    [staff]
  );
  const baristaStaff = useMemo(
    () => staff.filter((s) => !KITCHEN_ROLES.has(s.role)),
    [staff]
  );

  const dayHours = hours.find((h) => Number(h.day_of_week) === activeDay) || {
    day_of_week: activeDay,
    is_closed: false,
    open_time: '06:00',
    close_time: '12:00',
  };

  const activeDateKey = dateForWeekDay(weekStart, activeDay);

  const dayKitchen = roster
    .filter(
      (r) => Number(r.day_of_week) === activeDay && r.section === 'kitchen'
    )
    .map((r) => r.staff_id);
  const dayBarista = roster
    .filter(
      (r) => Number(r.day_of_week) === activeDay && r.section === 'barista'
    )
    .map((r) => r.staff_id);

  function updateHourField(field, value) {
    setHours((prev) =>
      prev.map((row) =>
        Number(row.day_of_week) === activeDay ? { ...row, [field]: value } : row
      )
    );
  }

  function toggleWorker(section, staffId) {
    setRoster((prev) => {
      const exists = prev.some(
        (r) =>
          Number(r.day_of_week) === activeDay &&
          r.staff_id === staffId &&
          r.section === section
      );
      if (exists) {
        return prev.filter(
          (r) =>
            !(
              Number(r.day_of_week) === activeDay &&
              r.staff_id === staffId &&
              r.section === section
            )
        );
      }
      const cleaned = prev.filter(
        (r) => !(Number(r.day_of_week) === activeDay && r.staff_id === staffId)
      );
      return [
        ...cleaned,
        {
          id: `tmp-${section}-${staffId}`,
          week_start: weekStart,
          day_of_week: activeDay,
          staff_id: staffId,
          section,
        },
      ];
    });
  }

  async function saveDay() {
    setSaving(true);
    setNotice('');
    setError('');
    try {
      await api.saveHours(hours);
      await api.saveRosterDay(activeDay, {
        week_start: weekStart,
        kitchen: dayKitchen,
        barista: dayBarista,
      });
      setNotice(
        `${DAY_LABELS[activeDay]} ${formatDayDate(activeDateKey)} saved`
      );
      await load(weekStart);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="page">
      <header className="page-header">
        <h1>Planning</h1>
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
            onChange={(e) => {
              if (!e.target.value) return;
              setWeekStart(startOfWeek(e.target.value));
            }}
            aria-label="Jump to calendar date"
          />
        </div>
      </div>

      {error && <p className="banner error">{error}</p>}
      {notice && <p className="banner ok">{notice}</p>}

      {loading ? (
        <p className="state-msg">Loading schedule…</p>
      ) : (
        <>
          <div className="weekday-row" role="tablist" aria-label="Week days">
            {DAY_ORDER.map((day) => {
              const dateKey = dateForWeekDay(weekStart, day);
              const isToday = dateKey === toDateKey(new Date());
              return (
                <button
                  key={day}
                  type="button"
                  role="tab"
                  aria-selected={activeDay === day}
                  className={`weekday-btn dated ${activeDay === day ? 'active' : ''} ${isToday ? 'today' : ''}`}
                  onClick={() => {
                    setActiveDay(day);
                    setNotice('');
                  }}
                >
                  <span className="weekday-name">{DAY_SHORT[day]}</span>
                  <span className="weekday-date">
                    {parseInt(dateKey.slice(8), 10)}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="schedule-panel">
            <div className="schedule-day-bar">
              <div>
                <h2 className="schedule-day-title">
                  {DAY_LABELS[activeDay]}
                </h2>
                <p className="schedule-day-sub">
                  {formatDayDate(activeDateKey)}
                </p>
              </div>
              <div
                className="status-toggle"
                role="group"
                aria-label={`${DAY_LABELS[activeDay]} open or closed`}
              >
                <button
                  type="button"
                  className={`status-toggle-btn ${!dayHours.is_closed ? 'active open' : ''}`}
                  onClick={() => updateHourField('is_closed', false)}
                >
                  Open
                </button>
                <button
                  type="button"
                  className={`status-toggle-btn ${dayHours.is_closed ? 'active closed' : ''}`}
                  onClick={() => updateHourField('is_closed', true)}
                >
                  Closed
                </button>
              </div>
            </div>

            {dayHours.is_closed ? (
              <p className="schedule-closed-note">No shifts this day.</p>
            ) : (
              <>
                <div className="hours-grid">
                  <label>
                    Open
                    <input
                      type="time"
                      value={normalizeTime(dayHours.open_time) || '06:00'}
                      onChange={(e) =>
                        updateHourField('open_time', e.target.value)
                      }
                    />
                  </label>
                  <label>
                    Close
                    <input
                      type="time"
                      value={normalizeTime(dayHours.close_time) || '12:00'}
                      onChange={(e) =>
                        updateHourField('close_time', e.target.value)
                      }
                    />
                  </label>
                </div>

                <div className="schedule-sections">
                  <div>
                    <h3 className="team-heading">
                      Kitchen
                      <span className="team-count">
                        {dayKitchen.length} assigned
                      </span>
                    </h3>
                    <div className="assign-grid">
                      {kitchenStaff.map((person) => {
                        const on = dayKitchen.includes(person.id);
                        return (
                          <button
                            key={person.id}
                            type="button"
                            className={`assign-chip ${on ? 'on' : ''}`}
                            onClick={() => toggleWorker('kitchen', person.id)}
                          >
                            <strong>{person.name}</strong>
                            <span>{roleLabel(person.role)}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <h3 className="team-heading">
                      Barista
                      <span className="team-count">
                        {dayBarista.length} assigned
                      </span>
                    </h3>
                    <div className="assign-grid">
                      {baristaStaff.map((person) => {
                        const on = dayBarista.includes(person.id);
                        return (
                          <button
                            key={person.id}
                            type="button"
                            className={`assign-chip ${on ? 'on' : ''}`}
                            onClick={() => toggleWorker('barista', person.id)}
                          >
                            <strong>{person.name}</strong>
                            <span>{roleLabel(person.role)}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </>
            )}

            <div className="schedule-actions">
              <button
                type="button"
                className="btn primary"
                disabled={saving}
                onClick={saveDay}
              >
                {saving
                  ? 'Saving…'
                  : `Save ${DAY_SHORT[activeDay]} ${formatDayDate(activeDateKey)}`}
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
