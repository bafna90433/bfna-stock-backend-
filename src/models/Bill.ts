import mongoose, { Document, Schema } from 'mongoose';

export interface IBillItem {
  productName: string;
  sku: string;
  unit: string;
  qty: number;
  pricePerUnit: number;
  gstRate: number;
  gstAmount: number;
  totalAmount: number;
}

export interface IBill extends Document {
  billNumber: string;
  orderId: mongoose.Types.ObjectId;
  orderNumber: string;
  dispatchId: mongoose.Types.ObjectId;
  customerName: string;
  items: IBillItem[];
  subtotal: number;
  totalGst: number;
  totalAmount: number;
  paidAmount: number;
  balanceDue: number;
  paymentStatus: 'paid' | 'partial' | 'pending';
  paymentHistory: { amount: number; date: Date; method: string; note: string }[];
  createdAt: Date;
  updatedAt: Date;
}

const BillItemSchema = new Schema<IBillItem>({
  productName: String,
  sku: String,
  unit: String,
  qty: Number,
  pricePerUnit: { type: Number, default: 0 },
  gstRate: { type: Number, default: 18 },
  gstAmount: { type: Number, default: 0 },
  totalAmount: { type: Number, default: 0 },
}, { _id: false });

const BillSchema = new Schema<IBill>({
  billNumber: { type: String, unique: true },
  orderId: { type: Schema.Types.ObjectId, ref: 'Order' },
  orderNumber: String,
  dispatchId: { type: Schema.Types.ObjectId, ref: 'Dispatch' },
  customerName: { type: String, required: true },
  items: [BillItemSchema],
  subtotal: { type: Number, default: 0 },
  totalGst: { type: Number, default: 0 },
  totalAmount: { type: Number, default: 0 },
  paidAmount: { type: Number, default: 0 },
  balanceDue: { type: Number, default: 0 },
  paymentStatus: { type: String, enum: ['paid', 'partial', 'pending'], default: 'pending' },
  paymentHistory: [{
    amount: Number,
    date: { type: Date, default: Date.now },
    method: { type: String, default: 'cash' },
    note: String,
  }],
}, { timestamps: true });

BillSchema.pre('save', async function () {
  if (!this.billNumber) {
    const count = await mongoose.model('Bill').countDocuments();
    this.billNumber = `BILL-${String(count + 1).padStart(5, '0')}`;
  }
});

export default mongoose.model<IBill>('Bill', BillSchema);
