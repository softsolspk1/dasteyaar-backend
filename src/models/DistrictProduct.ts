import mongoose, { Schema, Document } from 'mongoose';

export interface IDistrictProduct extends Document {
  district_id: mongoose.Types.ObjectId;
  product_id: mongoose.Types.ObjectId;
  assigned_at: Date;
  assigned_by: mongoose.Types.ObjectId;
  status: 'active' | 'inactive';
}

const DistrictProductSchema: Schema = new Schema(
  {
    district_id: {
      type: Schema.Types.ObjectId,
      ref: 'District',
      required: true,
    },
    product_id: {
      type: Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    assigned_at: {
      type: Date,
      default: Date.now,
    },
    assigned_by: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active',
    },
  },
  {
    timestamps: false,
  }
);

// Indexes
DistrictProductSchema.index({ district_id: 1 });
DistrictProductSchema.index({ product_id: 1 });
DistrictProductSchema.index({ district_id: 1, product_id: 1 }, { unique: true });

export default mongoose.model<IDistrictProduct>('DistrictProduct', DistrictProductSchema);
