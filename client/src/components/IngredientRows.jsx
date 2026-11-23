import { formatUnitCost } from '../pages/ordering/InventoryPage';
import { INV_STATIONS, groupByStation as groupInventoryByStation } from '../lib/stations';

export const emptyIngredient = () => ({ inventory_item_id: '', quantity_per_unit: '' });

export function toIngredientRows(ingredients = []) {
  return ingredients.length
    ? ingredients.map((i) => ({
        inventory_item_id: i.inventory_item_id,
        quantity_per_unit: String(i.quantity_per_unit),
      }))
    : [emptyIngredient()];
}

export function toIngredientPayload(rows) {
  return rows
    .filter((r) => r.inventory_item_id && Number(r.quantity_per_unit) > 0)
    .map((r) => ({
      inventory_item_id: r.inventory_item_id,
      quantity_per_unit: Number(r.quantity_per_unit),
    }));
}

export function ingredientCost(rows, byId) {
  return rows.reduce((sum, r) => {
    const inv = byId[r.inventory_item_id];
    return sum + (inv ? Number(r.quantity_per_unit || 0) * Number(inv.cost_per_unit) : 0);
  }, 0);
}

function groupByStation(inventory = []) {
  const groups = groupInventoryByStation(inventory);
  for (const key of Object.keys(groups)) {
    groups[key].sort((a, b) => a.name.localeCompare(b.name));
  }
  return groups;
}

export default function IngredientRows({ rows, onChange, inventory, byId, currency }) {
  function update(index, patch) {
    onChange(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  const groups = groupByStation(inventory);

  return (
    <>
      <div className="pos-recipe">
        {rows.map((r, index) => {
          const inv = byId[r.inventory_item_id];
          const lineCost = inv ? Number(r.quantity_per_unit || 0) * Number(inv.cost_per_unit) : 0;
          return (
            <div className="pos-recipe-row" key={index}>
              <select
                className="pos-select"
                aria-label="Ingredient"
                value={r.inventory_item_id}
                onChange={(e) => {
                  const id = e.target.value;
                  const selected = byId[id];
                  const per = Number(selected?.use_per_serving) || 0;
                  update(index, {
                    inventory_item_id: id,
                    ...(per > 0 ? { quantity_per_unit: String(per) } : {}),
                  });
                }}
              >
                <option value="">Select ingredient</option>
                {INV_STATIONS.map(({ id: key, label }) =>
                  groups[key].length ? (
                    <optgroup key={key} label={label}>
                      {groups[key].map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.name}
                          {i.unit ? ` (${i.unit})` : ''}
                        </option>
                      ))}
                    </optgroup>
                  ) : null
                )}
              </select>
              <div className="pos-recipe-qty">
                <input
                  className="pos-input"
                  type="number"
                  min="0"
                  step="0.001"
                  placeholder="Qty"
                  aria-label="Quantity per item"
                  value={r.quantity_per_unit}
                  onChange={(e) => update(index, { quantity_per_unit: e.target.value })}
                />
                <span>{inv?.unit || ''}</span>
              </div>
              <span className="pos-recipe-cost">{formatUnitCost(lineCost, currency)}</span>
              <button
                type="button"
                className="pos-btn ghost pos-recipe-remove"
                aria-label="Delete ingredient"
                title="Delete ingredient"
                onClick={() => {
                  const next = rows.filter((_, i) => i !== index);
                  onChange(next.length ? next : [emptyIngredient()]);
                }}
              >
                Delete
              </button>
            </div>
          );
        })}
      </div>
      <button
        type="button"
        className="pos-btn ghost"
        onClick={() => onChange([...rows, emptyIngredient()])}
      >
        + Add ingredient
      </button>
    </>
  );
}
