import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import Toast from '../../components/Toast';
import IngredientRows, {
  toIngredientPayload,
  toIngredientRows,
} from '../../components/IngredientRows';
import { kindOf } from '../../lib/menuKind';

function formatQty(n) {
  return Number(n || 0).toLocaleString('en-MY', { maximumFractionDigits: 3 });
}

function steps(notes) {
  return String(notes || '')
    .split('\n')
    .map((s) => s.replace(/^\s*\d+[.)]\s*/, '').trim())
    .filter(Boolean);
}

function RecipeModal({ product, inventory, currency, onClose, onSaved }) {
  const [rows, setRows] = useState(() => toIngredientRows(product.ingredients));
  const [notes, setNotes] = useState(product.recipe_notes || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const byId = useMemo(() => Object.fromEntries(inventory.map((i) => [i.id, i])), [inventory]);

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.posSaveCosting(product.id, {
        ingredients: toIngredientPayload(rows),
        recipe_notes: notes,
      });
      onSaved(`${product.name} recipe saved`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pos-modal-backdrop" onClick={busy ? undefined : onClose}>
      <form className="pos-modal wide" onClick={(e) => e.stopPropagation()} onSubmit={save}>
        <h2>{product.name}</h2>
        <p className="hint">
          Ingredients for 1 item. They are deducted from inventory on every sale.
        </p>
        {error && <div className="pos-alert error">{error}</div>}

        <h3 className="pos-costing-title">Ingredients</h3>
        {!inventory.length && (
          <div className="pos-alert warn">
            No inventory items yet. <Link to="/ordering/inventory">Add ingredients</Link> first.
          </div>
        )}
        <IngredientRows
          rows={rows}
          onChange={setRows}
          inventory={inventory}
          byId={byId}
          currency={currency}
        />

        <label className="pos-field" style={{ marginTop: '0.9rem' }}>
          <span>How to make (one step per line)</span>
          <textarea
            className="pos-textarea"
            rows={6}
            placeholder={'Pull a double shot\nSteam 200 ml milk\nPour over espresso'}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>

        <div className="pos-modal-actions">
          <button type="button" className="pos-btn ghost" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="pos-btn primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save recipe'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function RecipePage() {
  const [kind, setKind] = useState('drink');
  const [search, setSearch] = useState('');
  const [products, setProducts] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [currency, setCurrency] = useState('MYR');
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [toast, setToast] = useState(null);
  const [error, setError] = useState('');
  const clearToast = useCallback(() => setToast(null), []);

  const load = useCallback(async () => {
    try {
      const [costing, inv, settings] = await Promise.all([
        api.posGetCosting(),
        api.posGetInventory(),
        api.posGetSettings(),
      ]);
      setProducts((costing || []).filter((p) => p.active !== false));
      setInventory((inv || []).filter((i) => i.active !== false));
      setCurrency(settings?.currency || 'MYR');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const counts = useMemo(() => {
    const c = { drink: 0, food: 0 };
    for (const p of products) c[kindOf(p)] += 1;
    return c;
  }, [products]);

  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const map = new Map();
    for (const p of products) {
      if (kindOf(p) !== kind) continue;
      if (q && !p.name.toLowerCase().includes(q)) continue;
      const name = p.category?.name || 'Other';
      if (!map.has(name)) map.set(name, []);
      map.get(name).push(p);
    }
    return [...map.entries()];
  }, [products, kind, search]);

  return (
    <div>
      <div className="pos-page-head">
        <div>
          <h1>Recipe</h1>
          <p>How to make each item. Ingredients are deducted from inventory on every sale.</p>
        </div>
      </div>

      {error && <div className="pos-alert error">{error}</div>}

      <div className="pos-recipe-toolbar">
        <div className="pos-segment" role="tablist" aria-label="Recipe type">
          {[
            ['drink', 'Drinks'],
            ['food', 'Food'],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={kind === value}
              className={kind === value ? 'active' : ''}
              onClick={() => setKind(value)}
            >
              {label} <span>{counts[value]}</span>
            </button>
          ))}
        </div>
        <input
          className="pos-input"
          type="search"
          placeholder={`Search ${kind === 'drink' ? 'drinks' : 'food'}`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="pos-card">Loading…</div>
      ) : !groups.length ? (
        <div className="pos-card">No {kind === 'drink' ? 'drinks' : 'food'} found.</div>
      ) : (
        groups.map(([category, items]) => (
          <section key={category} className="pos-recipe-group">
            <h2>{category}</h2>
            <div className="pos-recipe-grid">
              {items.map((p) => {
                const list = steps(p.recipe_notes);
                return (
                  <article key={p.id} className="pos-card pos-recipe-card">
                    <header>
                      {p.image_url ? (
                        <img src={p.image_url} alt="" loading="lazy" />
                      ) : (
                        <span className="pos-recipe-noimg" aria-hidden="true" />
                      )}
                      <div>
                        <strong>{p.name}</strong>
                        <span className="pos-product-meta">
                          {p.ingredients.length} ingredient(s)
                        </span>
                      </div>
                      <button
                        type="button"
                        className="pos-btn ghost"
                        onClick={() => setEditing(p)}
                      >
                        Edit
                      </button>
                    </header>

                    {p.ingredients.length ? (
                      <ul className="pos-recipe-ingredients">
                        {p.ingredients.map((i) => (
                          <li key={i.inventory_item_id}>
                            <span>{i.name}</span>
                            <strong>
                              {formatQty(i.quantity_per_unit)} {i.unit}
                            </strong>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="pos-meta">No ingredients yet, so nothing is deducted on sale.</p>
                    )}

                    {list.length > 0 && (
                      <ol className="pos-recipe-steps">
                        {list.map((s, idx) => (
                          <li key={idx}>{s}</li>
                        ))}
                      </ol>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        ))
      )}

      {editing && (
        <RecipeModal
          product={editing}
          inventory={inventory}
          currency={currency}
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
