import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../api';
import { formatMoney } from '../../context/CartContext';
import Toast from '../../components/Toast';

const emptyForm = {
  name: '',
  sku: '',
  category_id: '',
  description: '',
  base_price: '',
  image_url: '',
  active: true,
};

function ProductModal({ product, categories, onClose, onSaved }) {
  const isNew = !product?.id;
  const [form, setForm] = useState(() =>
    isNew
      ? emptyForm
      : {
          name: product.name || '',
          sku: product.sku || '',
          category_id: product.category_id || '',
          description: product.description || '',
          base_price: String(product.base_price ?? ''),
          image_url: product.image_url || '',
          active: product.active !== false,
        }
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const payload = {
        ...form,
        base_price: Number(form.base_price) || 0,
        category_id: form.category_id || null,
        image_url: form.image_url || null,
      };
      if (isNew) await api.posCreateProduct(payload);
      else await api.posUpdateProduct(product.id, payload);
      onSaved(isNew ? `${form.name} added` : `${form.name} updated`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pos-modal-backdrop" onClick={busy ? undefined : onClose}>
      <form className="pos-modal" onClick={(e) => e.stopPropagation()} onSubmit={save}>
        <h2>{isNew ? 'Add product' : `Edit ${product.name}`}</h2>
        {error && <div className="pos-alert error">{error}</div>}
        <div className="pos-form-grid">
          <label className="pos-field">
            <span>Name</span>
            <input
              className="pos-input"
              required
              autoFocus
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>
          <label className="pos-field">
            <span>SKU</span>
            <input
              className="pos-input"
              value={form.sku}
              onChange={(e) => setForm({ ...form, sku: e.target.value })}
            />
          </label>
          <label className="pos-field">
            <span>Category</span>
            <select
              className="pos-select"
              value={form.category_id}
              onChange={(e) => setForm({ ...form, category_id: e.target.value })}
            >
              <option value="">None</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="pos-field">
            <span>Base price</span>
            <input
              className="pos-input"
              type="number"
              min="0"
              step="0.01"
              required
              value={form.base_price}
              onChange={(e) => setForm({ ...form, base_price: e.target.value })}
            />
          </label>
          <label className="pos-field full">
            <span>Image URL</span>
            <input
              className="pos-input"
              value={form.image_url}
              onChange={(e) => setForm({ ...form, image_url: e.target.value })}
            />
          </label>
          <label className="pos-field full">
            <span>Description</span>
            <textarea
              className="pos-textarea"
              rows={2}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </label>
          <label className="pos-switch-row full">
            <span>
              <strong>Active</strong>
              <small>Show this product on New Order</small>
            </span>
            <span className="pos-switch">
              <input
                type="checkbox"
                role="switch"
                checked={form.active}
                onChange={(e) => setForm({ ...form, active: e.target.checked })}
              />
              <span className="pos-switch-track" aria-hidden="true" />
            </span>
          </label>
        </div>
        <div className="pos-modal-actions">
          <button type="button" className="pos-btn ghost" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="pos-btn primary" disabled={busy}>
            {busy ? 'Saving…' : isNew ? 'Add product' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  );
}

function ProductCard({ product, currency, onEdit }) {
  const active = product.active !== false;
  return (
    <article
      className="pos-card pos-inv-card"
      role="button"
      tabIndex={0}
      onClick={() => onEdit(product)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onEdit(product);
        }
      }}
    >
      <div className="pos-inv-card-media">
        {product.image_url ? (
          <img src={product.image_url} alt="" loading="lazy" />
        ) : (
          <span className="pos-inv-card-placeholder" aria-hidden="true" />
        )}
        {active ? (
          <span className="pos-badge ok pos-inv-card-badge">Active</span>
        ) : (
          <span className="pos-badge off pos-inv-card-badge">Inactive</span>
        )}
      </div>
      <div className="pos-inv-card-body">
        <strong>{product.name}</strong>
        <span className="pos-product-meta">
          {product.category?.name || 'No category'}
          {product.sku ? ` · ${product.sku}` : ''}
        </span>
        <span className="pos-inv-card-cost">{formatMoney(product.base_price, currency)}</span>
      </div>
    </article>
  );
}

export default function ProductsPage() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [currency, setCurrency] = useState('MYR');
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [view, setView] = useState('cards');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const clearToast = useCallback(() => setToast(null), []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [prods, cats, sett] = await Promise.all([
        api.posGetProducts(),
        api.posGetCategories(),
        api.posGetSettings(),
      ]);
      setProducts(prods || []);
      setCategories(cats || []);
      setCurrency(sett?.currency || 'MYR');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    if (categoryFilter === 'all') return products;
    if (categoryFilter === 'none') return products.filter((p) => !p.category_id);
    return products.filter((p) => p.category_id === categoryFilter);
  }, [products, categoryFilter]);

  const grouped = useMemo(() => {
    const map = new Map();
    for (const p of filtered) {
      const key = p.category_id || 'none';
      const label = p.category?.name || 'No category';
      if (!map.has(key)) map.set(key, { id: key, label, items: [] });
      map.get(key).items.push(p);
    }
    const order = new Map(categories.map((c, i) => [c.id, i]));
    return [...map.values()].sort((a, b) => {
      if (a.id === 'none') return 1;
      if (b.id === 'none') return -1;
      return (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999);
    });
  }, [filtered, categories]);

  return (
    <div>
      <div className="pos-page-head">
        <div>
          <h1>Products / Menu</h1>
        </div>
        <button type="button" className="pos-btn primary" onClick={() => setEditing({})}>
          + Add product
        </button>
      </div>

      {error && <div className="pos-alert error">{error}</div>}

      <div className="pos-inv-toolbar">
        <div className="pos-segment" role="tablist" aria-label="Category">
          <button
            type="button"
            role="tab"
            className={categoryFilter === 'all' ? 'active' : ''}
            aria-selected={categoryFilter === 'all'}
            onClick={() => setCategoryFilter('all')}
          >
            All
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              role="tab"
              className={categoryFilter === c.id ? 'active' : ''}
              aria-selected={categoryFilter === c.id}
              onClick={() => setCategoryFilter(c.id)}
            >
              {c.name}
            </button>
          ))}
        </div>
        <div className="pos-segment" role="tablist" aria-label="View">
          <button
            type="button"
            role="tab"
            className={view === 'cards' ? 'active' : ''}
            aria-selected={view === 'cards'}
            onClick={() => setView('cards')}
          >
            Cards
          </button>
          <button
            type="button"
            role="tab"
            className={view === 'list' ? 'active' : ''}
            aria-selected={view === 'list'}
            onClick={() => setView('list')}
          >
            List
          </button>
        </div>
      </div>

      {loading ? (
        <div className="pos-card">Loading…</div>
      ) : view === 'cards' ? (
        grouped.length ? (
          grouped.map((g) => (
            <section key={g.id} className="pos-inv-station">
              <h2 className="pos-inv-station-title">{g.label}</h2>
              <div className="pos-inv-grid">
                {g.items.map((p) => (
                  <ProductCard key={p.id} product={p} currency={currency} onEdit={setEditing} />
                ))}
              </div>
            </section>
          ))
        ) : (
          <div className="pos-card">No products yet. Add your menu items first.</div>
        )
      ) : (
        <div className="pos-card" style={{ overflowX: 'auto', marginBottom: '0.85rem' }}>
          <table className="pos-table stack">
            <thead>
              <tr>
                <th>Product</th>
                <th>Category</th>
                <th>Price</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr
                  key={p.id}
                  className="pos-row-link"
                  tabIndex={0}
                  role="button"
                  onClick={() => setEditing(p)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setEditing(p);
                    }
                  }}
                >
                  <td className="pos-cell-title">
                    <strong>{p.name}</strong>
                    {p.sku ? <div className="pos-product-meta">{p.sku}</div> : null}
                  </td>
                  <td data-label="Category">{p.category?.name || '—'}</td>
                  <td data-label="Price">{formatMoney(p.base_price, currency)}</td>
                  <td data-label="Status">
                    <span className={`pos-badge ${p.active !== false ? 'ok' : 'off'}`}>
                      {p.active !== false ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="pos-cell-action">
                    <button
                      type="button"
                      className="pos-btn ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditing(p);
                      }}
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
              {!filtered.length && (
                <tr>
                  <td colSpan={5}>No products yet. Add your menu items first.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <ProductModal
          product={editing}
          categories={categories}
          onClose={() => setEditing(null)}
          onSaved={async (text) => {
            setEditing(null);
            setToast({ tone: 'ok', text });
            await load();
          }}
        />
      )}
      <Toast toast={toast} onDone={clearToast} />
    </div>
  );
}
