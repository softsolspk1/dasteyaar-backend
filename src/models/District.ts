import mongoose, { Schema, Document } from 'mongoose';

export interface IDistrict extends Document {
  name: string;
  code: string;
  kam_id: mongoose.Types.ObjectId;
  sales_manager_id?: mongoose.Types.ObjectId;
  status: 'active' | 'inactive';
  createdAt: Date;
  updatedAt: Date;
}

const DistrictSchema: Schema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    kam_id: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    sales_manager_id: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: false,
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
DistrictSchema.index({ code: 1 }, { unique: true });
DistrictSchema.index({ kam_id: 1 });
DistrictSchema.index({ sales_manager_id: 1 }, { sparse: true });

export default mongoose.model<IDistrict>('District', DistrictSchema);
