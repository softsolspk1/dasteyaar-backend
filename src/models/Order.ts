import mongoose, { Schema, Document } from "mongoose";

export interface IOrder extends Document {
  prescription_id?: mongoose.Types.ObjectId; // Optional for manual entry
  shopify_order_id?: string;
  shopify_order_number?: string;
  order_source: "shopify" | "manual";
  patient_info: {
    mrn?: string;
    name: string;
    phone: string;
    address?: string;
    location?: string; // High-level location if address is detailed
    city_id?: mongoose.Types.ObjectId;
    city_name?: string;
  };
  repeat_order: boolean;
  repeat_order_comments?: string;
  doctor_info: {
    doctor_id?: mongoose.Types.ObjectId;
    name: string;
    district_id: mongoose.Types.ObjectId;
  };
  items: Array<{
    name: string;
    quantity: number;
    price?: number;
    sku?: string;
  }>;
  order_status: "pending" | "processing" | "approved" | "fulfilled" | "cancelled";
  financial_status: "pending" | "paid" | "refunded";
  fulfillment_status: "unfulfilled" | "fulfilled" | "partial";
  tracking_number?: string;
  tracking_url?: string;
  total_amount: number;
  currency: string;
  kam_id?: mongoose.Types.ObjectId;
  distributor_info?: {
    distributor_id: mongoose.Types.ObjectId;
    name: string;
  };
  dates?: {
    prescription_date?: Date;
    order_placed_date?: Date;
    dispatch_date_time?: Date;
    expected_delivery_date?: Date;
  };
  shopify_created_at?: Date;
  shopify_updated_at?: Date;
  // --- Phase 2 additions ---
  discount?: {
    coupon_id?: mongoose.Types.ObjectId;
    coupon_code?: string;
    discount_type?: "flat" | "percentage";
    discount_value?: number;
    discount_amount?: number;
  };
  remarks: Array<{
    _id?: mongoose.Types.ObjectId;
    text: string;
    added_by_id?: mongoose.Types.ObjectId;
    added_by_role: string;
    added_by_name: string;
    visibility: "public" | "internal";
    createdAt: Date;
  }>;
  prescription_attachments: Array<{
    _id?: mongoose.Types.ObjectId;
    url: string;
    file_type?: string;
    uploaded_by_id?: mongoose.Types.ObjectId;
    uploaded_by_role: string;
    uploaded_by_name?: string;
    uploaded_at: Date;
  }>;
  prescription_required: boolean;
  prescription_status: "not_required" | "pending" | "attached";
  delivery?: {
    scheduled_date?: Date;
    scheduled_time_slot?: string;
    estimated_delivery_time?: Date;
    rider_id?: mongoose.Types.ObjectId;
    rider_name?: string;
    rider_contact?: string;
    rider_vehicle?: string;
    delivery_status: "not_scheduled" | "scheduled" | "out_for_delivery" | "delivered" | "failed" | "rescheduled";
    actual_delivery_time?: Date;
    assignment_type?: "manual" | "auto";
  };
  outlet_performance?: {
    before_message_status: "not_sent" | "sent" | "failed";
    after_message_status: "not_sent" | "sent" | "failed";
    rating_value?: number;
    rating_comments?: string;
    rating_criteria?: {
      timeliness?: number;
      product_condition?: number;
      rider_behavior?: number;
    };
    rating_date?: Date;
  };
  inventory_adjustment?: {
    deducted: boolean;
    restored: boolean;
  };
  createdAt: Date;
  updatedAt: Date;
}

const OrderSchema: Schema = new Schema(
  {
    prescription_id: {
      type: Schema.Types.ObjectId,
      ref: "Prescription",
      required: false,
    },
    shopify_order_id: {
      type: String,
    },
    shopify_order_number: {
      type: String,
      unique: true,
      sparse: true,
    },
    order_source: {
      type: String,
      enum: ["shopify", "manual"],
      default: "shopify",
      required: true,
    },
    patient_info: {
      mrn: {
        type: String,
        required: false,
      },
      name: {
        type: String,
        required: true,
      },
      phone: {
        type: String,
        required: true,
      },
      address: {
        type: String,
      },
      location: {
        type: String,
      },
      city_id: {
        type: Schema.Types.ObjectId,
        ref: "City",
      },
      city_name: {
        type: String,
      },
    },
    repeat_order: {
      type: Boolean,
      default: false,
    },
    repeat_order_comments: {
      type: String,
      required: false,
    },
    doctor_info: {
      doctor_id: {
        type: Schema.Types.ObjectId,
        ref: "Doctor",
        required: false,
      },
      name: {
        type: String,
        required: true,
      },
      district_id: {
        type: Schema.Types.ObjectId,
        ref: "District",
        required: true,
      },
    },
    items: [
      {
        name: { type: String, required: true },
        quantity: { type: Number, required: true },
        price: { type: Number },
        sku: { type: String },
      },
    ],
    order_status: {
      type: String,
      enum: ["pending", "processing", "approved", "fulfilled", "cancelled"],
      default: "pending",
    },
    financial_status: {
      type: String,
      enum: ["pending", "paid", "refunded"],
      default: "pending",
    },
    fulfillment_status: {
      type: String,
      enum: ["unfulfilled", "fulfilled", "partial"],
      default: "unfulfilled",
    },
    tracking_number: {
      type: String,
    },
    tracking_url: {
      type: String,
    },
    total_amount: {
      type: Number,
      required: true,
    },
    currency: {
      type: String,
      default: "PKR",
    },
    kam_id: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    distributor_info: {
      distributor_id: {
        type: Schema.Types.ObjectId,
        ref: "Distributor",
      },
      name: {
        type: String,
      },
    },
    dates: {
      prescription_date: { type: Date },
      order_placed_date: { type: Date },
      dispatch_date_time: { type: Date },
      expected_delivery_date: { type: Date },
    },
    shopify_created_at: {
      type: Date,
    },
    shopify_updated_at: {
      type: Date,
    },
    // --- Phase 2 additions ---
    discount: {
      coupon_id: { type: Schema.Types.ObjectId, ref: "Coupon" },
      coupon_code: { type: String },
      discount_type: { type: String, enum: ["flat", "percentage"] },
      discount_value: { type: Number },
      discount_amount: { type: Number },
    },
    remarks: [
      {
        text: { type: String, required: true },
        added_by_id: { type: Schema.Types.ObjectId },
        added_by_role: { type: String, required: true },
        added_by_name: { type: String, required: true },
        visibility: {
          type: String,
          enum: ["public", "internal"],
          default: "public",
        },
        createdAt: { type: Date, default: Date.now },
      },
    ],
    prescription_attachments: [
      {
        url: { type: String, required: true },
        file_type: { type: String },
        uploaded_by_id: { type: Schema.Types.ObjectId },
        uploaded_by_role: { type: String, required: true },
        uploaded_by_name: { type: String },
        uploaded_at: { type: Date, default: Date.now },
      },
    ],
    prescription_required: {
      type: Boolean,
      default: false,
    },
    prescription_status: {
      type: String,
      enum: ["not_required", "pending", "attached"],
      default: "not_required",
    },
    delivery: {
      scheduled_date: { type: Date },
      scheduled_time_slot: { type: String },
      estimated_delivery_time: { type: Date },
      rider_id: { type: Schema.Types.ObjectId, ref: "Rider" },
      rider_name: { type: String },
      rider_contact: { type: String },
      rider_vehicle: { type: String },
      delivery_status: {
        type: String,
        enum: ["not_scheduled", "scheduled", "out_for_delivery", "delivered", "failed", "rescheduled"],
        default: "not_scheduled",
      },
      actual_delivery_time: { type: Date },
      assignment_type: { type: String, enum: ["manual", "auto"] },
    },
    outlet_performance: {
      before_message_status: {
        type: String,
        enum: ["not_sent", "sent", "failed"],
        default: "not_sent",
      },
      after_message_status: {
        type: String,
        enum: ["not_sent", "sent", "failed"],
        default: "not_sent",
      },
      rating_value: { type: Number, min: 1, max: 5 },
      rating_comments: { type: String },
      rating_criteria: {
        timeliness: { type: Number, min: 1, max: 5 },
        product_condition: { type: Number, min: 1, max: 5 },
        rider_behavior: { type: Number, min: 1, max: 5 },
      },
      rating_date: { type: Date },
    },
    inventory_adjustment: {
      deducted: { type: Boolean, default: false },
      restored: { type: Boolean, default: false },
    },
  },
  {
    timestamps: true,
  },
);

// Indexes
OrderSchema.index({ prescription_id: 1 }, { sparse: true });
OrderSchema.index({ shopify_order_id: 1 }, { sparse: true });
OrderSchema.index({ shopify_order_number: 1 }, { unique: true, sparse: true });
OrderSchema.index({ order_source: 1 });
OrderSchema.index({ "doctor_info.district_id": 1 });
OrderSchema.index({ "doctor_info.doctor_id": 1, createdAt: -1 });
OrderSchema.index({ "patient_info.city_id": 1 });
OrderSchema.index({ "patient_info.mrn": 1 });
OrderSchema.index({ order_status: 1 });
OrderSchema.index({ kam_id: 1 }, { sparse: true });
OrderSchema.index({ createdAt: -1 });
OrderSchema.index({ "delivery.delivery_status": 1 });
OrderSchema.index({ "delivery.scheduled_date": 1 });
OrderSchema.index({ "discount.coupon_id": 1 }, { sparse: true });
OrderSchema.index({ "distributor_info.distributor_id": 1 }, { sparse: true });

export default mongoose.model<IOrder>("Order", OrderSchema);
