import { api } from '../api';

/** Total bought in the Expenses tab for business dates [fromKey, toKey]; 0 if that tab isn't set up yet. */
export async function loadPurchaseTotal(fromKey, toKey) {
  try {
    const list = await api.posGetPurchases({ from: fromKey, to: toKey });
    return Math.round((list || []).reduce((s, p) => s + Number(p.amount || 0), 0) * 100) / 100;
  } catch {
    return 0;
  }
}
