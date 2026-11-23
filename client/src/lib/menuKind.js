const DRINK_WORDS = /(coffee|matcha|tea|drink|juice|smoothie|latte|beverage|soda)/i;

/** 'drink' | 'food', from the category type, falling back to the category name. */
export function kindOf(product) {
  const cat = product?.category;
  if (cat?.kind === 'drink' || cat?.kind === 'food') return cat.kind;
  return DRINK_WORDS.test(cat?.name || '') ? 'drink' : 'food';
}

/** Game / console rentals are sold by the hour (min 1). */
export function isHourlyProduct(product) {
  return String(product?.category?.name || '').trim().toLowerCase() === 'game';
}
