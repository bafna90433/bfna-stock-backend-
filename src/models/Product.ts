import mongoose, { Document, Schema } from 'mongoose';

export interface IProduct extends Document {
  name: string;
  sku: string;
  imageUrl: string;
  imageFileId: string;
  unit: 'inner' | 'box' | 'pcs';
  pricePerUnit: number;        // legacy / fallback
  wholesalerPrice: number;     // admin-set wholesaler price
  retailerPrice: number;       // admin-set retailer price
  gstRate: number;             // optional, default 0
  description: string;
  category: string;
  pcsPerInner: number;         // how many pcs make 1 inner (default 1)
  innerPerCarton: number;      // how many inners make 1 carton (default 1)
  createdBy: mongoose.Types.ObjectId;
  isActive: boolean;
  createdAt: Date;
}

const ProductSchema = new Schema<IProduct>({
  name: { type: String, required: true, trim: true },
  sku: { type: String, required: true, unique: true, uppercase: true, trim: true },
  imageUrl: { type: String, default: '' },
  imageFileId: { type: String, default: '' },
  unit: { type: String, enum: ['inner', 'box', 'pcs'], default: 'pcs' },
  pricePerUnit: { type: Number, default: 0 },
  wholesalerPrice: { type: Number, default: 0 },
  retailerPrice: { type: Number, default: 0 },
  gstRate: { type: Number, default: 0 },
  pcsPerInner: { type: Number, default: 1, min: 1 },
  innerPerCarton: { type: Number, default: 1, min: 1 },
  description: { type: String, default: '' },
  category: { type: String, default: 'General' },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

ProductSchema.index({ name: 'text', sku: 'text' });

export default mongoose.model<IProduct>('Product', ProductSchema);
