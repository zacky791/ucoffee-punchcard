import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import PunchKiosk from './pages/PunchKiosk';
import StaffAdmin from './pages/StaffAdmin';
import Proof from './pages/Proof';
import Performance from './pages/Performance';
import WeekOverview from './pages/WeekOverview';
import Schedule from './pages/Schedule';
import './App.css';

export default function App() {
  return (
    <div className="app-shell">
      <div className="atmosphere" aria-hidden="true" />
      <header className="top-bar">
        <NavLink to="/" end className="nav-brand">
          <span className="brand-glyph" aria-hidden="true" />
          <span>U Coffee</span>
        </NavLink>
        <nav className="nav-links" aria-label="Main">
          <NavLink to="/" end>
            Punch
          </NavLink>
          <NavLink to="/working-schedule">Working schedule</NavLink>
          <NavLink to="/planning">Planning</NavLink>
          <NavLink to="/salary">Salary table</NavLink>
          <NavLink to="/staff">Staff</NavLink>
        </nav>
      </header>
      <main className="app-main">
        <Routes>
          <Route path="/" element={<PunchKiosk />} />
          <Route path="/working-schedule" element={<WeekOverview />} />
          <Route path="/planning" element={<Schedule />} />
          <Route path="/proof" element={<Proof />} />
          <Route path="/salary" element={<Performance />} />
          <Route path="/staff" element={<StaffAdmin />} />
          <Route path="/history" element={<Navigate to="/proof" replace />} />
          <Route path="/performance" element={<Navigate to="/salary" replace />} />
          <Route path="/week" element={<Navigate to="/working-schedule" replace />} />
          <Route path="/schedule" element={<Navigate to="/planning" replace />} />
        </Routes>
      </main>
    </div>
  );
}
