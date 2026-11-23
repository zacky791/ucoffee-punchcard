import { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { CartProvider } from '../../context/CartContext';
import { restorePrinter } from '../../lib/receiptPrinter';
import '../../styles/ordering.css';

const PINNED_NAV = [{ to: '/ordering/pos', label: 'New Order' }];
const MOBILE_MQ = '(max-width: 980px)';

const NAV_GROUPS = [
  {
    id: 'main',
    label: 'Main',
    items: [
      { to: '/ordering/dashboard', label: 'Dashboard' },
      { to: '/ordering/orders', label: 'Orders' },
    ],
  },
  {
    id: 'menu',
    label: 'Menu',
    items: [
      { to: '/ordering/products', label: 'Products' },
      { to: '/ordering/categories', label: 'Categories' },
      { to: '/ordering/recipe', label: 'Recipe' },
    ],
  },
  {
    id: 'stock',
    label: 'Stock',
    items: [
      { to: '/ordering/inventory', label: 'Inventory' },
      { to: '/ordering/restock-overview', label: 'Restock Overview' },
      { to: '/ordering/restock', label: 'Restock' },
    ],
  },
  {
    id: 'finance',
    label: 'Finance',
    items: [
      { to: '/ordering/profit', label: 'Profit' },
      { to: '/ordering/margin-product', label: 'Margin product' },
      { to: '/ordering/overheads', label: 'Overheads' },
      { to: '/ordering/reports', label: 'Reports' },
    ],
  },
  {
    id: 'more',
    label: 'More',
    items: [
      { to: '/ordering/survey', label: 'Survey' },
      { to: '/ordering/chatgpt', label: 'Chat GPT' },
      { to: '/ordering/settings', label: 'Settings' },
    ],
  },
];

function groupForPath(pathname) {
  return (
    NAV_GROUPS.find((g) =>
      g.items.some((item) => pathname === item.to || pathname.startsWith(`${item.to}/`))
    )?.label || null
  );
}

function isMobileNav() {
  return typeof window !== 'undefined' && window.matchMedia(MOBILE_MQ).matches;
}

export default function OrderingLayout() {
  const { pathname } = useLocation();
  const activeGroup = useMemo(() => groupForPath(pathname), [pathname]);
  const [desktopOpen, setDesktopOpen] = useState(() => activeGroup || 'Main');
  const [mobileOpen, setMobileOpen] = useState(null);
  const mobileNavRef = useRef(null);
  const mobileOpenData = useMemo(
    () => NAV_GROUPS.find((g) => g.label === mobileOpen) || null,
    [mobileOpen]
  );

  useEffect(() => {
    restorePrinter();
  }, []);

  useEffect(() => {
    if (!activeGroup) return;
    setDesktopOpen(activeGroup);
  }, [activeGroup]);

  useEffect(() => {
    setMobileOpen(null);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    function onPointerDown(e) {
      if (!mobileNavRef.current?.contains(e.target)) setMobileOpen(null);
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [mobileOpen]);

  useEffect(() => {
    if (!isMobileNav()) return;
    const scroll = mobileNavRef.current?.querySelector('.pos-nav-scroll');
    const chip =
      scroll?.querySelector('.pos-nav-group-toggle.active') ||
      scroll?.querySelector('.pos-nav-pinned-link.active');
    if (!scroll || !chip || scroll.scrollWidth <= scroll.clientWidth) return;
    scroll.scrollTo({
      left: chip.offsetLeft - (scroll.clientWidth - chip.offsetWidth) / 2,
      behavior: 'smooth',
    });
  }, [pathname, activeGroup]);

  function toggleDesktop(label) {
    setDesktopOpen((prev) => (prev === label ? null : label));
  }

  function toggleMobile(label) {
    setMobileOpen((prev) => (prev === label ? null : label));
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
            <div className="pos-nav-pinned">
              {PINNED_NAV.map((item) => (
                <NavLink key={item.to} to={item.to} end={item.end} className="pos-nav-pinned-link">
                  {item.label}
                </NavLink>
              ))}
            </div>

            <div className="pos-nav-groups">
              {NAV_GROUPS.map((group) => {
                const isOpen = desktopOpen === group.label;
                const hasActive = group.label === activeGroup;
                return (
                  <div
                    key={group.label}
                    className={`pos-nav-group pos-nav-group--${group.id}${isOpen ? ' open' : ''}${hasActive ? ' active' : ''}`}
                  >
                    <button
                      type="button"
                      className="pos-nav-group-toggle"
                      aria-expanded={isOpen}
                      onClick={() => toggleDesktop(group.label)}
                    >
                      <span className="pos-nav-group-dot" aria-hidden="true" />
                      <span className="pos-nav-group-label">{group.label}</span>
                      <span className="pos-nav-caret" aria-hidden="true" />
                    </button>
                    {isOpen && (
                      <div className="pos-nav-group-items" role="group" aria-label={`${group.label} pages`}>
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
            </div>
          </nav>

          <nav
            className="pos-side-nav pos-side-nav-mobile"
            aria-label="Ordering sections"
            ref={mobileNavRef}
          >
            <div className="pos-nav-scroll">
              {PINNED_NAV.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className="pos-nav-pinned-link"
                  onClick={() => setMobileOpen(null)}
                >
                  {item.label}
                </NavLink>
              ))}
              {NAV_GROUPS.map((group) => {
                const isOpen = mobileOpen === group.label;
                const hasActive = group.label === activeGroup;
                return (
                  <button
                    key={group.label}
                    type="button"
                    className={`pos-nav-group-toggle pos-nav-group--${group.id}${isOpen ? ' open' : ''}${hasActive ? ' active' : ''}`}
                    aria-expanded={isOpen}
                    aria-haspopup="menu"
                    onClick={() => toggleMobile(group.label)}
                  >
                    <span className="pos-nav-group-dot" aria-hidden="true" />
                    <span className="pos-nav-group-label">{group.label}</span>
                    <span className="pos-nav-caret" aria-hidden="true" />
                  </button>
                );
              })}
            </div>

            {mobileOpenData && (
              <div
                className={`pos-nav-dropdown pos-nav-group--${mobileOpenData.id}`}
                role="menu"
                aria-label={`${mobileOpenData.label} pages`}
              >
                {mobileOpenData.items.map((item) => (
                  <NavLink key={item.to} to={item.to} end={item.end} role="menuitem">
                    {item.label}
                  </NavLink>
                ))}
              </div>
            )}
          </nav>
        </aside>
        <div className="pos-content">
          <Outlet />
        </div>
      </div>
    </CartProvider>
  );
}
