import { createContext, useContext, useMemo, useReducer } from 'react';

const CartContext = createContext(null);

function money(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

function lineUnitPrice(base, modifiers = []) {
  const delta = modifiers.reduce((s, m) => s + Number(m.price_delta || 0), 0);
  return money(Number(base || 0) + delta);
}

function reducer(state, action) {
  switch (action.type) {
    case 'set_order_type':
      return { ...state, orderType: action.orderType };
    case 'set_table':
      return { ...state, tableLabel: action.tableLabel };
    case 'set_notes':
      return { ...state, notes: action.notes };
    case 'set_discount':
      return { ...state, discount: money(action.discount) };
    case 'add_item': {
      const item = action.item;
      const key = [
        item.product_id,
        JSON.stringify(item.modifiers || []),
        item.notes || '',
      ].join('|');
      const existing = state.items.find((i) => i.key === key);
      if (existing) {
        return {
          ...state,
          items: state.items.map((i) =>
            i.key === key
              ? {
                  ...i,
                  quantity: i.quantity + (item.quantity || 1),
                  line_total: money(
                    lineUnitPrice(i.base_price, i.modifiers) *
                      (i.quantity + (item.quantity || 1))
                  ),
                }
              : i
          ),
        };
      }
      const quantity = item.quantity || 1;
      const unit = lineUnitPrice(item.base_price, item.modifiers);
      return {
        ...state,
        items: [
          ...state.items,
          {
            key,
            product_id: item.product_id,
            product_name: item.product_name,
            sku: item.sku,
            base_price: money(item.base_price),
            modifiers: item.modifiers || [],
            notes: item.notes || '',
            quantity,
            unit_price: unit,
            line_total: money(unit * quantity),
          },
        ],
      };
    }
    case 'set_qty': {
      const qty = Math.max(0, Number(action.quantity) || 0);
      if (qty === 0) {
        return {
          ...state,
          items: state.items.filter((i) => i.key !== action.key),
        };
      }
      return {
        ...state,
        items: state.items.map((i) =>
          i.key === action.key
            ? {
                ...i,
                quantity: qty,
                unit_price: lineUnitPrice(i.base_price, i.modifiers),
                line_total: money(lineUnitPrice(i.base_price, i.modifiers) * qty),
              }
            : i
        ),
      };
    }
    case 'remove_item':
      return {
        ...state,
        items: state.items.filter((i) => i.key !== action.key),
      };
    case 'clear':
      return {
        ...state,
        items: [],
        notes: '',
        discount: 0,
        tableLabel: '',
      };
    default:
      return state;
  }
}

const initial = {
  orderType: 'dine_in',
  tableLabel: '',
  notes: '',
  discount: 0,
  items: [],
};

export function CartProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initial);

  const totals = useMemo(() => {
    const subtotal = money(state.items.reduce((s, i) => s + i.line_total, 0));
    const discount = money(Math.min(state.discount, subtotal));
    return { subtotal, discount, taxable: money(subtotal - discount) };
  }, [state.items, state.discount]);

  const value = useMemo(
    () => ({
      ...state,
      totals,
      setOrderType: (orderType) => dispatch({ type: 'set_order_type', orderType }),
      setTable: (tableLabel) => dispatch({ type: 'set_table', tableLabel }),
      setNotes: (notes) => dispatch({ type: 'set_notes', notes }),
      setDiscount: (discount) => dispatch({ type: 'set_discount', discount }),
      addItem: (item) => dispatch({ type: 'add_item', item }),
      setQty: (key, quantity) => dispatch({ type: 'set_qty', key, quantity }),
      removeItem: (key) => dispatch({ type: 'remove_item', key }),
      clear: () => dispatch({ type: 'clear' }),
    }),
    [state, totals]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}

export function formatMoney(amount, currency = 'MYR') {
  return `${currency} ${Number(amount || 0).toFixed(2)}`;
}
