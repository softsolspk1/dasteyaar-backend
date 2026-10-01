import mongoose, { Document, Schema } from 'mongoose';

export interface IBanner extends Document {
  title: string;
  description?: string;
  image_url: string;
  cloudinary_id: string;
  order: number;
  is_active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const BannerSchema: Schema = new Schema(
  {
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
      maxlength: [100, 'Title cannot exceed 100 characters'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [500, 'Description cannot exceed 500 characters'],
    },
    image_url: {
      type: String,
      required: [true, 'Image URL is required'],
    },
    cloudinary_id: {
      type: String,
      required: [true, 'Cloudinary ID is required'],
    },
    order: {
      type: Number,
      default: 0,
      min: [0, 'Order must be a positive number'],
    },
    is_active: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Index for efficient querying
BannerSchema.index({ order: 1, is_active: 1 });
BannerSchema.index({ is_active: 1, order: 1 });

export default mongoose.model<IBanner>('Banner', BannerSchema);
