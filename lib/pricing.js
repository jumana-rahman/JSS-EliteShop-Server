export const SHIPPING_FEE = 9.99;
export const FREE_SHIPPING_THRESHOLD = 50;

export function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

export function computeShipping(subtotal) {
  return Number(subtotal) >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_FEE;
}

export function computeDiscount(coupon, subtotal) {
  if (!coupon) return 0;

  const base = Math.max(0, Number(subtotal) || 0);
  const value = Math.max(0, Number(coupon.discount_value ?? coupon.discountValue) || 0);
  const type = coupon.discount_type ?? coupon.discountType;

  const raw = type === "percentage" ? (base * value) / 100 : value;

  return roundMoney(Math.min(base, raw));
}

export function computePricing(subtotal, coupon = null) {
  const safeSubtotal = roundMoney(subtotal);
  const shipping = computeShipping(safeSubtotal);
  const discount = computeDiscount(coupon, safeSubtotal);
  const total = roundMoney(Math.max(0, safeSubtotal + shipping - discount));

  return { subtotal: safeSubtotal, shipping, discount, total };
}
