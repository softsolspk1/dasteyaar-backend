import mongoose, { Schema, Document } from 'mongoose';

export interface IInventory extends Document {
  distributor_id: mongoose.Types.ObjectId;
  product_id: mongoose.Types.ObjectId;
  sku: string;
  current_stock: number;
  threshold_qty: number;
  lead_time_days: number;
  alert_status: 'ok' | 'low' | 'critical';
  last_restocked_date?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const InventorySchema: Schema = new Schema(
  {
    distributor_id: {
      type: Schema.Types.ObjectId,
      ref: 'Distributor',
      required: true,
    },
    product_id: {
      type: Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    sku: {
      type: String,
      required: true,
      trim: true,
    },
    current_stock: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    threshold_qty: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    lead_time_days: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    alert_status: {
      type: String,
      enum: ['ok', 'low', 'critical'],
      default: 'ok',
    },
    last_restocked_date: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// A distributor can only have one inventory record per SKU
InventorySchema.index({ distributor_id: 1, product_id: 1 }, { unique: true });
InventorySchema.index({ alert_status: 1 });
InventorySchema.index({ sku: 1 });

export default mongoose.model<IInventory>('Inventory', InventorySchema);
