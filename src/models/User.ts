import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
  email: string;
  password: string;
  name: string;
  role: 'super_admin' | 'kam' | 'director' | 'sales_manager';
  assigned_districts: mongoose.Types.ObjectId[];
  status: 'active' | 'inactive';
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema: Schema = new Schema(
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
    role: {
      type: String,
      enum: ['super_admin', 'kam', 'director', 'sales_manager'],
      required: true,
    },
    assigned_districts: [{
      type: Schema.Types.ObjectId,
      ref: 'District',
    }],
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

// Index for faster queries
UserSchema.index({ email: 1 }, { unique: true });
UserSchema.index({ role: 1 });

export default mongoose.model<IUser>('User', UserSchema);
