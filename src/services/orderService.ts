import shopify from "../config/shopify";
import Order from "../models/Order";
import Patient from "../models/Patient";
import Doctor from "../models/Doctor";
import District from "../models/District";
import Counter from "../models/Counter";
import greenApiService from "./greenApiService";
import logger from "../config/logger";
import { deductStockForOrder, checkStockAvailability, notifyOutletNewOrder, StockAvailabilityItem } from "./inventoryService";
import { validateCouponForOrder, computeDiscountAmount, applyCouponUsage } from "./couponService";
import { getProductConfig } from "../config/productMessages";

/**
 * Picks the item to feature in the patient WhatsApp message. Prefers a line item that
 * has a known product config (e.g. CINNOPAR/CINNORA) so its video link is always attached,
 * regardless of where it falls in the order's item list, instead of only ever looking at
 * items[0].
 */
function pickFeaturedItemName(items: any[]): string {
  const featured = items.find((item: any) => getProductConfig(item.name));
  const base = (featured || items[0]).name;
  const extraCount = items.length - 1;
  return base + (extraCount > 0 ? ` (+${extraCount} more)` : "");
}

interface CreateOrderParams {
  prescription: any;
  patient: any;
  doctor: any;
  city?: any;
  couponCode?: string;
}

interface ResolvedDiscount {
  coupon_id: any;
  coupon_code: string;
  discount_type: "flat" | "percentage";
  discount_value: number;
  discount_amount: number;
}

/**
 * CPN-08/10: Resolve + validate a coupon code against the ordering doctor.
 * Throws if the code is present but invalid, so the caller can decide whether
 * to hard-fail the order or proceed without the discount.
 */
async function resolveCouponDiscount(
  couponCode: string | undefined,
  doctorId: string,
  orderTotal: number,
  items?: { name?: string; sku?: string; quantity: number; price?: number }[],
  doctorName?: string,
  isRepeatOrder?: boolean
): Promise<{ discount?: ResolvedDiscount; couponDoc?: any }> {
  if (!couponCode) return {};

  const result = await validateCouponForOrder(couponCode, doctorId, doctorName, isRepeatOrder);
  if (!result.valid) {
    throw Object.assign(new Error(result.reason || "Invalid coupon"), { code: "COUPON_INVALID" });
  }

  const coupon = result.coupon!;
  const discountAmount = computeDiscountAmount(coupon, orderTotal, items);

  return {
    couponDoc: coupon,
    discount: {
      coupon_id: coupon._id,
      coupon_code: coupon.coupon_code,
      discount_type: coupon.discount_type,
      discount_value: coupon.discount_value,
      discount_amount: discountAmount,
    },
  };
}

export async function createOrderFromPrescription(params: CreateOrderParams) {
  const { prescription, patient, doctor, city, couponCode } = params;

  try {
    // INV-06: block order confirmation if any line item's stock is fully unavailable
    const stockCheck = await checkStockAvailability(prescription.items, city);
    if (stockCheck.blocked) {
      throw Object.assign(
        new Error(
          `Order cannot be confirmed: out of stock for SKU(s) ${stockCheck.blockedItems.map((i) => i.sku).join(", ")}`
        ),
        { code: "STOCK_UNAVAILABLE", blockedItems: stockCheck.blockedItems }
      );
    }

    // Create Shopify session
    const session = shopify.session.customAppSession(
      process.env.SHOPIFY_STORE_URL!,
    );
    session.accessToken = process.env.SHOPIFY_ACCESS_TOKEN!;

    const client = new shopify.clients.Rest({ session });

    // Fetch District Name
    const districtDoc = await District.findById(doctor.district_id);
    const districtName = districtDoc ? districtDoc.name : "Unknown District";
    const districtId = doctor.district_id.toString();

    // Create draft order in Shopify
    const nameParts = patient.name.trim().split(/\s+/);
    const firstName = nameParts[0];
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : "";

    const lineItems = prescription.items.map((item: any) => ({
      title: item.name,
      price: item.price.toString(),
      quantity: item.quantity,
      sku: item.sku,
    }));

    const draftOrderData = {
      draft_order: {
        line_items: lineItems,
        customer: {
          first_name: firstName,
          last_name: lastName,
          phone: patient.phone,
          ...(patient.email && { email: patient.email }),
          note: `MRN: ${patient.mrn}`,
          tags: "prescription",
          accepts_marketing: false,
          tax_exempt: false,
        },
        note_attributes: [
          { name: "Patient MRN", value: patient.mrn },
          { name: "Patient Name", value: patient.name },
          { name: "Doctor ID", value: doctor._id.toString() },
          { name: "Doctor Name", value: doctor.name },
          { name: "City Name", value: city?.name || "N/A" },
          { name: "District Name", value: districtName },
        ],
        tags: `prescription, doctor-${doctor._id}, district-${districtId}`,
      },
    };

    const draftOrderResponse = await client.post({
      path: "draft_orders",
      data: draftOrderData,
    });

    const draftOrder = draftOrderResponse.body.draft_order;

    // Complete the draft order to convert it to a real order
    const completeResponse = await client.put({
      path: `draft_orders/${draftOrder.id}/complete`,
      data: {
        payment_pending: true,
      },
    });

    const completedDraft = completeResponse.body.draft_order;

    // Fetch the actual order to get the correct order number
    const orderResponse = await client.get({
      path: `orders/${completedDraft.order_id}`,
    });

    const shopifyOrder = orderResponse.body.order;
    const shopifyTotal = parseFloat(shopifyOrder.total_price || "0");

    // CPN-08/10/11: Resolve + apply an optional coupon to the stored order total
    let discount: ResolvedDiscount | undefined;
    let couponDoc: any;
    let couponWarning: string | undefined;
    try {
      const resolved = await resolveCouponDiscount(
        couponCode,
        String(doctor._id),
        shopifyTotal,
        prescription.items,
        doctor.name,
        Boolean(prescription.repeat_order)
      );
      discount = resolved.discount;
      couponDoc = resolved.couponDoc;
    } catch (couponError: any) {
      couponWarning = couponError.message || "Invalid coupon";
      logger.warn("Coupon validation failed during order creation, proceeding without discount", {
        couponCode,
        error: couponError.message,
      });
    }

    // Create order record in our database
    const order = await Order.create({
      prescription_id: prescription._id,
      shopify_order_id: shopifyOrder.id.toString(),
      shopify_order_number: shopifyOrder.name || `#${shopifyOrder.id}`,
      patient_info: {
        mrn: patient.mrn,
        name: patient.name,
        phone: patient.phone,
        city_id: city?._id,
        city_name: city?.name,
      },
      doctor_info: {
        doctor_id: doctor._id,
        name: doctor.name,
        district_id: doctor.district_id,
      },
      items: prescription.items.map((item: any) => ({
        name: item.name,
        quantity: item.quantity,
        price: item.price,
        sku: item.sku,
      })),
      order_status: "pending",
      financial_status: "pending",
      fulfillment_status: "unfulfilled",
      total_amount: discount ? Math.max(0, shopifyTotal - discount.discount_amount) : shopifyTotal,
      currency: shopifyOrder.currency || "PKR",
      shopify_created_at: new Date(shopifyOrder.created_at),
      shopify_updated_at: new Date(shopifyOrder.updated_at),
      discount,
    });

    if (couponDoc) {
      applyCouponUsage(couponDoc, order._id).catch((err) => {
        logger.error("Failed to record coupon usage (non-blocking)", { error: err.message });
      });
    }

    // Update prescription with Shopify order details
    await prescription.updateOne({
      shopify_order_id: shopifyOrder.id.toString(),
      shopify_order_number: shopifyOrder.name,
    });

    // Deduct inventory stock (non-blocking - don't fail order creation on inventory errors)
    deductStockForOrder(order).catch((err) => {
      logger.error("Failed to deduct inventory stock (non-blocking)", {
        orderId: order._id,
        error: err instanceof Error ? err.message : String(err),
      });
    });

    // Alert the outlet/distributor with the patient's order details (non-blocking)
    notifyOutletNewOrder(order).catch(() => {});

    // Send WhatsApp message to patient asynchronously
    try {
      greenApiService
        .sendPrescriptionMessage({
          patientName: patient.name,
          patientPhone: patient.phone,
          mrn: patient.mrn,
          doctorName: doctor.name,
          productName: pickFeaturedItemName(prescription.items),
        })
        .catch((err) => {
          logger.error("Failed to send WhatsApp message (non-blocking)", {
            patientPhone: patient.phone,
            mrn: patient.mrn,
            error: err instanceof Error ? err.message : String(err),
          });
        });
    } catch (error) {
      logger.warn("WhatsApp message sending skipped", {
        patientPhone: patient.phone,
        mrn: patient.mrn,
      });
    }

    return { order, couponWarning, stockWarnings: stockCheck.warnings };
  } catch (error) {
    throw error;
  }
}

export async function createOrderWithoutShopify(params: CreateOrderParams) {
  const { prescription, patient, doctor, city, couponCode } = params;

  try {
    // INV-06: block order confirmation if any line item's stock is fully unavailable
    const stockCheck = await checkStockAvailability(prescription.items, city);
    if (stockCheck.blocked) {
      throw Object.assign(
        new Error(
          `Order cannot be confirmed: out of stock for SKU(s) ${stockCheck.blockedItems.map((i) => i.sku).join(", ")}`
        ),
        { code: "STOCK_UNAVAILABLE", blockedItems: stockCheck.blockedItems }
      );
    }

    // Generate a unique order number for non-Shopify orders with "0" prefix
    const counter = await Counter.findOneAndUpdate(
      { _id: "manual_order_number" },
      { $inc: { seq: 1 } },
      { upsert: true, new: true }
    );

    const paddedNumber = String(counter.seq).padStart(5, "0");
    const orderNumber = `#0${paddedNumber}`;
    const uniqueId = `LOCAL-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    // Calculate total amount
    const totalAmount = prescription.items.reduce(
      (sum: number, item: any) => sum + item.price * item.quantity,
      0,
    );

    // CPN-08/10/11: Resolve + apply an optional coupon to the stored order total
    let discount: ResolvedDiscount | undefined;
    let couponDoc: any;
    let couponWarning: string | undefined;
    try {
      const resolved = await resolveCouponDiscount(
        couponCode,
        String(doctor._id),
        totalAmount,
        prescription.items,
        doctor.name,
        Boolean(prescription.repeat_order)
      );
      discount = resolved.discount;
      couponDoc = resolved.couponDoc;
    } catch (couponError: any) {
      couponWarning = couponError.message || "Invalid coupon";
      logger.warn("Coupon validation failed during order creation, proceeding without discount", {
        couponCode,
        error: couponError.message,
      });
    }

    // Create order record in our database (without Shopify)
    const order = await Order.create({
      prescription_id: prescription._id,
      shopify_order_id: uniqueId,
      shopify_order_number: orderNumber,
      order_source: "manual",
      patient_info: {
        mrn: patient.mrn,
        name: patient.name,
        phone: patient.phone,
        city_id: city?._id,
        city_name: city?.name,
      },
      doctor_info: {
        doctor_id: doctor._id,
        name: doctor.name,
        district_id: doctor.district_id,
      },
      items: prescription.items.map((item: any) => ({
        name: item.name,
        quantity: item.quantity,
        price: item.price,
        sku: item.sku,
      })),
      order_status: "pending",
      financial_status: "pending",
      fulfillment_status: "unfulfilled",
      total_amount: discount ? Math.max(0, totalAmount - discount.discount_amount) : totalAmount,
      currency: "PKR",
      discount,
    });

    if (couponDoc) {
      applyCouponUsage(couponDoc, order._id).catch((err) => {
        logger.error("Failed to record coupon usage (non-blocking)", { error: err.message });
      });
    }

    // Update prescription with the local order details
    await prescription.updateOne({
      shopify_order_id: uniqueId,
      shopify_order_number: orderNumber,
    });

    // Deduct inventory stock (non-blocking - don't fail order creation on inventory errors)
    deductStockForOrder(order).catch((err) => {
      logger.error("Failed to deduct inventory stock (non-blocking)", {
        orderId: order._id,
        error: err instanceof Error ? err.message : String(err),
      });
    });

    // Alert the outlet/distributor with the patient's order details (non-blocking)
    notifyOutletNewOrder(order).catch(() => {});

    // Send WhatsApp message to patient asynchronously
    try {
      greenApiService
        .sendPrescriptionMessage({
          patientName: patient.name,
          patientPhone: patient.phone,
          mrn: patient.mrn,
          doctorName: doctor.name,
          productName: pickFeaturedItemName(prescription.items),
        })
        .catch((err) => {
          logger.error("Failed to send WhatsApp message (non-blocking)", {
            patientPhone: patient.phone,
            mrn: patient.mrn,
            error: err instanceof Error ? err.message : String(err),
          });
        });
    } catch (error) {
      logger.warn("WhatsApp message sending skipped", {
        patientPhone: patient.phone,
        mrn: patient.mrn,
      });
    }

    return { order, couponWarning, stockWarnings: stockCheck.warnings };
  } catch (error) {
    throw error;
  }
}
