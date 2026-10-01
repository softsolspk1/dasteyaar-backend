import mongoose, { Schema, Document } from 'mongoose';

export interface ITeamProduct extends Document {
  team_id: mongoose.Types.ObjectId;
  product_id: mongoose.Types.ObjectId;
  assigned_at: Date;
  assigned_by: mongoose.Types.ObjectId;
  status: 'active' | 'inactive';
}

const TeamProductSchema: Schema = new Schema(
  {
    team_id: {
      type: Schema.Types.ObjectId,
      ref: 'Team',
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
TeamProductSchema.index({ team_id: 1 });
TeamProductSchema.index({ product_id: 1 });
TeamProductSchema.index({ team_id: 1, product_id: 1 }, { unique: true });

export default mongoose.model<ITeamProduct>('TeamProduct', TeamProductSchema);
