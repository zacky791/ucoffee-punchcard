import { formatUnitCost } from '../pages/ordering/InventoryPage';

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

export default function IngredientRows({ rows, onChange, inventory, byId, currency }) {
  function update(index, patch) {
    onChange(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

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
                onChange={(e) => update(index, { inventory_item_id: e.target.value })}
              >
                <option value="">Select ingredient</option>
                {inventory.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
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
                aria-label="Remove ingredient"
                onClick={() => onChange(rows.filter((_, i) => i !== index))}
              >
                ✕
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
