import { useEffect, useState } from 'react';
import { api } from '../../api';
import { formatMoney } from '../../context/CartContext';

const emptyForm = {
  name: '',
  sku: '',
  category_id: '',
  description: '',
  base_price: '',
  image_url: '',
  active: true,
};

export default function ProductsPage() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [settings, setSettings] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const [prods, cats, sett] = await Promise.all([
        api.posGetProducts(),
        api.posGetCategories(),
        api.posGetSettings(),
      ]);
      setProducts(prods || []);
      setCategories(cats || []);
      setSettings(sett);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const currency = settings?.currency || 'MYR';

  async function save(e) {
    e.preventDefault();
    setError('');
    try {
      const payload = {
        ...form,
        base_price: Number(form.base_price) || 0,
        category_id: form.category_id || null,
        image_url: form.image_url || null,
      };
      if (editingId) await api.posUpdateProduct(editingId, payload);
      else await api.posCreateProduct(payload);
      setForm(emptyForm);
      setEditingId(null);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  function startEdit(p) {
    setEditingId(p.id);
    setForm({
      name: p.name || '',
      sku: p.sku || '',
      category_id: p.category_id || '',
      description: p.description || '',
      base_price: String(p.base_price ?? ''),
      image_url: p.image_url || '',
      active: p.active !== false,
    });
  }

  return (
    <div>
      <div className="pos-page-head">
        <div>
          <h1>Products / Menu</h1>
          <p>Manage drinks, food, and add-ons</p>
        </div>
      </div>

      {error && <div className="pos-alert error">{error}</div>}

      <div className="pos-split">
        <div className="pos-card">
          <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>
            {editingId ? 'Edit product' : 'Add product'}
          </h2>
          <form className="pos-form-grid" onSubmit={save}>
            <label className="pos-field">
              <span>Name</span>
              <input
                className="pos-input"
                required
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
            <label className="pos-field" style={{ flexDirection: 'row', alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm({ ...form, active: e.target.checked })}
              />
              <span>Active</span>
            </label>
            <div className="pos-field" style={{ justifyContent: 'end', flexDirection: 'row', gap: 8 }}>
              {editingId && (
                <button
                  type="button"
                  className="pos-btn ghost"
                  onClick={() => {
                    setEditingId(null);
                    setForm(emptyForm);
                  }}
                >
                  Cancel
                </button>
              )}
              <button type="submit" className="pos-btn primary">
                {editingId ? 'Update' : 'Create'}
              </button>
            </div>
          </form>
        </div>

        <div className="pos-card" style={{ overflowX: 'auto' }}>
          {loading ? (
            <div>Loading…</div>
          ) : (
            <table className="pos-table">
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
                {products.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <strong>{p.name}</strong>
                      <div className="pos-product-meta">{p.sku}</div>
                    </td>
                    <td>{p.category?.name || '—'}</td>
                    <td>{formatMoney(p.base_price, currency)}</td>
                    <td>
                      <span className={`pos-badge ${p.active ? 'ok' : 'off'}`}>
                        {p.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="pos-btn ghost"
                        onClick={() => startEdit(p)}
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
