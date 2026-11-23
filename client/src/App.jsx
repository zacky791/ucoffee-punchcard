import { Link, NavLink, Navigate, Route, Routes } from 'react-router-dom';
import PunchKiosk from './pages/PunchKiosk';
import StaffAdmin from './pages/StaffAdmin';
import Proof from './pages/Proof';
import Performance from './pages/Performance';
import WeekOverview from './pages/WeekOverview';
import Schedule from './pages/Schedule';
import OrderingLayout from './pages/ordering/OrderingLayout';
import DashboardPage from './pages/ordering/DashboardPage';
import PosPage from './pages/ordering/PosPage';
import OrdersPage from './pages/ordering/OrdersPage';
import ProductsPage from './pages/ordering/ProductsPage';
import CategoriesPage from './pages/ordering/CategoriesPage';
import InventoryPage from './pages/ordering/InventoryPage';
import ReportsPage from './pages/ordering/ReportsPage';
import ProfitPage from './pages/ordering/ProfitPage';
import MarginProductPage from './pages/ordering/MarginProductPage';
import RecipePage from './pages/ordering/RecipePage';
import OverheadsPage from './pages/ordering/OverheadsPage';
import ExpensesPage from './pages/ordering/ExpensesPage';
import RestockPage from './pages/ordering/RestockPage';
import SettingsPage from './pages/ordering/SettingsPage';
import SurveyPage from './pages/ordering/SurveyPage';
import ChatGptPage from './pages/ordering/ChatGptPage';
import './App.css';

export default function App() {
  return (
    <div className="app-shell">
      <div className="atmosphere" aria-hidden="true" />
      <header className="top-bar">
        <Link to="/ordering/pos" className="nav-brand">
          <img
            className="brand-glyph"
            src="/favicon.png"
            alt=""
            width={28}
            height={28}
          />
          <span>U Coffee</span>
        </Link>
        <nav className="nav-links" aria-label="Main">
          <NavLink to="/ordering">Ordering System</NavLink>
          <NavLink to="/punch">Punch</NavLink>
          <NavLink to="/working-schedule">Working schedule</NavLink>
          <NavLink to="/planning">Planning</NavLink>
          <NavLink to="/salary">Salary table</NavLink>
          <NavLink to="/staff">Staff</NavLink>
        </nav>
      </header>
      <main className="app-main">
        <Routes>
          <Route path="/" element={<Navigate to="/ordering/pos" replace />} />
          <Route path="/punch" element={<PunchKiosk />} />
          <Route path="/working-schedule" element={<WeekOverview />} />
          <Route path="/planning" element={<Schedule />} />
          <Route path="/proof" element={<Proof />} />
          <Route path="/salary" element={<Performance />} />
          <Route path="/staff" element={<StaffAdmin />} />
          <Route path="/ordering" element={<OrderingLayout />}>
            <Route index element={<Navigate to="pos" replace />} />
            <Route path="pos" element={<PosPage />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="orders" element={<OrdersPage />} />
            <Route path="products" element={<ProductsPage />} />
            <Route path="categories" element={<CategoriesPage />} />
            <Route path="inventory" element={<InventoryPage />} />
            <Route path="restock-overview" element={<ExpensesPage />} />
            <Route path="restock" element={<RestockPage />} />
            <Route path="expenses" element={<Navigate to="/ordering/restock-overview" replace />} />
            <Route path="survey" element={<SurveyPage />} />
            <Route path="chatgpt" element={<ChatGptPage />} />
            <Route path="recipe" element={<RecipePage />} />
            <Route path="profit" element={<ProfitPage />} />
            <Route path="margin-product" element={<MarginProductPage />} />
            <Route path="overheads" element={<OverheadsPage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
          <Route path="/history" element={<Navigate to="/proof" replace />} />
          <Route path="/performance" element={<Navigate to="/salary" replace />} />
          <Route path="/week" element={<Navigate to="/working-schedule" replace />} />
          <Route path="/schedule" element={<Navigate to="/planning" replace />} />
        </Routes>
      </main>
    </div>
  );
}
