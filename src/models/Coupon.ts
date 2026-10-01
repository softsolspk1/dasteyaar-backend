import mongoose, { Schema, Document } from 'mongoose';

export interface ICouponProduct {
  product_id: mongoose.Types.ObjectId;
  product_name: string;
  sku?: string;
}

export interface ICoupon extends Document {
  coupon_code: string;
  doctor_id?: mongoose.Types.ObjectId;
  doctor_name?: string;
  is_general: boolean; // true = usable by any doctor's orders (no doctor lock)
  applicable_products: ICouponProduct[]; // empty = applies to whole order total; non-empty = product-wise flat/percentage discount
  discount_type: 'flat' | 'percentage';
  discount_value: number;
  requested_by?: mongoose.Types.ObjectId; // Doctor/Agent account that requested it
  requested_by_name?: string;
  request_date: Date;
  status: 'pending_approval' | 'active' | 'rejected' | 'expired';
  approved_by?: mongoose.Types.ObjectId; // Director/Admin User
  approved_by_name?: string;
  approval_date?: Date;
  rejection_reason?: string;
  original_discount_value?: number; // preserved if Director modifies the value
  validity_from?: Date;
  validity_to?: Date;
  usage_limit?: number; // undefined/null = unlimited
  usage_count: number;
  linked_order_ids: mongoose.Types.ObjectId[];
  audit_log: Array<{
    action: 'requested' | 'approved' | 'rejected' | 'modified' | 'applied' | 'expired';
    by_id?: mongoose.Types.ObjectId;
    by_name?: string;
    notes?: string;
    at: Date;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

const CouponSchema: Schema = new Schema(
  {
    coupon_code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    doctor_id: {
      type: Schema.Types.ObjectId,
      ref: 'Doctor',
    },
    doctor_name: {
      type: String,
    },
    is_general: {
      type: Boolean,
      default: false,
    },
    applicable_products: [
      {
        product_id: { type: Schema.Types.ObjectId, ref: 'Product' },
        product_name: { type: String },
        sku: { type: String },
      },
    ],
    discount_type: {
      type: String,
      enum: ['flat', 'percentage'],
      required: true,
      default: 'flat',
    },
    discount_value: {
      type: Number,
      required: true,
      min: 0,
    },
    requested_by: {
      type: Schema.Types.ObjectId,
      ref: 'Doctor',
    },
    requested_by_name: {
      type: String,
    },
    request_date: {
      type: Date,
      default: Date.now,
    },
    status: {
      type: String,
      enum: ['pending_approval', 'active', 'rejected', 'expired'],
      default: 'pending_approval',
    },
    approved_by: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    approved_by_name: {
      type: String,
    },
    approval_date: {
      type: Date,
    },
    rejection_reason: {
      type: String,
    },
    original_discount_value: {
      type: Number,
    },
    validity_from: {
      type: Date,
    },
    validity_to: {
      type: Date,
    },
    usage_limit: {
      type: Number,
      default: null,
    },
    usage_count: {
      type: Number,
      default: 0,
    },
    linked_order_ids: [
      {
        type: Schema.Types.ObjectId,
        ref: 'Order',
      },
    ],
    audit_log: [
      {
        action: {
          type: String,
          enum: ['requested', 'approved', 'rejected', 'modified', 'applied', 'expired'],
          required: true,
        },
        by_id: { type: Schema.Types.ObjectId },
        by_name: { type: String },
        notes: { type: String },
        at: { type: Date, default: Date.now },
      },
    ],
  },
  {
    timestamps: true,
  }
);

CouponSchema.index({ coupon_code: 1 }, { unique: true });
CouponSchema.index({ doctor_id: 1 });
CouponSchema.index({ requested_by: 1 });
CouponSchema.index({ status: 1 });

export default mongoose.model<ICoupon>('Coupon', CouponSchema);
