import { useEffect } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { CartProvider } from '../../context/CartContext';
import { restorePrinter } from '../../lib/receiptPrinter';
import '../../styles/ordering.css';

const NAV = [
  { to: '/ordering/pos', label: 'New Order' },
  { to: '/ordering/dashboard', label: 'Dashboard' },
  { to: '/ordering/orders', label: 'Orders' },
  { to: '/ordering/products', label: 'Products' },
  { to: '/ordering/categories', label: 'Categories' },
  { to: '/ordering/customers', label: 'Customers' },
  { to: '/ordering/inventory', label: 'Inventory' },
  { to: '/ordering/recipe', label: 'Recipe' },
  { to: '/ordering/profit', label: 'Profit' },
  { to: '/ordering/overheads', label: 'Overheads' },
  { to: '/ordering/reports', label: 'Reports' },
  { to: '/ordering/settings', label: 'Settings' },
];

export default function OrderingLayout() {
  useEffect(() => {
    restorePrinter();
  }, []);

  return (
    <CartProvider>
      <div className="pos-shell">
        <aside className="pos-sidebar" aria-label="Ordering System">
          <div className="pos-sidebar-brand">
            <span className="pos-mark" aria-hidden="true" />
            <div>
              <strong>Ordering System</strong>
              <small>U Coffee POS</small>
            </div>
          </div>
          <nav className="pos-side-nav">
            {NAV.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end}>
                {item.label}
              </NavLink>
            ))}
          </nav>
        </aside>
        <div className="pos-content">
          <Outlet />
        </div>
      </div>
    </CartProvider>
  );
}
