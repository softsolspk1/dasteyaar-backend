import mongoose, { Schema, Document } from 'mongoose';

export interface ITeam extends Document {
  name: string;
  description?: string;
  district_id: mongoose.Types.ObjectId;
  status: 'active' | 'inactive';
  createdAt: Date;
  updatedAt: Date;
}

const TeamSchema: Schema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    district_id: {
      type: Schema.Types.ObjectId,
      ref: 'District',
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
TeamSchema.index({ district_id: 1 });
TeamSchema.index({ status: 1 });

export default mongoose.model<ITeam>('Team', TeamSchema);
