import { Router, Response } from 'express';
import multer from 'multer';
import Order from '../models/Order';
import Stock from '../models/Stock';
import { protect, AuthRequest } from '../middleware/auth';
import { uploadToImageKit } from '../utils/imagekit';
import { notify } from '../utils/notify';

const router = Router();
router.use(protect);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// GET /api/orders/stats/summary — MUST be BEFORE /:id
router.get('/stats/summary', async (req: AuthRequest, res: Response) => {
  const [total, pending, dispatched, billed, paid] = await Promise.all([
    Order.countDocuments(),
    Order.countDocuments({ status: { $in: ['pending', 'waiting', 'partial'] } }),
    Order.countDocuments({ status: 'dispatched' }),
    Order.countDocuments({ status: 'billed' }),
    Order.countDocuments({ status: 'paid' }),
  ]);
  res.json({ total, pending, dispatched, billed, paid });
});

// GET /api/orders
router.get('/', async (req: AuthRequest, res: Response) => {
  const { status, page = 1, limit = 20, search } = req.query;
  const query: any = {};
  if (status) {
    if (String(status).includes(',')) {
      query.status = { $in: String(status).split(',') };
    } else {
      query.status = status;
    }
  }
  if (search) query.$or = [
    { customerName: { $regex: search, $options: 'i' } },
    { orderNumber: { $regex: search, $options: 'i' } },
  ];
  if (req.user?.role === 'salesman') query.salesmanId = req.user._id;

  const skip = (Number(page) - 1) * Number(limit);
  const [orders, total] = await Promise.all([
    Order.find(query).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
    Order.countDocuments(query),
  ]);

  const orderIds = orders.map(o => o._id);
  const Dispatch = Order.db.model('Dispatch');
  const Bill = Order.db.model('Bill');

  const [dispatches, bills] = await Promise.all([
    Dispatch.find({ orderId: { $in: orderIds } }).lean(),
    Bill.find({ orderId: { $in: orderIds } }).lean()
  ]);

  // 3. Enrich with stock info to see if anything can be dispatched
  const productIds = Array.from(new Set(orders.flatMap(o => o.items.map((i: any) => i.productId))));
  const stocks = await Stock.find({ productId: { $in: productIds } }).lean();

  const enrichedOrders = orders.map(order => {
    const dispatchInfo = dispatches.find((d: any) => String(d.orderId) === String(order._id));
    const billInfo = bills.find((b: any) => String(b.orderId) === String(order._id));
    
    const itemsWithStock = order.items.map((item: any) => {
      const remaining = item.qtyOrdered - (item.qtyDispatched || 0);
      const stock = stocks.find((s: any) => String(s.productId) === String(item.productId));
      const availableQty = stock?.availableQty || 0;
      return { remaining, availableQty };
    });

    const allReady = itemsWithStock.length > 0 && itemsWithStock.every(i => i.availableQty >= i.remaining);
    const anyReady = itemsWithStock.some(i => i.remaining > 0 && i.availableQty > 0);

    const canDispatch = order.status === 'partial' ? anyReady : 
                        order.status === 'waiting' ? allReady :
                        anyReady;

    return {
      ...order,
      dispatchInfo,
      billInfo,
      canDispatch
    };
  });

  res.json({ orders: enrichedOrders, total });
});

// GET /api/orders/:id
router.get('/:id', async (req: AuthRequest, res: Response) => {
  const order = await Order.findById(req.params.id).lean();
  if (!order) return res.status(404).json({ message: 'Order not found' });
  
  // Enrich items with current stock info
  const productIds = order.items.map((i: any) => i.productId).filter(Boolean);
  const stocks = await Stock.find({ productId: { $in: productIds } }).lean();
  
  const enrichedItems = order.items.map((item: any) => {
    const stock = stocks.find((s: any) => String(s.productId) === String(item.productId));
    return {
      ...item,
      currentStock: stock ? stock.availableQty : 0
    };
  });

  res.json({ ...order, items: enrichedItems });
});

// POST /api/orders — supports JSON body OR multipart with order image
router.post('/', upload.single('orderImage'), async (req: AuthRequest, res: Response) => {
  let { customerName, customerAddress, customerType, whatsappText, paperOrderImageUrl, notes, items, salesmanId, salesmanName } = req.body;
  if (typeof customerAddress === 'string') {
    try { customerAddress = JSON.parse(customerAddress); } catch { customerAddress = {}; }
  }

  // If sent via FormData, items comes as JSON string
  if (typeof items === 'string') {
    try { items = JSON.parse(items); } catch { items = []; }
  }

  if (!customerName) return res.status(400).json({ message: 'Customer name required' });
  if (!items || items.length === 0) return res.status(400).json({ message: 'At least one item required' });

  // If file uploaded, push to ImageKit and use as paperOrderImageUrl
  let orderImg = paperOrderImageUrl;
  if (req.file) {
    const result = await uploadToImageKit(
      req.file.buffer,
      `order-${Date.now()}`,
      '/stock-management/order-images'
    );
    orderImg = result.url;
  }

  const order = await Order.create({
    customerName,
    customerAddress: customerAddress || '',
    customerType: customerType === 'wholesaler' ? 'wholesaler' : 'retailer',
    salesmanId: salesmanId || req.user?._id,
    salesmanName: salesmanName || req.user?.name,
    whatsappText,
    paperOrderImageUrl: orderImg,
    notes,
    items,
    status: 'pending',
    history: [{
      action: orderImg ? 'Order Created with Image' : 'Order Created',
      by: req.user?.name || 'System',
      role: req.user?.role || 'unknown'
    }]
  });

  // Auto-deduct stock for each item in the order
  for (const item of items) {
    if (!item.productId) continue;
    const qty = Number(item.totalQtyPcs || item.qtyOrdered || 0);
    if (qty <= 0) continue;
    try {
      const stock = await Stock.findOne({ productId: item.productId });
      if (stock) {
        stock.availableQty = Math.max(0, stock.availableQty - qty);
        stock.totalOutward += qty;
        stock.lastUpdated = new Date();
        await stock.save();
      }
    } catch { }
  }

  // Notify dispatch team about new order
  await notify({
    targetRoles: ['dispatch', 'admin'],
    type: 'info',
    urgent: true,
    title: '🛒 New Order Created',
    message: `Order ${order.orderNumber} from ${customerName} — ${items.length} item(s) ready to dispatch`,
    link: `/dispatch/orders`,
    orderId: String(order._id),
  });

  res.status(201).json(order);
});

// PUT /api/orders/:id
router.put('/:id', async (req: AuthRequest, res: Response) => {
  const order = await Order.findById(req.params.id);
  if (!order) return res.status(404).json({ message: 'Order not found' });
  
  // Allow update for pending or waiting orders
  if (!['pending', 'waiting'].includes(order.status)) {
    return res.status(400).json({ message: `Cannot edit order in ${order.status} status` });
  }

  let { customerName, customerAddress, customerType, whatsappText, notes, items } = req.body;

  // 1. Revert old stock
  for (const item of order.items) {
    if (!item.productId) continue;
    const qty = Number(item.totalQtyPcs || item.qtyOrdered || 0);
    if (qty <= 0) continue;
    try {
      const stock = await Stock.findOne({ productId: item.productId });
      if (stock) {
        stock.availableQty += qty;
        stock.totalOutward = Math.max(0, stock.totalOutward - qty);
        await stock.save();
      }
    } catch { }
  }

  // 2. Update order fields
  if (customerName) order.customerName = customerName;
  if (customerAddress) {
    if (typeof customerAddress === 'string') {
      try { order.customerAddress = JSON.parse(customerAddress); } catch { }
    } else {
      order.customerAddress = customerAddress;
    }
  }
  if (customerType) order.customerType = customerType;
  if (whatsappText !== undefined) order.whatsappText = whatsappText;
  if (notes !== undefined) order.notes = notes;
  if (items) {
    if (typeof items === 'string') {
      try { items = JSON.parse(items); } catch { items = []; }
    }
    order.items = items;
  }

  // 3. Deduct new stock
  for (const item of order.items) {
    if (!item.productId) continue;
    const qty = Number(item.totalQtyPcs || item.qtyOrdered || 0);
    if (qty <= 0) continue;
    try {
      const stock = await Stock.findOne({ productId: item.productId });
      if (stock) {
        stock.availableQty = Math.max(0, stock.availableQty - qty);
        stock.totalOutward += qty;
        stock.lastUpdated = new Date();
        await stock.save();
      }
    } catch { }
  }

  order.history.push({
    action: 'Order Updated',
    by: req.user?.name || 'System',
    role: req.user?.role || 'unknown'
  });

  await order.save();
  res.json(order);
});

// PATCH /api/orders/:id/cancel
router.patch('/:id/cancel', async (req: AuthRequest, res: Response) => {
  const order = await Order.findById(req.params.id);
  if (!order) return res.status(404).json({ message: 'Order not found' });
  
  if (['dispatched', 'billed', 'paid', 'cancelled'].includes(order.status)) {
    return res.status(400).json({ message: `Cannot cancel order in ${order.status} status` });
  }

  // Revert stock
  for (const item of order.items) {
    if (!item.productId) continue;
    const qty = Number(item.totalQtyPcs || item.qtyOrdered || 0);
    const pendingQty = qty - (item.qtyDispatched || 0); // Only revert what wasn't dispatched
    if (pendingQty <= 0) continue;
    
    try {
      const stock = await Stock.findOne({ productId: item.productId });
      if (stock) {
        stock.availableQty += pendingQty;
        stock.totalOutward = Math.max(0, stock.totalOutward - pendingQty);
        await stock.save();
      }
    } catch { }
  }

  order.status = 'cancelled';
  order.history.push({
    action: 'Order Cancelled',
    by: req.user?.name || 'System',
    role: req.user?.role || 'unknown'
  });

  await order.save();
  res.json({ message: 'Order cancelled successfully', order });
});

// DELETE /api/orders/:id
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  const order = await Order.findById(req.params.id);
  if (!order) return res.status(404).json({ message: 'Order not found' });
  
  // Only allow deleting PENDING orders
  if (order.status !== 'pending') {
    return res.status(400).json({ message: 'Only pending orders can be deleted. Please cancel other orders instead.' });
  }

  // User specifically requested NOT to update stock when deleting
  await Order.findByIdAndDelete(req.params.id);
  res.json({ message: 'Pending order deleted' });
});

// PATCH /api/orders/:id/hold
router.patch('/:id/hold', async (req: AuthRequest, res: Response) => {
  const { estimatedDeliveryDate, notes } = req.body;
  const order = await Order.findById(req.params.id);
  if (!order) return res.status(404).json({ message: 'Order not found' });

  order.status = 'waiting';
  order.deliverySeenByStaff = false;
  if (estimatedDeliveryDate) order.estimatedDeliveryDate = new Date(estimatedDeliveryDate);
  if (notes) order.notes = notes;

  const pendingItemsList: string[] = [];
  order.items.forEach((oi: any) => {
    const pending = oi.qtyOrdered - (oi.qtyDispatched || 0);
    if (pending > 0) pendingItemsList.push(`${oi.productName}: ${pending}`);
  });

  order.history.push({
    action: `Order Held (Waiting for Stock)`,
    details: `Pending Items:\n${pendingItemsList.join('\n')}${estimatedDeliveryDate ? `\n\nEst. Delivery: ${new Date(estimatedDeliveryDate).toLocaleDateString('en-IN')}` : ''}${notes ? `\nReason: ${notes}` : ''}`,
    by: req.user?.name || 'System',
    role: req.user?.role || 'unknown'
  });

  await order.save();

  // Notify sales staff
  await notify({
    targetRoles: ['sale_staff', 'salesman', 'admin'],
    type: 'warning',
    urgent: true,
    title: '⏳ Order on Hold (Waiting for Stock)',
    message: `${order.orderNumber} (${order.customerName}) — ${notes || 'Stock not available'}`,
    link: `/sale-staff/pending-orders`,
    orderId: String(order._id),
  });

  res.json(order);
});

// PATCH /api/orders/:id/delivery-update
router.patch('/:id/delivery-update', async (req: AuthRequest, res: Response) => {
  const { estimatedDeliveryDate, notes, delayDays } = req.body;
  const order = await Order.findById(req.params.id);
  if (!order) return res.status(404).json({ message: 'Order not found' });

  order.estimatedDeliveryDate = estimatedDeliveryDate;
  order.deliverySeenByStaff = false;

  const delayStr = delayDays && delayDays > 0 ? ` (${delayDays} Days Delay)` : '';

  order.history.push({
    action: `Pending Order Update`,
    details: `Expected Date: ${new Date(estimatedDeliveryDate).toLocaleDateString()}${delayStr}${notes ? `\nReason/Note: ${notes}` : ''}`,
    by: req.user?.name || 'System',
    role: req.user?.role || 'unknown'
  });

  await order.save();
  res.json(order);
});

// PATCH /api/orders/:id/mark-delivery-seen
router.patch('/:id/mark-delivery-seen', async (req: AuthRequest, res: Response) => {
  const order = await Order.findById(req.params.id);
  if (!order) return res.status(404).json({ message: 'Order not found' });

  order.deliverySeenByStaff = true;
  await order.save();
  res.json(order);
});
// PATCH /api/orders/:id/mark-seen - mark order as seen by staff or dispatch
router.patch('/:id/mark-seen', protect, async (req: AuthRequest, res: Response) => {
  const order = await Order.findById(req.params.id);
  if (!order) return res.status(404).json({ message: 'Order not found' });

  if (req.user?.role === 'sale_staff' || req.user?.role === 'admin') {
    order.deliverySeenByStaff = true;
  }
  if (req.user?.role === 'dispatch' || req.user?.role === 'admin') {
    order.dispatchSeen = true;
  }

  await order.save();
  res.json({ message: 'Order marked as seen' });
});

// GET /api/orders/reports/customer-fulfillment
router.get('/reports/customer-fulfillment', async (req: AuthRequest, res: Response) => {
  const query: any = { status: { $ne: 'cancelled' } };
  if (req.user?.role === 'salesman') query.salesmanId = req.user._id;
  
  const orders = await Order.find(query).lean();
  
  const customerMap: Record<string, any> = {};
  
  orders.forEach(order => {
    if (!customerMap[order.customerName]) {
      customerMap[order.customerName] = {
        customerName: order.customerName,
        totalOrders: 0,
        products: {}
      };
    }
    customerMap[order.customerName].totalOrders++;
    
    order.items.forEach((item: any) => {
      const key = item.productId || item.productName;
      if (!customerMap[order.customerName].products[key]) {
        customerMap[order.customerName].products[key] = {
          productId: item.productId,
          productName: item.productName,
          sku: item.sku,
          imageUrl: item.imageUrl,
          qtyOrdered: 0,
          qtyDispatched: 0
        };
      }
      customerMap[order.customerName].products[key].qtyOrdered += item.qtyOrdered;
      customerMap[order.customerName].products[key].qtyDispatched += (item.qtyDispatched || 0);
    });
  });

  const result = Object.values(customerMap).map((c: any) => ({
    ...c,
    products: Object.values(c.products).map((p: any) => ({
      ...p,
      qtyPending: p.qtyOrdered - p.qtyDispatched
    })).filter((p: any) => p.qtyOrdered > 0)
  })).sort((a, b) => b.totalOrders - a.totalOrders);

  res.json(result);
});

export default router;
