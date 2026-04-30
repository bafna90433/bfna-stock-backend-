import mongoose, { Document, Schema } from 'mongoose';

export interface IStock extends Document {
  productId: mongoose.Types.ObjectId;
  availableQty: number;
  reservedQty: number;
  totalInward: number;
  totalOutward: number;
  lastUpdated: Date;
}

const StockSchema = new Schema<IStock>({
  productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true, unique: true },
  availableQty: { type: Number, default: 0, min: 0 },
  reservedQty: { type: Number, default: 0, min: 0 },
  totalInward: { type: Number, default: 0 },
  totalOutward: { type: Number, default: 0 },
  lastUpdated: { type: Date, default: Date.now },
}, { timestamps: true });

export default mongoose.model<IStock>('Stock', StockSchema);
