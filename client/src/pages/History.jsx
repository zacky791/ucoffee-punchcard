import { useEffect, useState } from 'react';
import { api } from '../api';
import LocationMap from '../components/LocationMap';
import { formatShort, roleLabel } from '../lib/time';

export default function History() {
  const [punches, setPunches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [selected, setSelected] = useState(null);

  async function load(selectedDate = date) {
    setLoading(true);
    setError('');
    try {
      const data = await api.getPunches({ date: selectedDate, limit: '100' });
      setPunches(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  return (
    <section className="page">
      <header className="page-header">
        <p className="eyebrow">Records</p>
        <h1>Punch history</h1>
        <p className="lede">
          Tap a record to see where the staff member clocked in or out.
        </p>
      </header>

      <div className="history-toolbar">
        <label>
          Date
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <button type="button" className="btn ghost" onClick={() => load(date)}>
          Refresh
        </button>
      </div>

      {error && <p className="banner error">{error}</p>}
      {loading ? (
        <p className="state-msg">Loading punches…</p>
      ) : punches.length === 0 ? (
        <p className="state-msg">No punches for this day.</p>
      ) : (
        <ul className="punch-list">
          {punches.map((punch) => (
            <li key={punch.id}>
              <button
                type="button"
                className="punch-row"
                onClick={() => setSelected(punch)}
              >
                <div className="punch-who">
                  <strong>{punch.staff?.name || 'Unknown'}</strong>
                  <span>
                    {formatShort(punch.punched_at)}
                    {punch.staff?.role ? ` · ${roleLabel(punch.staff.role)}` : ''}
                  </span>
                </div>
                <span className={`tag ${punch.type === 'in' ? 'in' : 'out'}`}>
                  Clock {punch.type}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {selected && (
        <div className="pin-overlay" role="dialog" aria-modal="true">
          <div className="result-sheet">
            <p className="pin-eyebrow">Punch detail</p>
            <h2 className="pin-title">{selected.staff?.name || 'Staff'}</h2>
            <p className="pin-hint">
              Clock {selected.type} · {formatShort(selected.punched_at)}
            </p>
            <LocationMap
              latitude={selected.latitude}
              longitude={selected.longitude}
              label={selected.location_label || selected.staff?.name}
              height={260}
            />
            {selected.location_label && (
              <p className="map-address">{selected.location_label}</p>
            )}
            <button
              type="button"
              className="btn ghost wide"
              onClick={() => setSelected(null)}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
