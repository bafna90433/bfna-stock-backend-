import mongoose, { Document, Schema } from 'mongoose';

export interface IPaperOrder extends Document {
  salesmanId: mongoose.Types.ObjectId;
  salesmanName: string;
  customerName: string;
  imageUrl: string;
  notes: string;
  status: 'pending' | 'processed';
  linkedOrderId?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const PaperOrderSchema = new Schema<IPaperOrder>({
  salesmanId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  salesmanName: { type: String, required: true },
  customerName: { type: String, required: true, trim: true },
  imageUrl: { type: String, required: true },
  notes: { type: String, default: '' },
  status: { type: String, enum: ['pending', 'processed'], default: 'pending' },
  linkedOrderId: { type: Schema.Types.ObjectId, ref: 'Order' }
}, { timestamps: true });

export default mongoose.model<IPaperOrder>('PaperOrder', PaperOrderSchema);
