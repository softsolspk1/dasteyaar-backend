import mongoose, { Schema, Document } from 'mongoose';

export interface ICity extends Document {
  name: string;
  distributor_channel: 'pillbox' | 'other';
  distributor_ids?: mongoose.Types.ObjectId[]; // Array of References to Distributors if channel is 'other'
  district_id?: mongoose.Types.ObjectId;
  status: 'active' | 'inactive';
  createdAt: Date;
  updatedAt: Date;
}

const CitySchema: Schema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    distributor_channel: {
      type: String,
      enum: ['pillbox', 'other'],
      required: true,
      default: 'pillbox',
    },
    distributor_ids: [{
      type: Schema.Types.ObjectId,
      ref: 'Distributor',
    }],
    district_id: {
      type: Schema.Types.ObjectId,
      ref: 'District',
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
CitySchema.index({ name: 1 }, { unique: true });
CitySchema.index({ distributor_channel: 1 });
CitySchema.index({ distributor_ids: 1 });
CitySchema.index({ status: 1 });

export default mongoose.model<ICity>('City', CitySchema);
