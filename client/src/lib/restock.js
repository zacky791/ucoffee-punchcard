/** Inventory items at or below their low-stock level, with how much to buy to reach 2× that level. */
export function restockList(inventory) {
  return (inventory || [])
    .filter((i) => Number(i.min_threshold) > 0 && Number(i.quantity) <= Number(i.min_threshold))
    .map((i) => {
      const quantity = Math.max(0, Number(i.quantity) || 0);
      const target = Number(i.min_threshold) * 2;
      const need = Math.max(0, target - quantity);
      const packSize = Number(i.pack_price) > 0 ? Number(i.pack_size) || 0 : 0;
      const packs = packSize > 0 ? Math.max(1, Math.ceil(need / packSize)) : 0;
      return {
        ...i,
        quantity,
        target,
        need,
        packs,
        pack_size: packSize,
        cost: packs ? packs * (Number(i.pack_price) || 0) : 0,
        out: quantity <= 0,
      };
    })
    .sort((a, b) => a.quantity / a.min_threshold - b.quantity / b.min_threshold);
}
