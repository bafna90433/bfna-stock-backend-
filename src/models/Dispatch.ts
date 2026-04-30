import mongoose, { Document, Schema } from 'mongoose';

export interface IDispatchItem {
  productId: mongoose.Types.ObjectId;
  productName: string;
  sku: string;
  imageUrl: string;
  unit: string;
  qtyOrdered: number;
  qtyDispatched: number;
  stockStatus: 'available' | 'partial' | 'no_stock';
  pcsPerInner?: number;
  innerPerCarton?: number;
  price?: number;
  // Checking fields
  checkedQtyInner?: number;
  checkedQtyPcs?: number;
  totalCheckedPcs?: number;
}

export interface IDispatch extends Document {
  orderId: mongoose.Types.ObjectId;
  orderNumber: string;
  customerName: string;
  dispatchedBy: mongoose.Types.ObjectId;
  dispatchedByName: string;
  items: IDispatchItem[];
  status: 'pending' | 'partial' | 'complete';
  dispatchedAt: Date;
  transportName: string;
  lrNumber: string;
  expDeliveryDate: Date;
  notes: string;
  // Verification fields
  isVerified: boolean;
  verifiedBy?: mongoose.Types.ObjectId;
  verifiedByName?: string;
  verifiedAt?: Date;
}

const DispatchItemSchema = new Schema<IDispatchItem>({
  productId: { type: Schema.Types.ObjectId, ref: 'Product' },
  productName: String,
  sku: String,
  imageUrl: String,
  unit: String,
  qtyOrdered: Number,
  qtyDispatched: { type: Number, default: 0 },
  stockStatus: { type: String, enum: ['available', 'partial', 'no_stock'], default: 'available' },
  pcsPerInner: { type: Number, default: 0 },
  innerPerCarton: { type: Number, default: 0 },
  price: { type: Number, default: 0 },
  checkedQtyInner: { type: Number, default: 0 },
  checkedQtyPcs: { type: Number, default: 0 },
  totalCheckedPcs: { type: Number, default: 0 },
}, { _id: false });

const DispatchSchema = new Schema<IDispatch>({
  orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true },
  orderNumber: String,
  customerName: String,
  dispatchedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  dispatchedByName: String,
  items: [DispatchItemSchema],
  status: { type: String, enum: ['pending', 'partial', 'complete'], default: 'pending' },
  dispatchedAt: { type: Date },
  transportName: { type: String, default: '' },
  lrNumber: { type: String, default: '' },
  expDeliveryDate: { type: Date },
  notes: { type: String, default: '' },
  isVerified: { type: Boolean, default: false },
  verifiedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  verifiedByName: { type: String },
  verifiedAt: { type: Date },
}, { timestamps: true });

export default mongoose.model<IDispatch>('Dispatch', DispatchSchema);
