import { useEffect, useState } from 'react';
import { api } from '../../api';

export default function CategoriesPage() {
  const [categories, setCategories] = useState([]);
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  async function load() {
    try {
      setCategories(await api.posGetCategories());
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function create(e) {
    e.preventDefault();
    try {
      await api.posCreateCategory({ name, sort_order: categories.length + 1 });
      setName('');
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function toggle(cat) {
    try {
      await api.posUpdateCategory(cat.id, { active: !cat.active });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <div className="pos-page-head">
        <div>
          <h1>Categories</h1>
          <p>Coffee, tea, food, desserts, add-ons</p>
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
        <table className="pos-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Order</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {categories.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td>{c.sort_order}</td>
                <td>
                  <span className={`pos-badge ${c.active ? 'ok' : 'off'}`}>
                    {c.active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td>
                  <button type="button" className="pos-btn ghost" onClick={() => toggle(c)}>
                    {c.active ? 'Deactivate' : 'Activate'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
