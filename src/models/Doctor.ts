import mongoose, { Schema, Document } from 'mongoose';

export interface IDoctor extends Document {
  email: string;
  password: string;
  name: string;
  phone: string;
  district_id: mongoose.Types.ObjectId;
  team_id?: mongoose.Types.ObjectId;
  kam_id: mongoose.Types.ObjectId;
  pmdc_number: string;
  specialty: string;
  profile_photo?: string;
  status: 'active' | 'inactive';
  createdAt: Date;
  updatedAt: Date;
}

const DoctorSchema: Schema = new Schema(
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
    district_id: {
      type: Schema.Types.ObjectId,
      ref: 'District',
      required: true,
    },
    team_id: {
      type: Schema.Types.ObjectId,
      ref: 'Team',
      required: false,
    },
    kam_id: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: false, // Auto-assigned based on district
    },
    pmdc_number: {
      type: String,
      required: true,
      trim: true,
    },
    specialty: {
      type: String,
      required: true,
      trim: true,
    },
    profile_photo: {
      type: String,
      trim: true,
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
DoctorSchema.index({ email: 1 }, { unique: true });
DoctorSchema.index({ district_id: 1 });
DoctorSchema.index({ team_id: 1 });
DoctorSchema.index({ kam_id: 1 });

export default mongoose.model<IDoctor>('Doctor', DoctorSchema);
