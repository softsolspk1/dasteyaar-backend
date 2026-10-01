import mongoose, { Schema, Document } from 'mongoose';

export interface IPatient extends Document {
  mrn: string;
  name: string;
  phone: string;
  age?: number;
  gender?: 'male' | 'female' | 'other';
  city?: string;
  created_by: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const PatientSchema: Schema = new Schema(
  {
    mrn: {
      type: String,
      required: true,
      trim: true,
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
    age: {
      type: Number,
      min: 0,
      max: 150,
    },
    gender: {
      type: String,
      enum: ['male', 'female', 'other'],
    },
    city: {
      type: String,
      trim: true,
    },
    created_by: {
      type: Schema.Types.ObjectId,
      ref: 'Doctor',
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
PatientSchema.index({ mrn: 1 }, { unique: true });
PatientSchema.index({ phone: 1 });
PatientSchema.index({ created_by: 1 });

export default mongoose.model<IPatient>('Patient', PatientSchema);
