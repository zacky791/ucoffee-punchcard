import { useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { CartProvider } from '../../context/CartContext';
import { restorePrinter } from '../../lib/receiptPrinter';
import '../../styles/ordering.css';

const NAV_GROUPS = [
  {
    label: 'Sell',
    items: [
      { to: '/ordering/pos', label: 'New Order' },
      { to: '/ordering/dashboard', label: 'Dashboard' },
      { to: '/ordering/orders', label: 'Orders' },
    ],
  },
  {
    label: 'Menu',
    items: [
      { to: '/ordering/products', label: 'Products' },
      { to: '/ordering/categories', label: 'Categories' },
      { to: '/ordering/recipe', label: 'Recipe' },
    ],
  },
  {
    label: 'Stock',
    items: [
      { to: '/ordering/inventory', label: 'Inventory' },
      { to: '/ordering/restock-overview', label: 'Restock Overview' },
      { to: '/ordering/restock', label: 'Restock' },
    ],
  },
  {
    label: 'Finance',
    items: [
      { to: '/ordering/profit', label: 'Profit' },
      { to: '/ordering/margin-product', label: 'Margin product' },
      { to: '/ordering/overheads', label: 'Overheads' },
      { to: '/ordering/reports', label: 'Reports' },
    ],
  },
  {
    label: 'More',
    items: [
      { to: '/ordering/survey', label: 'Survey' },
      { to: '/ordering/chatgpt', label: 'Chat GPT' },
      { to: '/ordering/settings', label: 'Settings' },
    ],
  },
];

const NAV_ITEMS = NAV_GROUPS.flatMap((g) => g.items);

function groupForPath(pathname) {
  return (
    NAV_GROUPS.find((g) =>
      g.items.some((item) => pathname === item.to || pathname.startsWith(`${item.to}/`))
    )?.label || null
  );
}

export default function OrderingLayout() {
  const { pathname } = useLocation();
  const activeGroup = useMemo(() => groupForPath(pathname), [pathname]);
  const [open, setOpen] = useState(() => (activeGroup ? { [activeGroup]: true } : { Sell: true }));

  useEffect(() => {
    restorePrinter();
  }, []);

  useEffect(() => {
    if (!activeGroup) return;
    setOpen((prev) => (prev[activeGroup] ? prev : { ...prev, [activeGroup]: true }));
  }, [activeGroup]);

  useEffect(() => {
    const nav = document.querySelector('.pos-side-nav-mobile');
    const link = nav?.querySelector('a.active');
    if (!nav || !link || nav.scrollWidth <= nav.clientWidth) return;
    nav.scrollTo({
      left: link.offsetLeft - (nav.clientWidth - link.offsetWidth) / 2,
      behavior: 'smooth',
    });
  }, [pathname]);

  function toggleGroup(label) {
    setOpen((prev) => ({ ...prev, [label]: !prev[label] }));
  }

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

          <nav className="pos-side-nav pos-side-nav-desktop" aria-label="Ordering sections">
            {NAV_GROUPS.map((group) => {
              const isOpen = !!open[group.label];
              const hasActive = group.label === activeGroup;
              return (
                <div
                  key={group.label}
                  className={`pos-nav-group${isOpen ? ' open' : ''}${hasActive ? ' active' : ''}`}
                >
                  <button
                    type="button"
                    className="pos-nav-group-toggle"
                    aria-expanded={isOpen}
                    onClick={() => toggleGroup(group.label)}
                  >
                    <span>{group.label}</span>
                    <span className="pos-nav-caret" aria-hidden="true" />
                  </button>
                  {isOpen && (
                    <div className="pos-nav-group-items">
                      {group.items.map((item) => (
                        <NavLink key={item.to} to={item.to} end={item.end}>
                          {item.label}
                        </NavLink>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>

          <nav className="pos-side-nav pos-side-nav-mobile" aria-label="Ordering pages">
            {NAV_ITEMS.map((item) => (
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
