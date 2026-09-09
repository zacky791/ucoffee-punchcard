import { useEffect, useState } from 'react';
import { api } from '../api';
import LocationMap from '../components/LocationMap';
import { CAFE_ZONE, checkZone } from '../lib/geofence';
import { formatClock12 } from '../lib/performance';
import { roleLabel } from '../lib/time';

function formatWhen(iso) {
  const d = new Date(iso);
  const day = new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(d);
  return `${day} · ${formatClock12(iso)}`;
}

export default function Proof() {
  const [punches, setPunches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [mapPunch, setMapPunch] = useState(null);
  const [filter, setFilter] = useState('all'); // all | inside | outside

  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = await api.getPunches({ limit: '500' });
      const list = (data || [])
        .filter((p) => p.type === 'in')
        .sort((a, b) => new Date(b.punched_at) - new Date(a.punched_at))
        .map((punch) => ({
          ...punch,
          zone: checkZone(punch.latitude, punch.longitude),
        }));
      setPunches(list);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const visible = punches.filter((p) => {
    if (filter === 'inside') return p.zone.status === 'inside';
    if (filter === 'outside') return p.zone.status === 'outside';
    return true;
  });

  const insideCount = punches.filter((p) => p.zone.status === 'inside').length;
  const outsideCount = punches.filter((p) => p.zone.status === 'outside').length;

  return (
    <section className="page">
      <header className="page-header">
        <h1>Proof</h1>
      </header>

      <div className="history-toolbar compact proof-toolbar">
        <div className="proof-filters">
          <button
            type="button"
            className={`btn ghost compact ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            All ({punches.length})
          </button>
          <button
            type="button"
            className={`btn ghost compact proof-in ${filter === 'inside' ? 'active' : ''}`}
            onClick={() => setFilter('inside')}
          >
            In zone ({insideCount})
          </button>
          <button
            type="button"
            className={`btn ghost compact proof-out ${filter === 'outside' ? 'active' : ''}`}
            onClick={() => setFilter('outside')}
          >
            Outside ({outsideCount})
          </button>
        </div>
      </div>

      {error && <p className="banner error">{error}</p>}

      {loading ? (
        <p className="state-msg">Loading proof…</p>
      ) : visible.length === 0 ? (
        <p className="state-msg">No clock-in records.</p>
      ) : (
        <ul className="proof-list">
          {visible.map((punch) => {
            const status = punch.zone.status;
            const isOut = status === 'outside' || status === 'missing';
            return (
              <li
                key={punch.id}
                className={`proof-row ${isOut ? 'outside' : 'inside'}`}
              >
                <span
                  className={`proof-dot ${isOut ? 'outside' : 'inside'}`}
                  title={isOut ? 'Outside zone' : 'Within zone'}
                  aria-label={isOut ? 'Outside zone' : 'Within zone'}
                />
                <div className="proof-main">
                  <strong>{punch.staff?.name || 'Unknown'}</strong>
                  <span>
                    {roleLabel(punch.staff?.role)} · {formatWhen(punch.punched_at)}
                  </span>
                  <span className="proof-loc">
                    {punch.location_label ||
                      (punch.latitude != null
                        ? `${Number(punch.latitude).toFixed(5)}, ${Number(punch.longitude).toFixed(5)}`
                        : 'No GPS')}
                  </span>
                </div>
                <div className="proof-side">
                  <span className={`proof-badge ${isOut ? 'outside' : 'inside'}`}>
                    {status === 'inside'
                      ? 'In zone'
                      : status === 'outside'
                        ? 'Outside'
                        : 'No GPS'}
                  </span>
                  {punch.zone.distance_m != null && (
                    <span className="proof-dist">{punch.zone.distance_m}m</span>
                  )}
                  <button
                    type="button"
                    className="history-punch-map"
                    onClick={() => setMapPunch(punch)}
                    disabled={punch.latitude == null}
                  >
                    Map
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {mapPunch && (
        <div className="pin-overlay" role="dialog" aria-modal="true">
          <div className="result-sheet">
            <p className="pin-eyebrow">Proof map</p>
            <h2 className="pin-title">{mapPunch.staff?.name || 'Staff'}</h2>
            <p className="pin-hint">
              Clock in · {formatClock12(mapPunch.punched_at)} ·{' '}
              {mapPunch.zone.status === 'inside' ? 'In zone' : 'Outside zone'}
            </p>
            <LocationMap
              latitude={mapPunch.latitude}
              longitude={mapPunch.longitude}
              label={mapPunch.location_label || mapPunch.staff?.name}
              height={260}
              showZone
              zone={CAFE_ZONE}
              within={mapPunch.zone.within}
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
