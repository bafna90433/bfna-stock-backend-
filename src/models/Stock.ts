import mongoose, { Document, Schema } from 'mongoose';

export interface IStock extends Document {
  productId: mongoose.Types.ObjectId;
  availableQty: number;
  reservedQty: number;
  totalInward: number;
  totalOutward: number;
  lastUpdated: Date;
  stockCartons: number;
  stockInners: number;
  stockLoose: number;
}

const StockSchema = new Schema<IStock>({
  productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true, unique: true },
  availableQty: { type: Number, default: 0, min: 0 },
  reservedQty: { type: Number, default: 0, min: 0 },
  totalInward: { type: Number, default: 0 },
  totalOutward: { type: Number, default: 0 },
  lastUpdated: { type: Date, default: Date.now },
  stockCartons: { type: Number, default: 0 },
  stockInners: { type: Number, default: 0 },
  stockLoose: { type: Number, default: 0 },
}, { timestamps: true });

export default mongoose.model<IStock>('Stock', StockSchema);
