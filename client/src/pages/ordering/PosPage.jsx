import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api';
import { formatMoney, useCart } from '../../context/CartContext';
import PrinterConnectButton from '../../components/PrinterConnectButton';
import { printFromResult } from '../../lib/receiptPrinter';

function nowLabel() {
  return new Date().toLocaleString(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function PosPage() {
  const cart = useCart();
  const [clock, setClock] = useState(nowLabel);
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [tables, setTables] = useState([]);
  const [settings, setSettings] = useState(null);
  const [categoryId, setCategoryId] = useState('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modifierProduct, setModifierProduct] = useState(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [success, setSuccess] = useState(null);
  const [cartOpen, setCartOpen] = useState(false);
  const itemCount = cart.items.reduce((n, item) => n + Number(item.quantity || 0), 0);

  useEffect(() => {
    const t = setInterval(() => setClock(nowLabel()), 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const [cats, prods, tbls, sett] = await Promise.all([
          api.posGetCategories(),
          api.posGetProducts({ active: 'true' }),
          api.posGetTables(),
          api.posGetSettings(),
        ]);
        if (!alive) return;
        setCategories((cats || []).filter((c) => c.active !== false));
        setProducts(prods || []);
        setTables(tbls || []);
        setSettings(sett);
      } catch (err) {
        if (alive) setError(err.message || 'Failed to load menu');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const currency = settings?.currency || 'MYR';
  const taxRate = Number(settings?.tax_rate || 0);
  const serviceRate = Number(settings?.service_charge_rate || 0);
  const taxAmount = Math.round(cart.totals.taxable * taxRate * 100) / 100;
  const serviceAmount = Math.round(cart.totals.taxable * serviceRate * 100) / 100;
  const grandTotal =
    Math.round((cart.totals.taxable + taxAmount + serviceAmount) * 100) / 100;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (categoryId !== 'all' && p.category_id !== categoryId) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        String(p.sku || '')
          .toLowerCase()
          .includes(q)
      );
    });
  }, [products, categoryId, search]);

  function onProductClick(product) {
    if (!product.active) return;
    const groups = product.modifier_groups || [];
    if (groups.length) {
      setModifierProduct(product);
      return;
    }
    cart.addItem({
      product_id: product.id,
      product_name: product.name,
      sku: product.sku,
      base_price: product.base_price,
      modifiers: [],
    });
  }

  return (
    <div>
      <div className="pos-page-head">
        <div>
          <h1>New Order</h1>
          <p className="pos-meta">{clock}</p>
        </div>
        {settings?.hardware_provider === 'phone' && (
          <PrinterConnectButton onError={setError} />
        )}
      </div>

      {error && <div className="pos-alert error">{error}</div>}
      {success && (
        <div className={`pos-alert ${success.printOk ? 'ok' : 'warn'}`}>
          {success.message}
          {!success.printOk && success.orderId && (
            <button
              type="button"
              className="pos-btn ghost"
              style={{ marginLeft: 8 }}
              onClick={async () => {
                try {
                  const res = await api.posReprint(success.orderId);
                  const printed = await printFromResult(res.result);
                  setSuccess({
                    ...success,
                    printOk: printed.ok,
                    message: printed.ok
                      ? 'Receipt reprinted successfully.'
                      : printed.message || 'Reprint failed',
                  });
                } catch (err) {
                  setError(err.message);
                }
              }}
            >
              Retry print
            </button>
          )}
        </div>
      )}

      <div className="pos-workspace">
        <section>
          <div className="pos-toolbar">
            <div className="pos-tabs">
              <button
                type="button"
                className={`pos-tab ${categoryId === 'all' ? 'active' : ''}`}
                onClick={() => setCategoryId('all')}
              >
                All
              </button>
              {categories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`pos-tab ${categoryId === c.id ? 'active' : ''}`}
                  onClick={() => setCategoryId(c.id)}
                >
                  {c.name}
                </button>
              ))}
            </div>
            <input
              className="pos-search"
              placeholder="Search products or SKU"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {loading ? (
            <div className="pos-card">Loading menu…</div>
          ) : filtered.length === 0 ? (
            <div className="pos-card pos-cart-empty">
              No products found. Add items under Products, or run{' '}
              <code>supabase/pos-schema.sql</code>.
            </div>
          ) : (
            <div className="pos-products">
              {filtered.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="pos-product"
                  disabled={!p.active}
                  onClick={() => onProductClick(p)}
                >
                  {p.image_url ? (
                    <img className="pos-product-img" src={p.image_url} alt="" />
                  ) : (
                    <div className="pos-product-img placeholder">No image</div>
                  )}
                  <div className="pos-product-body">
                    <strong>{p.name}</strong>
                    <span className="pos-product-meta">
                      {p.category?.name || 'Uncategorized'}
                    </span>
                    <span className={`pos-badge ${p.active ? 'ok' : 'off'}`}>
                      {p.active ? 'Available' : 'Unavailable'}
                    </span>
                    <span className="pos-product-price">
                      {formatMoney(p.base_price, currency)}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        {cartOpen && (
          <div className="pos-cart-scrim" onClick={() => setCartOpen(false)} aria-hidden="true" />
        )}
        <aside className={`pos-cart ${cartOpen ? 'open' : ''}`} aria-label="Current order">
          <div className="pos-cart-head">
            <h2>Current order</h2>
            <button
              type="button"
              className="pos-cart-close"
              onClick={() => setCartOpen(false)}
              aria-label="Close order"
            >
              ✕
            </button>
          </div>
          <div className="pos-type-row">
            {[
              ['dine_in', 'Dine-in'],
              ['takeaway', 'Takeaway'],
              ['delivery', 'Delivery'],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={cart.orderType === value ? 'active' : ''}
                onClick={() => cart.setOrderType(value)}
              >
                {label}
              </button>
            ))}
          </div>

          {cart.orderType === 'dine_in' && (
            <select
              className="pos-select"
              value={cart.tableLabel}
              onChange={(e) => cart.setTable(e.target.value)}
            >
              <option value="">Table (optional)</option>
              {tables.map((t) => (
                <option key={t.id} value={t.label}>
                  {t.label}
                </option>
              ))}
            </select>
          )}

          <div className="pos-cart-items">
            {cart.items.length === 0 ? (
              <div className="pos-cart-empty">Tap a product to add it</div>
            ) : (
              cart.items.map((item) => (
                <div key={item.key} className="pos-cart-line">
                  <header>
                    <span>{item.product_name}</span>
                    <span>{formatMoney(item.line_total, currency)}</span>
                  </header>
                  {item.modifiers?.length > 0 && (
                    <ul className="pos-cart-mods">
                      {item.modifiers.map((m) => (
                        <li key={`${item.key}-${m.id || m.name}`}>+ {m.name}</li>
                      ))}
                    </ul>
                  )}
                  {item.notes && (
                    <div className="pos-product-meta">Note: {item.notes}</div>
                  )}
                  <div className="pos-qty">
                    <button
                      type="button"
                      onClick={() => cart.setQty(item.key, item.quantity - 1)}
                    >
                      −
                    </button>
                    <span>{item.quantity}</span>
                    <button
                      type="button"
                      onClick={() => cart.setQty(item.key, item.quantity + 1)}
                    >
                      +
                    </button>
                    <button
                      type="button"
                      className="pos-btn danger"
                      style={{ marginLeft: 'auto', padding: '0.35rem 0.55rem' }}
                      onClick={() => cart.removeItem(item.key)}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          <label className="pos-field">
            <span style={{ fontSize: '0.8rem', color: 'var(--pos-muted)' }}>
              Order notes
            </span>
            <textarea
              className="pos-textarea"
              rows={2}
              value={cart.notes}
              onChange={(e) => cart.setNotes(e.target.value)}
              placeholder="Allergies, special requests…"
            />
          </label>

          <label className="pos-field">
            <span style={{ fontSize: '0.8rem', color: 'var(--pos-muted)' }}>
              Discount ({currency})
            </span>
            <input
              className="pos-input"
              type="number"
              min="0"
              step="0.01"
              value={cart.discount}
              onChange={(e) => cart.setDiscount(e.target.value)}
            />
          </label>

          <div className="pos-totals">
            <div>
              <span>Subtotal</span>
              <span>{formatMoney(cart.totals.subtotal, currency)}</span>
            </div>
            <div>
              <span>Discount</span>
              <span>-{formatMoney(cart.totals.discount, currency)}</span>
            </div>
            {taxRate > 0 && (
              <div>
                <span>Tax</span>
                <span>{formatMoney(taxAmount, currency)}</span>
              </div>
            )}
            {serviceRate > 0 && (
              <div>
                <span>Service</span>
                <span>{formatMoney(serviceAmount, currency)}</span>
              </div>
            )}
            <div className="grand">
              <span>Total</span>
              <span>{formatMoney(grandTotal, currency)}</span>
            </div>
          </div>

          <button
            type="button"
            className="pos-btn primary block"
            disabled={!cart.items.length}
            onClick={() => {
              setSuccess(null);
              setCartOpen(false);
              setCheckoutOpen(true);
            }}
          >
            Checkout
          </button>
          <button
            type="button"
            className="pos-btn ghost block"
            disabled={!cart.items.length}
            onClick={() => cart.clear()}
          >
            Clear cart
          </button>
        </aside>
      </div>

      {itemCount > 0 && !cartOpen && (
        <button type="button" className="pos-cart-bar" onClick={() => setCartOpen(true)}>
          <span className="pos-cart-bar-count">{itemCount}</span>
          <span>View order</span>
          <strong>{formatMoney(grandTotal, currency)}</strong>
        </button>
      )}

      {modifierProduct && (
        <ModifierModal
          product={modifierProduct}
          currency={currency}
          onClose={() => setModifierProduct(null)}
          onAdd={(payload) => {
            cart.addItem(payload);
            setModifierProduct(null);
          }}
        />
      )}

      {checkoutOpen && (
        <CheckoutModal
          currency={currency}
          grandTotal={grandTotal}
          methods={settings?.payment_methods || ['cash', 'card', 'ewallet', 'other']}
          cart={cart}
          onClose={() => setCheckoutOpen(false)}
          onPaid={async (result) => {
            setCheckoutOpen(false);
            cart.clear();
            const printResult = result.hardware?.printResult;
            const printed = await printFromResult(printResult);
            const orderNumber = result.order?.order_number;
            setSuccess({
              orderId: result.order?.id,
              printOk: printed.ok,
              message: printResult?.client_print
                ? printed.ok
                  ? `Paid · ${orderNumber}. Receipt printed.`
                  : `Paid · ${orderNumber}. Print failed: ${printed.message}`
                : result.message ||
                  (printed.ok
                    ? `Paid · ${orderNumber}`
                    : `Paid · ${orderNumber} — print failed`),
            });
          }}
        />
      )}
    </div>
  );
}

function ModifierModal({ product, currency, onClose, onAdd }) {
  const groups = product.modifier_groups || [];
  const [selected, setSelected] = useState(() => {
    const init = {};
    for (const g of groups) {
      init[g.id] = g.required && g.modifiers?.[0] ? [g.modifiers[0].id] : [];
    }
    return init;
  });
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  const chosenMods = useMemo(() => {
    const list = [];
    for (const g of groups) {
      for (const id of selected[g.id] || []) {
        const mod = (g.modifiers || []).find((m) => m.id === id);
        if (mod) list.push({ id: mod.id, name: mod.name, price_delta: mod.price_delta, group: g.name });
      }
    }
    return list;
  }, [groups, selected]);

  const unit = useMemo(() => {
    const delta = chosenMods.reduce((s, m) => s + Number(m.price_delta || 0), 0);
    return Math.round((Number(product.base_price) + delta) * 100) / 100;
  }, [product.base_price, chosenMods]);

  function toggle(group, modId) {
    setSelected((prev) => {
      const current = prev[group.id] || [];
      const max = Number(group.max_select || 1);
      if (current.includes(modId)) {
        return { ...prev, [group.id]: current.filter((id) => id !== modId) };
      }
      if (max <= 1) return { ...prev, [group.id]: [modId] };
      if (current.length >= max) return prev;
      return { ...prev, [group.id]: [...current, modId] };
    });
  }

  function submit() {
    for (const g of groups) {
      const count = (selected[g.id] || []).length;
      if (g.required && count < Math.max(1, g.min_select || 1)) {
        setError(`Select ${g.name}`);
        return;
      }
      if (count < (g.min_select || 0)) {
        setError(`Select at least ${g.min_select} for ${g.name}`);
        return;
      }
    }
    onAdd({
      product_id: product.id,
      product_name: product.name,
      sku: product.sku,
      base_price: product.base_price,
      modifiers: chosenMods,
      notes,
    });
  }

  return (
    <div className="pos-modal-backdrop" onClick={onClose}>
      <div className="pos-modal" onClick={(e) => e.stopPropagation()}>
        <h2>{product.name}</h2>
        <p className="hint">Customize before adding · {formatMoney(unit, currency)}</p>
        {error && <div className="pos-alert error">{error}</div>}
        {groups.map((g) => (
          <div key={g.id} className="pos-mod-group">
            <h3>
              {g.name}
              {g.required ? ' *' : ''}
            </h3>
            <div className="pos-mod-options">
              {(g.modifiers || []).map((m) => {
                const active = (selected[g.id] || []).includes(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    className={`pos-chip ${active ? 'active' : ''}`}
                    onClick={() => toggle(g, m.id)}
                  >
                    {m.name}
                    {Number(m.price_delta) > 0
                      ? ` (+${formatMoney(m.price_delta, currency)})`
                      : ''}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        <label className="pos-field">
          <span>Item note</span>
          <input
            className="pos-input"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Less ice, etc."
          />
        </label>
        <div className="pos-modal-actions">
          <button type="button" className="pos-btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="pos-btn primary" onClick={submit}>
            Add · {formatMoney(unit, currency)}
          </button>
        </div>
      </div>
    </div>
  );
}

function CheckoutModal({ currency, grandTotal, methods, cart, onClose, onPaid }) {
  const [method, setMethod] = useState(methods[0] || 'cash');
  const [received, setReceived] = useState(String(grandTotal.toFixed(2)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const receivedNum = Number(received) || 0;
  const change =
    method === 'cash'
      ? Math.round(Math.max(0, receivedNum - grandTotal) * 100) / 100
      : 0;

  async function confirm() {
    setError('');
    if (method === 'cash' && receivedNum < grandTotal) {
      setError('Amount received is less than total');
      return;
    }
    setBusy(true);
    try {
      const result = await api.posCheckout({
        items: cart.items,
        order_type: cart.orderType,
        table_label: cart.tableLabel || null,
        notes: cart.notes || null,
        discount: cart.discount,
        payment_method: method,
        amount_received: method === 'cash' ? receivedNum : grandTotal,
      });
      onPaid(result);
    } catch (err) {
      setError(err.message || 'Payment failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pos-modal-backdrop" onClick={busy ? undefined : onClose}>
      <div className="pos-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Checkout</h2>
        <p className="hint">Confirm payment · drawer & receipt via hardware provider</p>
        {error && <div className="pos-alert error">{error}</div>}

        <div className="pos-totals" style={{ borderTop: 0, paddingTop: 0 }}>
          <div className="grand">
            <span>Amount due</span>
            <span>{formatMoney(grandTotal, currency)}</span>
          </div>
        </div>

        <div className="pos-field" style={{ marginTop: '0.85rem' }}>
          <label>Payment method</label>
          <div className="pos-mod-options">
            {methods.map((m) => (
              <button
                key={m}
                type="button"
                className={`pos-chip ${method === m ? 'active' : ''}`}
                onClick={() => setMethod(m)}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        {method === 'cash' && (
          <>
            <label className="pos-field" style={{ marginTop: '0.75rem' }}>
              <span>Amount received</span>
              <input
                className="pos-input"
                type="number"
                min="0"
                step="0.01"
                value={received}
                onChange={(e) => setReceived(e.target.value)}
              />
            </label>
            <div className="pos-totals">
              <div>
                <span>Change due</span>
                <strong>{formatMoney(change, currency)}</strong>
              </div>
            </div>
            <div className="pos-mod-options" style={{ marginTop: '0.5rem' }}>
              {[grandTotal, 20, 50, 100].map((n) => (
                <button
                  key={n}
                  type="button"
                  className="pos-chip"
                  onClick={() =>
                    setReceived(String(Math.max(grandTotal, n).toFixed(2)))
                  }
                >
                  {formatMoney(Math.max(grandTotal, n), currency)}
                </button>
              ))}
            </div>
          </>
        )}

        <div className="pos-modal-actions">
          <button type="button" className="pos-btn ghost" disabled={busy} onClick={onClose}>
            Back
          </button>
          <button
            type="button"
            className="pos-btn primary"
            disabled={busy}
            onClick={confirm}
          >
            {busy ? 'Processing…' : 'Confirm payment'}
          </button>
        </div>
      </div>
    </div>
  );
}
