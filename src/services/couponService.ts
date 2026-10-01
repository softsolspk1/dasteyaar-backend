import Coupon, { ICoupon } from "../models/Coupon";

function getInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("")
    .slice(0, 4) || "DR";
}

/**
 * CPN-02: Auto-generate coupon code from doctor's initials + discount value,
 * appending a running number if the initials+value combination already exists.
 */
export async function generateCouponCode(
  doctorName: string,
  discountValue: number,
  discountType: "flat" | "percentage"
): Promise<string> {
  const initials = getInitials(doctorName);
  const valuePart = String(Math.round(discountValue)) + (discountType === "percentage" ? "P" : "");
  const baseCode = `${initials}${valuePart}`;

  const existing = await Coupon.find({
    coupon_code: { $regex: `^${baseCode}(-\\d+)?$` },
  })
    .select("coupon_code")
    .lean();

  if (existing.length === 0) return baseCode;
  if (!existing.some((c) => c.coupon_code === baseCode)) return baseCode;

  let suffix = 2;
  const existingCodes = new Set(existing.map((c) => c.coupon_code));
  while (existingCodes.has(`${baseCode}-${suffix}`)) {
    suffix += 1;
  }
  return `${baseCode}-${suffix}`;
}

export interface CouponValidationResult {
  valid: boolean;
  reason?: string;
  coupon?: ICoupon;
}

function cleanDocName(n: string): string {
  return (n || "")
    .replace(/^(dr[\.\s]+|doctor[\.\s]+)/i, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase();
}

function checkDoctorMatch(coupon: ICoupon, orderDoctorId?: string, orderDoctorName?: string): boolean {
  if (coupon.is_general) return true;
  const couponDocId = coupon.doctor_id ? String(coupon.doctor_id) : "";
  const incomingDocId = orderDoctorId ? String(orderDoctorId) : "";
  if (couponDocId && incomingDocId && couponDocId === incomingDocId) {
    return true;
  }

  const couponDocClean = cleanDocName(coupon.doctor_name || "");
  const orderDocClean = cleanDocName(orderDoctorName || incomingDocId);
  if (couponDocClean && orderDocClean) {
    if (
      couponDocClean === orderDocClean ||
      couponDocClean.includes(orderDocClean) ||
      orderDocClean.includes(couponDocClean)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * CPN-08/10: Validate that a coupon can be applied to an order for a given doctor.
 */
export async function validateCouponForOrder(
  couponCode: string,
  orderDoctorId?: string,
  orderDoctorName?: string,
  isRepeatOrder?: boolean
): Promise<CouponValidationResult> {
  const coupon = await Coupon.findOne({ coupon_code: couponCode.trim().toUpperCase() });

  if (!coupon) {
    return { valid: false, reason: "Coupon not found" };
  }

  const doctorMatches = checkDoctorMatch(coupon, orderDoctorId, orderDoctorName);

  if (coupon.status !== "active") {
    // If repeat order for the same doctor, allow reuse of the coupon
    if (isRepeatOrder && doctorMatches) {
      // Allowed for repeat order
    } else {
      return { valid: false, reason: `Coupon is not active (status: ${coupon.status})` };
    }
  }

  if (!coupon.is_general && !doctorMatches) {
    return { valid: false, reason: `This coupon is valid only for Dr. ${coupon.doctor_name || "the assigned doctor"}'s patients` };
  }

  const now = new Date();
  if (coupon.validity_from) {
    const validFrom = new Date(coupon.validity_from);
    const nowDay = now.toISOString().slice(0, 10);
    const fromDay = validFrom.toISOString().slice(0, 10);
    if (fromDay > nowDay && now < validFrom) {
      return { valid: false, reason: "Coupon is not yet valid" };
    }
  }
  if (coupon.validity_to) {
    const validTo = new Date(coupon.validity_to);
    validTo.setHours(23, 59, 59, 999);
    if (now > validTo && !(isRepeatOrder && doctorMatches)) {
      coupon.status = "expired";
      await coupon.save();
      return { valid: false, reason: "Coupon has expired" };
    }
  }

  if (
    coupon.usage_limit !== null &&
    coupon.usage_limit !== undefined &&
    coupon.usage_count >= coupon.usage_limit &&
    !(isRepeatOrder && doctorMatches)
  ) {
    coupon.status = "expired";
    await coupon.save();
    return { valid: false, reason: "Coupon usage limit reached" };
  }

  return { valid: true, coupon };
}

export interface DiscountableItem {
  name?: string;
  sku?: string;
  quantity: number;
  price?: number;
}

/**
 * CPN-13: When a coupon is scoped to specific products (applicable_products
 * non-empty), the discount only applies against those matching order line
 * items rather than the whole order total. Matching is by SKU first (unique),
 * falling back to a case-insensitive name match since order items don't
 * currently store a product_id.
 *
 * For flat discounts, the discount scales with quantity of prescribed items
 * (capped at order subtotal).
 */
export function computeDiscountAmount(coupon: ICoupon, orderTotal: number, items?: DiscountableItem[]): number {
  const scopedProducts = coupon.applicable_products || [];

  if (scopedProducts.length > 0 && items && items.length > 0) {
    const skus = new Set(scopedProducts.filter((p) => p.sku).map((p) => p.sku!.trim().toUpperCase()));
    const names = new Set(scopedProducts.map((p) => p.product_name?.trim().toLowerCase()).filter(Boolean));

    const matchingItems = items.filter((item) => {
      const itemSku = item.sku?.trim().toUpperCase();
      const itemName = item.name?.trim().toLowerCase();
      return (itemSku && skus.has(itemSku)) || (itemName && names.has(itemName));
    });

    const matchingSubtotal = matchingItems.reduce((sum, item) => sum + (item.price || 0) * (item.quantity || 1), 0);
    const matchingQuantity = matchingItems.reduce((sum, item) => sum + (item.quantity || 1), 0);

    if (coupon.discount_type === "percentage") {
      return Math.round(((matchingSubtotal * coupon.discount_value) / 100) * 100) / 100;
    }
    return Math.min(coupon.discount_value * Math.max(1, matchingQuantity), matchingSubtotal);
  }

  // Doctor-wide or general coupons: scale flat discount by item quantity
  const totalQuantity = items && items.length > 0
    ? items.reduce((sum, item) => sum + (Number(item.quantity) || 1), 0)
    : 1;

  if (coupon.discount_type === "percentage") {
    return Math.round((orderTotal * coupon.discount_value) / 100 * 100) / 100;
  }
  return Math.min(coupon.discount_value * Math.max(1, totalQuantity), orderTotal);
}

/**
 * CPN-11: Record coupon usage against an order (audit trail + usage count + auto-deactivate).
 */
export async function applyCouponUsage(coupon: ICoupon, orderId: any): Promise<void> {
  coupon.usage_count += 1;
  coupon.linked_order_ids.push(orderId);
  coupon.audit_log.push({
    action: "applied",
    at: new Date(),
    notes: `Applied to order ${orderId}`,
  } as any);

  if (coupon.usage_limit !== null && coupon.usage_limit !== undefined && coupon.usage_count >= coupon.usage_limit) {
    coupon.status = "expired";
  }

  await coupon.save();
}
