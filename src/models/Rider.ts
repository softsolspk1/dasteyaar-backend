import mongoose, { Schema, Document } from "mongoose";

export interface IRider extends Document {
  distributor_id: mongoose.Types.ObjectId;
  name: string;
  contact: string;
  vehicle_info?: string;
  status: "active" | "inactive";
  createdAt: Date;
  updatedAt: Date;
}

const RiderSchema: Schema = new Schema(
  {
    distributor_id: {
      type: Schema.Types.ObjectId,
      ref: "Distributor",
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    contact: {
      type: String,
      required: true,
      trim: true,
    },
    vehicle_info: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },
  },
  {
    timestamps: true,
  }
);

RiderSchema.index({ distributor_id: 1, status: 1 });

export default mongoose.model<IRider>("Rider", RiderSchema);
