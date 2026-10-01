import mongoose, { Schema, Document } from "mongoose";

export interface IPrescription extends Document {
  mrn: string;
  patient_id: mongoose.Types.ObjectId;
  doctor_id: mongoose.Types.ObjectId;
  district_id: mongoose.Types.ObjectId;
  city_id?: mongoose.Types.ObjectId;
  prescription_text: string;
  prescription_files: string[];
  duration_days: number;
  priority: "normal" | "urgent" | "emergency";
  items: Array<{
    product_id: mongoose.Types.ObjectId;
    name: string;
    sku: string;
    price: number;
    quantity: number;
  }>;
  diagnosis?: string;
  notes?: string;
  shopify_order_id?: string;
  shopify_order_number?: string;
  order_status: "pending" | "processing" | "fulfilled" | "cancelled";
  createdAt: Date;
  updatedAt: Date;
}

const PrescriptionSchema: Schema = new Schema(
  {
    mrn: {
      type: String,
      required: true,
      trim: true,
    },
    patient_id: {
      type: Schema.Types.ObjectId,
      ref: "Patient",
      required: true,
    },
    doctor_id: {
      type: Schema.Types.ObjectId,
      ref: "Doctor",
      required: true,
    },
    district_id: {
      type: Schema.Types.ObjectId,
      ref: "District",
      required: true,
    },
    city_id: {
      type: Schema.Types.ObjectId,
      ref: "City",
    },
    prescription_text: {
      type: String,
      required: true,
    },
    prescription_files: [
      {
        type: String,
      },
    ],
    duration_days: {
      type: Number,
      required: true,
      min: 1,
    },
    priority: {
      type: String,
      enum: ["normal", "urgent", "emergency"],
      default: "normal",
    },
    items: [
      {
        product_id: {
          type: Schema.Types.ObjectId,
          ref: "Product",
          required: true,
        },
        name: {
          type: String,
          required: true,
        },
        sku: {
          type: String,
          required: true,
        },
        price: {
          type: Number,
          required: true,
        },
        quantity: {
          type: Number,
          required: true,
          min: 1,
        },
      },
    ],
    diagnosis: {
      type: String,
      trim: true,
    },
    notes: {
      type: String,
      trim: true,
    },
    shopify_order_id: {
      type: String,
    },
    shopify_order_number: {
      type: String,
    },
    order_status: {
      type: String,
      enum: ["pending", "processing", "fulfilled", "cancelled"],
      default: "pending",
    },
  },
  {
    timestamps: true,
  },
);

// Indexes
PrescriptionSchema.index({ mrn: 1 });
PrescriptionSchema.index({ patient_id: 1 });
PrescriptionSchema.index({ doctor_id: 1 });
PrescriptionSchema.index({ district_id: 1 });
PrescriptionSchema.index({ city_id: 1 });
PrescriptionSchema.index({ shopify_order_id: 1 });
PrescriptionSchema.index({ createdAt: -1 });

export default mongoose.model<IPrescription>(
  "Prescription",
  PrescriptionSchema,
);
