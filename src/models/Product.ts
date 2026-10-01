import mongoose, { Schema, Document } from 'mongoose';

export interface IProduct extends Document {
  name: string;
  sku: string;
  description: string;
  price: number;
  shopify_product_id: string;
  status: 'active' | 'inactive';
  createdAt: Date;
  updatedAt: Date;
}

const ProductSchema: Schema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    sku: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    shopify_product_id: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active',
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
ProductSchema.index({ sku: 1 }, { unique: true });
ProductSchema.index({ shopify_product_id: 1 });

export default mongoose.model<IProduct>('Product', ProductSchema);
