import mongoose, { Document, Schema } from 'mongoose';

export interface INotification extends Document {
  targetRoles: string[];
  type: 'success' | 'warning' | 'error' | 'info';
  urgent: boolean;
  title: string;
  message: string;
  link?: string;
  readBy: string[];
  orderId?: mongoose.Types.ObjectId;
  createdAt: Date;
}

const NotificationSchema = new Schema<INotification>({
  targetRoles: [{ type: String }],
  type: { type: String, enum: ['success', 'warning', 'error', 'info'], default: 'info' },
  urgent: { type: Boolean, default: false },
  title: { type: String, required: true },
  message: { type: String, required: true },
  link: { type: String },
  readBy: [{ type: String }],
  orderId: { type: Schema.Types.ObjectId, ref: 'Order' },
}, { timestamps: true });

export default mongoose.model<INotification>('Notification', NotificationSchema);
