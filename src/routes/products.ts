import { Router, Response } from 'express';
import multer from 'multer';
import Product from '../models/Product';
import Stock from '../models/Stock';
import { protect, AuthRequest } from '../middleware/auth';
import { uploadToImageKit, deleteFromImageKit } from '../utils/imagekit';
import { notify } from '../utils/notify';

const router = Router();
router.use(protect);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// GET /api/products - search products
router.get('/', async (req: AuthRequest, res: Response) => {
  const { search, page = 1, limit = 20 } = req.query;
  const query: any = { isActive: true };
  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { sku: { $regex: search, $options: 'i' } },
      { category: { $regex: search, $options: 'i' } },
    ];
  }
  const skip = (Number(page) - 1) * Number(limit);
  const [products, total] = await Promise.all([
    Product.find(query).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
    Product.countDocuments(query),
  ]);

  // attach stock info
  const productIds = products.map(p => p._id);
  const stocks = await Stock.find({ productId: { $in: productIds } });
  const stockMap = stocks.reduce((acc: any, s) => {
    acc[String(s.productId)] = s;
    return acc;
  }, {});

  const productsWithStock = products.map(p => ({
    ...p.toObject(),
    stock: stockMap[String(p._id)] || { availableQty: 0, reservedQty: 0 },
  }));

  res.json({ products: productsWithStock, total, page: Number(page), limit: Number(limit) });
});

// GET /api/products/:id
router.get('/:id', async (req: AuthRequest, res: Response) => {
  const product = await Product.findById(req.params.id);
  if (!product) return res.status(404).json({ message: 'Product not found' });
  const stock = await Stock.findOne({ productId: product._id });
  res.json({ ...product.toObject(), stock: stock || { availableQty: 0 } });
});

// POST /api/products - create product with image
router.post('/', upload.single('image'), async (req: AuthRequest, res: Response) => {
  const {
    name, sku, unit,
    pricePerUnit, wholesalerBillPrice, wholesalerPrice, wholesalerMrp, retailerPrice, retailerMrp,
    gstRate, description, category, initialQty, bulkPricingTiers,
  } = req.body;

  if (!wholesalerPrice || Number(wholesalerPrice) <= 0) return res.status(400).json({ message: 'Wholesaler Price is required' });
  if (!wholesalerMrp || Number(wholesalerMrp) <= 0) return res.status(400).json({ message: 'Wholesaler MRP is required' });
  if (!retailerPrice || Number(retailerPrice) <= 0) return res.status(400).json({ message: 'Retailer Price is required' });
  if (!retailerMrp || Number(retailerMrp) <= 0) return res.status(400).json({ message: 'Retailer MRP is required' });

  const existing = await Product.findOne({ sku: sku?.toUpperCase() });
  if (existing) return res.status(400).json({ message: 'SKU already exists' });

  let imageUrl = '';
  let imageFileId = '';
  if (req.file) {
    const result = await uploadToImageKit(req.file.buffer, `${sku}-${Date.now()}`, '/stock-management/products');
    imageUrl = result.url;
    imageFileId = result.fileId;
  }

  // All roles (admin + stock_manager) can set prices
  const productData: any = {
    name, sku, imageUrl, imageFileId, unit,
    description, category,
    gstRate: Number(gstRate) || 0,
    pcsPerInner: Number(req.body.pcsPerInner) || 0,
    innerPerCarton: Number(req.body.innerPerCarton) || 0,
    createdBy: req.user?._id,
    pricePerUnit: Number(pricePerUnit) || Number(retailerPrice) || 0,
    wholesalerBillPrice: Number(wholesalerBillPrice) || 0,
    wholesalerPrice: Number(wholesalerPrice) || 0,
    wholesalerMrp: Number(wholesalerMrp) || 0,
    bulkPricingTiers: (() => {
      try {
        const tiers = typeof bulkPricingTiers === 'string' ? JSON.parse(bulkPricingTiers) : (bulkPricingTiers || []);
        return tiers.filter((t: any) => t.minQty > 0 && t.price >= 0);
      } catch { return []; }
    })(),
    retailerPrice: Number(retailerPrice) || 0,
    retailerMrp: Number(retailerMrp) || 0,
  };

  const product = await Product.create(productData);

  await Stock.create({
    productId: product._id,
    availableQty: Number(initialQty) || 0,
    totalInward: Number(initialQty) || 0,
  });

  res.status(201).json(product);
});

// PUT /api/products/:id
router.put('/:id', upload.single('image'), async (req: AuthRequest, res: Response) => {
  const product = await Product.findById(req.params.id);
  if (!product) return res.status(404).json({ message: 'Product not found' });

  const { name, unit, pricePerUnit, wholesalerBillPrice, wholesalerPrice, wholesalerMrp, retailerPrice, retailerMrp, gstRate, description, category, pcsPerInner, innerPerCarton, bulkPricingTiers } = req.body;

  if (name) product.name = name;
  if (unit) product.unit = unit;
  if (description !== undefined) product.description = description;
  if (category) product.category = category;
  if (gstRate !== undefined) product.gstRate = Number(gstRate);
  if (pcsPerInner !== undefined) product.pcsPerInner = Number(pcsPerInner) || 0;
  if (innerPerCarton !== undefined) product.innerPerCarton = Number(innerPerCarton) || 0;

  // All roles can change prices
  if (pricePerUnit !== undefined) product.pricePerUnit = Number(pricePerUnit);
  if (wholesalerBillPrice !== undefined) product.wholesalerBillPrice = Number(wholesalerBillPrice);
  if (wholesalerPrice !== undefined) product.wholesalerPrice = Number(wholesalerPrice);
  if (wholesalerMrp !== undefined) product.wholesalerMrp = Number(wholesalerMrp);
  if (bulkPricingTiers !== undefined) {
    try {
      const tiers = typeof bulkPricingTiers === 'string' ? JSON.parse(bulkPricingTiers) : bulkPricingTiers;
      product.bulkPricingTiers = tiers.filter((t: any) => t.minQty > 0 && t.price >= 0);
    } catch { /* keep existing */ }
  }
  if (retailerPrice !== undefined) product.retailerPrice = Number(retailerPrice);
  if (retailerMrp !== undefined) product.retailerMrp = Number(retailerMrp);

  if (req.file) {
    if (product.imageFileId) await deleteFromImageKit(product.imageFileId);
    const result = await uploadToImageKit(req.file.buffer, `${product.sku}-${Date.now()}`, '/stock-management/products');
    product.imageUrl = result.url;
    product.imageFileId = result.fileId;
  }

  await product.save();
  res.json(product);
});

// PATCH /api/products/:id/stock - add/remove stock
router.patch('/:id/stock', async (req: AuthRequest, res: Response) => {
  const { qty, operation, cartons, inners, loose } = req.body; // operation: 'add' | 'remove' | 'set'
  const stock = await Stock.findOne({ productId: req.params.id });
  if (!stock) return res.status(404).json({ message: 'Stock not found' });

  if (operation === 'set') {
    const diff = Number(qty) - stock.availableQty;
    if (diff > 0) stock.totalInward += diff;
    else if (diff < 0) stock.totalOutward += Math.abs(diff);
    stock.availableQty = Number(qty);
  } else if (operation === 'add') {
    stock.availableQty += Number(qty);
    stock.totalInward += Number(qty);
  } else if (operation === 'remove') {
    if (stock.availableQty < Number(qty)) return res.status(400).json({ message: 'Insufficient stock' });
    stock.availableQty -= Number(qty);
    stock.totalOutward += Number(qty);
  }

  if (cartons !== undefined) stock.stockCartons = Number(cartons);
  if (inners !== undefined) stock.stockInners = Number(inners);
  if (loose !== undefined) stock.stockLoose = Number(loose);

  stock.lastUpdated = new Date();
  await stock.save();

  // Notify on low / out of stock
  const product = await Product.findById(req.params.id).lean();
  const name = product?.name || req.params.id;
  if (stock.availableQty === 0) {
    await notify({
      targetRoles: ['stock_manager', 'admin'],
      type: 'error',
      urgent: true,
      title: '🔴 Out of Stock!',
      message: `${name} is now OUT OF STOCK — restock immediately`,
      link: `/stock-manager/stock`,
    });
  } else if (stock.availableQty <= 10) {
    await notify({
      targetRoles: ['stock_manager', 'admin'],
      type: 'warning',
      urgent: true,
      title: '🟠 Low Stock Alert',
      message: `${name} — only ${stock.availableQty} units remaining`,
      link: `/stock-manager/stock`,
    });
  }

  res.json(stock);
});

// DELETE /api/products/:id
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  const product = await Product.findById(req.params.id);
  if (!product) return res.status(404).json({ message: 'Product not found' });
  if (product.imageFileId) await deleteFromImageKit(product.imageFileId);
  product.isActive = false;
  await product.save();
  res.json({ message: 'Product deactivated' });
});

export default router;
