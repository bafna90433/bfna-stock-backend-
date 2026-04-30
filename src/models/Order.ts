import mongoose, { Document, Schema } from 'mongoose';

export interface IOrderItem {
  productId: mongoose.Types.ObjectId;
  productName: string;
  sku: string;
  imageUrl: string;
  unit: string;
  cartonQty: number;  // cartons entered by staff
  innerQty: number;     // extra inners entered by staff
  looseQty: number;     // extra loose pcs entered by staff
  totalQtyPcs: number;  // calculated: (cartonQty×innerPerCarton×pcsPerInner) + (innerQty×pcsPerInner) + looseQty
  pcsPerInner: number;  // snapshot from product at order time
  innerPerCarton: number;  // snapshot from product at order time
  qtyOrdered: number;   // = totalQtyPcs (kept for backward compat)
  qtyDispatched: number;
  pricePerUnit: number;
  gstRate: number;
}

export interface IHistoryEvent {
  action: string;
  details?: string;
  by: string;
  role: string;
  timestamp: Date;
}

export interface IOrder extends Document {
  orderNumber: string;
  customerName: string;
  customerAddress: {
    area: string;
    city: string;
    state: string;
    country: string;
    pinCode: string;
  };
  customerType: 'wholesaler' | 'retailer';
  salesmanId: mongoose.Types.ObjectId;
  salesmanName: string;
  whatsappText: string;
  paperOrderImageUrl: string;
  status: 'pending' | 'waiting' | 'partial' | 'dispatched' | 'billed' | 'paid' | 'cancelled';
  items: IOrderItem[];
  notes: string;
  estimatedDeliveryDate?: Date;
  deliverySeenByStaff: boolean;
  dispatchSeen: boolean;
  history: IHistoryEvent[];
  createdAt: Date;
  updatedAt: Date;
}

const OrderItemSchema = new Schema<IOrderItem>({
  productId: { type: Schema.Types.ObjectId, ref: 'Product' },
  productName: String,
  sku: String,
  imageUrl: String,
  unit: String,
  cartonQty: { type: Number, default: 0 },
  innerQty: { type: Number, default: 0 },
  looseQty: { type: Number, default: 0 },
  totalQtyPcs: { type: Number, default: 0 },
  pcsPerInner: { type: Number, default: 1 },
  innerPerCarton: { type: Number, default: 1 },
  qtyOrdered: { type: Number, default: 0 },
  qtyDispatched: { type: Number, default: 0 },
  pricePerUnit: { type: Number, default: 0 },
  gstRate: { type: Number, default: 18 },
}, { _id: false });

const HistorySchema = new Schema<IHistoryEvent>({
  action: { type: String, required: true },
  details: { type: String },
  by: { type: String, required: true },
  role: { type: String, required: true },
  timestamp: { type: Date, default: Date.now }
}, { _id: false });

const OrderSchema = new Schema<IOrder>({
  orderNumber: { type: String, unique: true },
  customerName: { type: String, required: true, trim: true },
  customerAddress: {
    area:    { type: String, default: '' },
    city:    { type: String, default: '' },
    state:   { type: String, default: '' },
    country: { type: String, default: 'India' },
    pinCode: { type: String, default: '' },
  },
  customerType: { type: String, enum: ['wholesaler', 'retailer'], default: 'retailer' },
  salesmanId: { type: Schema.Types.ObjectId, ref: 'User' },
  salesmanName: { type: String },
  whatsappText: { type: String, default: '' },
  paperOrderImageUrl: { type: String },
  status: { type: String, enum: ['pending', 'waiting', 'partial', 'dispatched', 'billed', 'paid', 'cancelled'], default: 'pending' },
  items: [OrderItemSchema],
  notes: { type: String, default: '' },
  estimatedDeliveryDate: { type: Date },
  deliverySeenByStaff: { type: Boolean, default: true },
  dispatchSeen: { type: Boolean, default: false },
  history: [HistorySchema],
}, { timestamps: true });

OrderSchema.pre('save', async function () {
  if (!this.orderNumber) {
    const count = await mongoose.model('Order').countDocuments();
    this.orderNumber = `ORD-${String(count + 1).padStart(5, '0')}`;
  }
});

export default mongoose.model<IOrder>('Order', OrderSchema);
