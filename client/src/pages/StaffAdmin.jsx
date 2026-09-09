import { useEffect, useState } from 'react';
import { api } from '../api';
import { roleLabel } from '../lib/time';

const KITCHEN_ROLES = new Set(['head_chef', 'assistant_chef', 'kitchen']);
const STAFF_PIN = String(import.meta.env.VITE_STAFF_PIN || '9897');

function StaffLock({ onUnlock }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  function submit(e) {
    e.preventDefault();
    if (String(pin) === STAFF_PIN) {
      onUnlock();
      return;
    }
    setError('Incorrect PIN');
    setPin('');
  }

  return (
    <section className="page staff-lock">
      <div className="staff-lock-card">
        <h1>Staff access</h1>

        <form className="staff-lock-form" onSubmit={submit}>
          <label>
            Staff PIN
            <input
              type="password"
              inputMode="numeric"
              pattern="\d*"
              maxLength={8}
              autoFocus
              autoComplete="off"
              value={pin}
              onChange={(e) => {
                setPin(e.target.value.replace(/\D/g, '').slice(0, 8));
                setError('');
              }}
              placeholder="Enter PIN"
            />
          </label>
          {error && <p className="banner error">{error}</p>}
          <button type="submit" className="btn primary">
            Unlock staff
          </button>
        </form>
      </div>
    </section>
  );
}

export default function StaffAdmin() {
  const [unlocked, setUnlocked] = useState(false);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', role: 'barista' });
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');

  async function load() {
    try {
      setError('');
      setLoading(true);
      const data = await api.getStaff();
      setStaff(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!unlocked) return undefined;
    load();
    return undefined;
  }, [unlocked]);

  async function onSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setNotice('');
    setError('');
    try {
      await api.createStaff(form);
      setForm({ name: '', role: 'barista' });
      setNotice('Staff member added');
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function deactivate(id) {
    if (!window.confirm('Deactivate this staff member?')) return;
    try {
      await api.updateStaff(id, { active: false });
      setNotice('Staff deactivated');
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  if (!unlocked) {
    return <StaffLock onUnlock={() => setUnlocked(true)} />;
  }

  const kitchen = staff.filter((s) => KITCHEN_ROLES.has(s.role));
  const baristas = staff.filter((s) => !KITCHEN_ROLES.has(s.role));

  return (
    <section className="page">
      <header className="page-header">
        <h1>Staff directory</h1>
      </header>

      <div className="history-toolbar compact">
        <button
          type="button"
          className="btn ghost"
          onClick={() => setUnlocked(false)}
        >
          Lock staff page
        </button>
      </div>

      <form className="staff-form no-pin" onSubmit={onSubmit}>
        <label>
          Full name
          <input
            required
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="e.g. Haziq"
          />
        </label>
        <label>
          Role
          <select
            value={form.role}
            onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
          >
            <option value="head_chef">Head chef</option>
            <option value="assistant_chef">Assistant chef</option>
            <option value="barista">Barista</option>
            <option value="kitchen">Kitchen</option>
          </select>
        </label>
        <button type="submit" className="btn primary" disabled={saving}>
          {saving ? 'Saving…' : 'Add staff'}
        </button>
      </form>

      {notice && <p className="banner ok">{notice}</p>}
      {error && <p className="banner error">{error}</p>}

      {loading ? (
        <p className="state-msg">Loading…</p>
      ) : (
        <>
          <h2 className="team-heading">
            Kitchen
            <span className="team-count">{kitchen.length} people</span>
          </h2>
          <ul className="staff-list">
            {kitchen.map((person) => (
              <li key={person.id}>
                <div>
                  <strong>{person.name}</strong>
                  <span>{roleLabel(person.role)}</span>
                </div>
                <div className="list-meta">
                  <span className={person.is_clocked_in ? 'tag in' : 'tag out'}>
                    {person.is_clocked_in ? 'On floor' : 'Off'}
                  </span>
                  <button
                    type="button"
                    className="btn ghost compact"
                    onClick={() => deactivate(person.id)}
                  >
                    Deactivate
                  </button>
                </div>
              </li>
            ))}
          </ul>

          <h2 className="team-heading">
            Barista
            <span className="team-count">{baristas.length} people</span>
          </h2>
          <ul className="staff-list">
            {baristas.map((person) => (
              <li key={person.id}>
                <div>
                  <strong>{person.name}</strong>
                  <span>{roleLabel(person.role)}</span>
                </div>
                <div className="list-meta">
                  <span className={person.is_clocked_in ? 'tag in' : 'tag out'}>
                    {person.is_clocked_in ? 'On floor' : 'Off'}
                  </span>
                  <button
                    type="button"
                    className="btn ghost compact"
                    onClick={() => deactivate(person.id)}
                  >
                    Deactivate
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
