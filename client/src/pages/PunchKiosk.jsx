import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import LocationMap, {
  getCurrentPosition,
  reverseGeocode,
} from '../components/LocationMap';
import { formatDate, formatTime, roleLabel, useClock } from '../lib/time';
import { initials, staffPhoto } from '../lib/staff';

const KITCHEN_ROLES = new Set([
  'head_chef',
  'assistant_chef',
  'kitchen',
]);

function isKitchen(role) {
  return KITCHEN_ROLES.has(role);
}

function PunchResult({ result, onClose }) {
  const punch = result.punch;
  return (
    <div className="pin-overlay" role="dialog" aria-modal="true">
      <div className="result-sheet">
        <div className="flash-mark" aria-hidden="true" />
        <h2 className="pin-title">{result.message}</h2>
        <p className="pin-hint">
          {punch?.type === 'in' ? 'Clock in' : 'Clock out'} saved with location
        </p>
        <LocationMap
          latitude={punch?.latitude}
          longitude={punch?.longitude}
          label={punch?.location_label || result.staff_name}
          height={240}
        />
        {punch?.location_label && (
          <p className="map-address">{punch.location_label}</p>
        )}
        <button type="button" className="btn primary wide" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  );
}

function PunchPreview({
  person,
  location,
  loadingLocation,
  locationError,
  confirming,
  confirmError,
  onConfirm,
  onCancel,
  onRetryLocation,
}) {
  const action = person.is_clocked_in ? 'Clock out' : 'Clock in';
  const photo = staffPhoto(person.name);

  return (
    <div className="pin-overlay" role="dialog" aria-modal="true">
      <div className="result-sheet">
        <div className="preview-head">
          {photo ? (
            <img className="preview-photo" src={photo} alt="" />
          ) : (
            <span className="staff-avatar preview-avatar">{initials(person.name)}</span>
          )}
          <div>
            <h2 className="pin-title">{person.name}</h2>
            <p className="pin-hint">
              {roleLabel(person.role)} · {action}
            </p>
          </div>
        </div>

        {loadingLocation && (
          <p className="state-msg">Getting your GPS location…</p>
        )}

        {locationError && (
          <div className="banner error">
            <p>{locationError}</p>
            <button type="button" className="btn ghost" onClick={onRetryLocation}>
              Retry GPS
            </button>
          </div>
        )}

        {location && (
          <>
            <LocationMap
              latitude={location.latitude}
              longitude={location.longitude}
              label={location.location_label || person.name}
              height={240}
            />
            {location.location_label && (
              <p className="map-address">{location.location_label}</p>
            )}
            {location.accuracy != null && (
              <p className="map-coords">
                Accuracy ±{Math.round(location.accuracy)}m
              </p>
            )}
          </>
        )}

        {confirmError && <p className="banner error">{confirmError}</p>}

        <div className="preview-actions">
          <button
            type="button"
            className="btn ghost wide"
            onClick={onCancel}
            disabled={confirming}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn primary wide"
            onClick={onConfirm}
            disabled={!location || loadingLocation || confirming}
          >
            {confirming ? 'Saving…' : action}
          </button>
        </div>
      </div>
    </div>
  );
}

function StaffTile({ person, index, disabled, onSelect }) {
  const photo = staffPhoto(person.name);

  return (
    <button
      type="button"
      className={`staff-tile ${person.is_clocked_in ? 'in' : 'out'}${photo ? ' has-photo' : ''}`}
      style={{ animationDelay: `${index * 45}ms` }}
      onClick={() => onSelect(person)}
      disabled={disabled}
    >
      {photo ? (
        <img className="staff-photo" src={photo} alt="" />
      ) : (
        <span className="staff-avatar" aria-hidden="true">
          {initials(person.name)}
        </span>
      )}
      <div className="staff-status-row">
        <span className="status-dot" aria-hidden="true" />
        <span className="status-label">
          {person.is_clocked_in ? 'On floor' : 'Off shift'}
        </span>
      </div>
      <span className="staff-name">{person.name}</span>
      <span className="staff-role">{roleLabel(person.role)}</span>
    </button>
  );
}

export default function PunchKiosk() {
  const now = useClock();
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [previewPerson, setPreviewPerson] = useState(null);
  const [location, setLocation] = useState(null);
  const [loadingLocation, setLoadingLocation] = useState(false);
  const [locationError, setLocationError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState('');
  const [result, setResult] = useState(null);
  const mounted = useRef(true);

  async function loadStaff() {
    try {
      setLoadError('');
      const data = await api.getStaff();
      if (mounted.current) setStaff(data);
    } catch (err) {
      if (mounted.current) setLoadError(err.message);
    } finally {
      if (mounted.current) setLoading(false);
    }
  }

  useEffect(() => {
    mounted.current = true;
    loadStaff();
    const refresh = setInterval(loadStaff, 30000);
    return () => {
      mounted.current = false;
      clearInterval(refresh);
    };
  }, []);

  async function fetchLocation() {
    setLoadingLocation(true);
    setLocationError('');
    setLocation(null);
    try {
      const coords = await getCurrentPosition();
      const location_label = await reverseGeocode(
        coords.latitude,
        coords.longitude
      );
      if (!mounted.current) return;
      setLocation({
        ...coords,
        location_label,
      });
    } catch (err) {
      if (mounted.current) setLocationError(err.message);
    } finally {
      if (mounted.current) setLoadingLocation(false);
    }
  }

  function openPreview(person) {
    setPreviewPerson(person);
    setConfirmError('');
    setResult(null);
    fetchLocation();
  }

  function closePreview() {
    if (confirming) return;
    setPreviewPerson(null);
    setLocation(null);
    setLocationError('');
    setConfirmError('');
  }

  async function confirmPunch() {
    if (!previewPerson || !location || confirming) return;
    setConfirming(true);
    setConfirmError('');
    try {
      const response = await api.punch({
        staff_id: previewPerson.id,
        latitude: location.latitude,
        longitude: location.longitude,
        accuracy: location.accuracy,
        location_label: location.location_label,
      });
      setPreviewPerson(null);
      setLocation(null);
      setResult(response);
      await loadStaff();
    } catch (err) {
      setConfirmError(err.message);
    } finally {
      setConfirming(false);
    }
  }

  const kitchen = staff.filter((s) => isKitchen(s.role));
  const baristas = staff.filter((s) => !isKitchen(s.role));
  const onFloor = staff.filter((s) => s.is_clocked_in).length;
  const previewOpen = Boolean(previewPerson);

  return (
    <section className="kiosk">
      <header className="kiosk-hero">
        <div className="kiosk-brand desktop-only">
          <p className="brand-mark">U Coffee</p>
          <h1>Staff punch</h1>
          <p className="lede">
            Tap your name, check the map, then confirm to clock in or out.
          </p>
        </div>
        <div className="kiosk-clock" aria-live="polite">
          <p className="clock-time">{formatTime(now)}</p>
          <p className="clock-date">{formatDate(now)}</p>
          <p className="clock-meta">
            {onFloor} on floor · {staff.length} active
          </p>
        </div>
      </header>

      {loading && <p className="state-msg">Loading staff…</p>}
      {loadError && (
        <div className="banner error">
          <p>{loadError}</p>
          <button type="button" className="btn ghost" onClick={loadStaff}>
            Retry
          </button>
        </div>
      )}

      {!loading && !loadError && (
        <>
          <div className="team-block">
            <h2 className="team-heading">
              Kitchen
              <span className="team-count">{kitchen.length} people</span>
            </h2>
            <div className="staff-grid">
              {kitchen.map((person, index) => (
                <StaffTile
                  key={person.id}
                  person={person}
                  index={index}
                  disabled={previewOpen || confirming}
                  onSelect={openPreview}
                />
              ))}
            </div>
          </div>

          <div className="team-block" style={{ animationDelay: '80ms' }}>
            <h2 className="team-heading">
              Barista
              <span className="team-count">{baristas.length} people</span>
            </h2>
            <div className="staff-grid">
              {baristas.map((person, index) => (
                <StaffTile
                  key={person.id}
                  person={person}
                  index={index}
                  disabled={previewOpen || confirming}
                  onSelect={openPreview}
                />
              ))}
            </div>
          </div>
        </>
      )}

      {previewPerson && (
        <PunchPreview
          person={previewPerson}
          location={location}
          loadingLocation={loadingLocation}
          locationError={locationError}
          confirming={confirming}
          confirmError={confirmError}
          onConfirm={confirmPunch}
          onCancel={closePreview}
          onRetryLocation={fetchLocation}
        />
      )}

      {result && (
        <PunchResult result={result} onClose={() => setResult(null)} />
      )}
    </section>
  );
}
