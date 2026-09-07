import { NavLink, Route, Routes } from 'react-router-dom';
import PunchKiosk from './pages/PunchKiosk';
import StaffAdmin from './pages/StaffAdmin';
import History from './pages/History';
import Performance from './pages/Performance';
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
          <NavLink to="/performance">Performance</NavLink>
          <NavLink to="/history">History</NavLink>
          <NavLink to="/schedule">Schedule</NavLink>
          <NavLink to="/staff">Staff</NavLink>
        </nav>
      </header>
      <main className="app-main">
        <Routes>
          <Route path="/" element={<PunchKiosk />} />
          <Route path="/performance" element={<Performance />} />
          <Route path="/history" element={<History />} />
          <Route path="/schedule" element={<Schedule />} />
          <Route path="/staff" element={<StaffAdmin />} />
        </Routes>
      </main>
    </div>
  );
}
