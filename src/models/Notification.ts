import mongoose, { Schema, Document } from 'mongoose';

export interface INotification extends Document {
  recipient_type: 'user' | 'distributor' | 'doctor';
  recipient_id: mongoose.Types.ObjectId;
  title: string;
  body: string;
  type: string;
  metadata?: Record<string, any>;
  read: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const NotificationSchema: Schema = new Schema(
  {
    recipient_type: {
      type: String,
      enum: ['user', 'distributor', 'doctor'],
      required: true,
    },
    recipient_id: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    body: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      required: true,
    },
    metadata: {
      type: Schema.Types.Mixed,
    },
    read: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

NotificationSchema.index({ recipient_type: 1, recipient_id: 1, read: 1 });
NotificationSchema.index({ createdAt: -1 });

export default mongoose.model<INotification>('Notification', NotificationSchema);
