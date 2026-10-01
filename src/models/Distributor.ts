import mongoose, { Schema, Document } from 'mongoose';

export interface IDistributor extends Document {
  email: string;
  password: string;
  name: string;
  phone: string;
  city_id: mongoose.Types.ObjectId;
  status: 'active' | 'inactive';
  createdAt: Date;
  updatedAt: Date;
}

const DistributorSchema: Schema = new Schema(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    phone: {
      type: String,
      required: true,
      trim: true,
    },
    city_id: {
      type: Schema.Types.ObjectId,
      ref: 'City',
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
DistributorSchema.index({ email: 1 }, { unique: true });
DistributorSchema.index({ city_id: 1 });
DistributorSchema.index({ status: 1 });

export default mongoose.model<IDistributor>('Distributor', DistributorSchema);
