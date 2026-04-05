import React, { createContext, useContext, useReducer, useCallback } from 'react';

const CartContext = createContext(null);

const initialState = {
  items: [],
  customer: null,
  promoCode: null,
  promotionsApplied: [],
  totalDiscount: 0,
  isTraining: false,
};

function cartReducer(state, action) {
  switch (action.type) {
    case 'ADD_ITEM': {
      const existing = state.items.find((i) => i.barcode === action.item.barcode && !i.discount);
      if (existing) {
        return {
          ...state,
          items: state.items.map((i) =>
            i === existing
              ? { ...i, quantity: i.quantity + (action.item.quantity || 1), lineTotal: (i.quantity + (action.item.quantity || 1)) * i.unitPrice }
              : i
          ),
        };
      }
      const qty = action.item.quantity || 1;
      return {
        ...state,
        items: [...state.items, { ...action.item, quantity: qty, lineTotal: qty * action.item.unitPrice, scanTime: new Date() }],
      };
    }
    case 'UPDATE_QUANTITY': {
      const newQty = action.quantity;
      if (newQty <= 0) {
        return { ...state, items: state.items.filter((_, idx) => idx !== action.index) };
      }
      return {
        ...state,
        items: state.items.map((item, idx) =>
          idx === action.index ? { ...item, quantity: newQty, lineTotal: newQty * item.unitPrice } : item
        ),
      };
    }
    case 'REMOVE_ITEM':
      return { ...state, items: state.items.filter((_, idx) => idx !== action.index) };
    case 'APPLY_DISCOUNT':
      return {
        ...state,
        items: state.items.map((item, idx) => {
          if (idx !== action.index) return item;
          const discountAmount = action.discount.type === 'percent'
            ? item.unitPrice * item.quantity * (action.discount.amount / 100)
            : action.discount.amount;
          const lineTotal = Math.max(0, item.unitPrice * item.quantity - discountAmount);
          return { ...item, discount: action.discount, lineTotal };
        }),
      };
    case 'SET_CUSTOMER':
      return { ...state, customer: action.customer };
    case 'SET_PROMOTIONS':
      return { ...state, promotionsApplied: action.promotions, totalDiscount: action.totalDiscount };
    case 'CLEAR':
      return { ...initialState };
    case 'RESTORE': // for parked transactions
      return { ...initialState, items: action.items, customer: action.customer };
    case 'SET_TRAINING':
      return { ...state, isTraining: action.value };
    default:
      return state;
  }
}

export function CartProvider({ children }) {
  const [state, dispatch] = useReducer(cartReducer, initialState);

  const subtotal = state.items.reduce((s, i) => s + i.lineTotal, 0);
  const promoDiscount = state.totalDiscount || 0;
  const total = Math.max(0, subtotal - promoDiscount);
  const itemCount = state.items.reduce((s, i) => s + i.quantity, 0);

  const addItem = useCallback((item) => dispatch({ type: 'ADD_ITEM', item }), []);
  const updateQuantity = useCallback((index, quantity) => dispatch({ type: 'UPDATE_QUANTITY', index, quantity }), []);
  const removeItem = useCallback((index) => dispatch({ type: 'REMOVE_ITEM', index }), []);
  const applyDiscount = useCallback((index, discount) => dispatch({ type: 'APPLY_DISCOUNT', index, discount }), []);
  const setCustomer = useCallback((customer) => dispatch({ type: 'SET_CUSTOMER', customer }), []);
  const setPromotions = useCallback((promotions, totalDiscount) => dispatch({ type: 'SET_PROMOTIONS', promotions, totalDiscount }), []);
  const clearCart = useCallback(() => dispatch({ type: 'CLEAR' }), []);
  const restoreCart = useCallback((items, customer) => dispatch({ type: 'RESTORE', items, customer }), []);
  const setTraining = useCallback((value) => dispatch({ type: 'SET_TRAINING', value }), []);

  return (
    <CartContext.Provider value={{
      ...state,
      subtotal,
      promoDiscount,
      total,
      itemCount,
      addItem,
      updateQuantity,
      removeItem,
      applyDiscount,
      setCustomer,
      setPromotions,
      clearCart,
      restoreCart,
      setTraining,
    }}>
      {children}
    </CartContext.Provider>
  );
}

export const useCart = () => {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
};
