import { NavLink, Route, Routes } from 'react-router-dom';
import PunchKiosk from './pages/PunchKiosk';
import StaffAdmin from './pages/StaffAdmin';
import History from './pages/History';
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
          <NavLink to="/staff">Staff</NavLink>
          <NavLink to="/history">History</NavLink>
        </nav>
      </header>
      <main className="app-main">
        <Routes>
          <Route path="/" element={<PunchKiosk />} />
          <Route path="/staff" element={<StaffAdmin />} />
          <Route path="/history" element={<History />} />
        </Routes>
      </main>
    </div>
  );
}
