import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import Toast from '../../components/Toast';

export default function CategoriesPage() {
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [toast, setToast] = useState(null);
  const clearToast = useCallback(() => setToast(null), []);

  const load = useCallback(async () => {
    try {
      const [cats, prods] = await Promise.all([api.posGetCategories(), api.posGetProducts()]);
      setCategories(cats || []);
      setProducts(prods || []);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const countByCategory = useMemo(() => {
    const counts = {};
    for (const p of products) counts[p.category_id] = (counts[p.category_id] || 0) + 1;
    return counts;
  }, [products]);

  async function create(e) {
    e.preventDefault();
    try {
      const cat = await api.posCreateCategory({ name, sort_order: categories.length + 1 });
      setName('');
      await load();
      setEditingId(cat?.id || null);
    } catch (err) {
      setError(err.message);
    }
  }

  async function toggleActive(cat) {
    try {
      await api.posUpdateCategory(cat.id, { active: !cat.active });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  const editing = categories.find((c) => c.id === editingId);

  return (
    <div>
      <div className="pos-page-head">
        <div>
          <h1>Categories</h1>
          <p>Group your menu, then add the food or drinks under each category</p>
        </div>
      </div>
      {error && <div className="pos-alert error">{error}</div>}

      <form className="pos-filters" onSubmit={create}>
        <input
          className="pos-input"
          placeholder="New category name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <button type="submit" className="pos-btn primary">
          Add category
        </button>
      </form>

      <div className="pos-card">
        <table className="pos-table stack">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Items</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {categories.map((c) => (
              <tr key={c.id}>
                <td className="pos-cell-title">
                  <strong>{c.name}</strong>
                </td>
                <td data-label="Type">{c.kind === 'drink' ? 'Drink' : 'Food'}</td>
                <td data-label="Items">{countByCategory[c.id] || 0}</td>
                <td data-label="Status">
                  <span className={`pos-badge ${c.active ? 'ok' : 'off'}`}>
                    {c.active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="pos-cell-action">
                  <div className="pos-cat-actions">
                    <button
                      type="button"
                      className="pos-btn primary"
                      onClick={() => setEditingId(c.id)}
                    >
                      Edit
                    </button>
                    <button type="button" className="pos-btn ghost" onClick={() => toggleActive(c)}>
                      {c.active ? 'Deactivate' : 'Activate'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <CategoryModal
          category={editing}
          categories={categories}
          products={products}
          onClose={() => setEditingId(null)}
          onChanged={load}
          onToast={setToast}
        />
      )}
      <Toast toast={toast} onDone={clearToast} />
    </div>
  );
}

function CategoryModal({ category, categories, products, onClose, onChanged, onToast }) {
  const [form, setForm] = useState({
    name: category.name,
    kind: category.kind || 'food',
    sort_order: String(category.sort_order ?? ''),
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [picking, setPicking] = useState(false);
  const [chosen, setChosen] = useState([]);
  const [search, setSearch] = useState('');

  const byName = (a, b) => a.name.localeCompare(b.name);
  const items = products.filter((p) => p.category_id === category.id).sort(byName);
  const others = products.filter((p) => p.category_id !== category.id).sort(byName);
  const q = search.trim().toLowerCase();
  const candidates = q ? others.filter((p) => p.name.toLowerCase().includes(q)) : others;
  const catName = (id) => categories.find((c) => c.id === id)?.name || 'No category';

  async function addChosen() {
    const count = chosen.length;
    const ok = await run(
      () => Promise.all(chosen.map((id) => api.posUpdateProduct(id, { category_id: category.id }))),
      `${count} item(s) added to ${category.name}`
    );
    if (ok) {
      setChosen([]);
      setSearch('');
      setPicking(false);
    }
  }

  async function run(action, text) {
    setBusy(true);
    setError('');
    try {
      await action();
      await onChanged();
      if (text) onToast({ tone: 'ok', text });
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function saveDetails(e) {
    e.preventDefault();
    const ok = await run(
      () =>
        api.posUpdateCategory(category.id, {
          name: form.name.trim(),
          kind: form.kind,
          sort_order: Number(form.sort_order) || 0,
        }),
      `${form.name.trim()} saved`
    );
    if (ok) onClose();
  }

  function takeOut(p) {
    if (!window.confirm(`Remove ${p.name} from ${category.name}? The item stays in Products with no category.`)) return;
    run(() => api.posUpdateProduct(p.id, { category_id: null }), `${p.name} removed from ${category.name}`);
  }

  return (
    <div className="pos-modal-backdrop" onClick={busy ? undefined : onClose}>
      <div className="pos-modal wide" onClick={(e) => e.stopPropagation()}>
        <h2>Edit category</h2>
        {error && <div className="pos-alert error">{error}</div>}

        <form id="category-form" className="pos-cat-form" onSubmit={saveDetails}>
          <label className="pos-field">
            <span className="pos-cart-label">Name</span>
            <input
              className="pos-input"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>
          <label className="pos-field">
            <span className="pos-cart-label">Type</span>
            <select
              className="pos-select"
              value={form.kind}
              onChange={(e) => setForm({ ...form, kind: e.target.value })}
            >
              <option value="drink">Drink</option>
              <option value="food">Food</option>
            </select>
          </label>
          <label className="pos-field">
            <span className="pos-cart-label">Order on menu</span>
            <input
              className="pos-input"
              type="number"
              min="0"
              value={form.sort_order}
              onChange={(e) => setForm({ ...form, sort_order: e.target.value })}
            />
          </label>
        </form>

        <h3 className="pos-cat-subtitle">
          Items in {category.name} <small>· {items.length}</small>
        </h3>
        <ul className="pos-list pos-cat-items">
          {items.length === 0 && (
            <li>
              <span className="pos-product-meta">No food or drinks in this category yet.</span>
            </li>
          )}
          {items.map((p) => (
            <li key={p.id}>
              <span>
                {p.name}
                {!p.active && <small className="pos-product-meta"> · inactive</small>}
              </span>
              <button
                type="button"
                className="pos-btn ghost"
                disabled={busy}
                onClick={() => takeOut(p)}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
        {!picking ? (
          <button
            type="button"
            className="pos-btn block pos-cat-add-btn"
            disabled={busy}
            onClick={() => setPicking(true)}
          >
            + Add food or drinks
          </button>
        ) : (
          <div className="pos-cat-picker">
            <div className="pos-cat-picker-head">
              <strong>Add to {category.name}</strong>
              <button
                type="button"
                className="pos-cart-clear"
                onClick={() => {
                  setPicking(false);
                  setChosen([]);
                  setSearch('');
                }}
              >
                Cancel
              </button>
            </div>
            <input
              className="pos-input"
              placeholder="Search products"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <ul className="pos-cat-pick-list">
              {candidates.length === 0 && (
                <li className="pos-product-meta">
                  {others.length ? 'No match.' : 'Every product is already in this category.'}
                </li>
              )}
              {candidates.map((p) => (
                <li key={p.id}>
                  <label>
                    <input
                      type="checkbox"
                      checked={chosen.includes(p.id)}
                      onChange={() =>
                        setChosen((c) =>
                          c.includes(p.id) ? c.filter((id) => id !== p.id) : [...c, p.id]
                        )
                      }
                    />
                    <span>{p.name}</span>
                    <small>{catName(p.category_id)}</small>
                  </label>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="pos-btn primary block"
              disabled={busy || chosen.length === 0}
              onClick={addChosen}
            >
              {chosen.length ? `Add ${chosen.length} item(s)` : 'Tick items to add'}
            </button>
            <p className="pos-product-meta" style={{ margin: 0 }}>
              New food or drink? Register it first in <Link to="/ordering/products">Products</Link>.
            </p>
          </div>
        )}

        <div className="pos-modal-actions">
          <button type="button" className="pos-btn ghost" disabled={busy} onClick={onClose}>
            Close
          </button>
          <button type="submit" form="category-form" className="pos-btn primary" disabled={busy}>
            Save category
          </button>
        </div>
      </div>
    </div>
  );
}
