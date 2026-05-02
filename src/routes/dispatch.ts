import { Router, Response } from 'express';
import Dispatch from '../models/Dispatch';
import Order from '../models/Order';
import Stock from '../models/Stock';
import Bill from '../models/Bill';
import { protect, AuthRequest } from '../middleware/auth';
import { notify } from '../utils/notify';

const router = Router();
router.use(protect);

// GET /api/dispatch - list dispatches
router.get('/', async (req: AuthRequest, res: Response) => {
  const { status } = req.query;
  const query: any = {};
  if (status) query.status = status;
  const dispatches = await Dispatch.find(query).sort({ createdAt: -1 });
  res.json(dispatches);
});

// GET /api/dispatch/order/:orderId - get dispatch for order with stock info
router.get('/order/:orderId', async (req: AuthRequest, res: Response) => {
  const order = await Order.findById(req.params.orderId);
  if (!order) return res.status(404).json({ message: 'Order not found' });

  // Mark as seen by dispatch
  if (!order.dispatchSeen) {
    order.dispatchSeen = true;
    await order.save();
  }

  const orderLean = order.toObject();

  // fetch stock for each item
  const itemsWithStock = await Promise.all(
    orderLean.items.map(async (item: any) => {
      const remaining = item.qtyOrdered - (item.qtyDispatched || 0);
      const stock = await Stock.findOne({ productId: item.productId });
      const availableQty = stock?.availableQty || 0;
      
      let stockStatus = 'available';
      if (remaining <= 0) stockStatus = 'completed';
      else if (availableQty <= 0) stockStatus = 'no_stock';
      else if (availableQty < remaining) stockStatus = 'partial';

      return {
        ...item,
        remainingQty: remaining,
        availableQty,
        stockStatus
      };
    })
  );

  res.json({ order: orderLean, itemsWithStock });
});

// GET /api/dispatch/ready - fresh pending orders (stock already reserved on creation)
router.get('/ready', async (req: AuthRequest, res: Response) => {
  const orders = await Order.find({ status: 'pending' })
    .sort({ createdAt: -1 })
    .lean();
  res.json({ orders });
});

// POST /api/dispatch - create dispatch
router.post('/', async (req: AuthRequest, res: Response) => {
  const { orderId, items, notes, transportName, lrNumber, expDeliveryDate, delayDays } = req.body;

  const order = await Order.findById(orderId);
  if (!order) return res.status(404).json({ message: 'Order not found' });

  // validate and deduct stock
  for (const item of items) {
    if (item.qtyDispatched <= 0) continue;

    // check if already dispatched
    const oi = order.items.find(i => String(i.productId) === String(item.productId));
    if (!oi) continue;
    const remaining = oi.qtyOrdered - (oi.qtyDispatched || 0);
    if (item.qtyDispatched > remaining) {
      return res.status(400).json({ message: `Cannot dispatch more than ordered for ${item.productName}. Remaining: ${remaining}` });
    }

    const stock = await Stock.findOne({ productId: item.productId });
    if (!stock) continue;
    if (stock.availableQty < item.qtyDispatched) {
      return res.status(400).json({ message: `Insufficient stock for ${item.productName}` });
    }
    stock.availableQty -= item.qtyDispatched;
    stock.totalOutward += item.qtyDispatched;
    stock.lastUpdated = new Date();
    await stock.save();
  }

  const dispatch = await Dispatch.create({
    orderId,
    orderNumber: order.orderNumber,
    customerName: order.customerName,
    dispatchedBy: req.user?._id,
    dispatchedByName: req.user?.name,
    items,
    status: items.every((i: any) => i.qtyDispatched >= i.qtyOrdered) ? 'complete' : 'partial',
    dispatchedAt: new Date(),
    transportName,
    lrNumber,
    expDeliveryDate,
    notes,
  });

  // update order items dispatched qty and status
  order.items = order.items.map((oi) => {
    const dispatched = items.find((i: any) => String(i.productId) === String(oi.productId));
    if (dispatched) oi.qtyDispatched = (oi.qtyDispatched || 0) + dispatched.qtyDispatched;
    return oi;
  });

  const allDispatched = order.items.every(i => i.qtyDispatched >= i.qtyOrdered);
  const anyDispatched = order.items.some(i => (i.qtyDispatched || 0) > 0);
  order.status = allDispatched ? 'dispatched' : anyDispatched ? 'partial' : 'pending';

  if (expDeliveryDate) {
    order.estimatedDeliveryDate = new Date(expDeliveryDate);
    order.deliverySeenByStaff = false;
  }
  if (notes) order.notes = notes;

  // Build the detailed notification message
  const dispatchedItemsList: string[] = [];
  const pendingItemsList: string[] = [];

  order.items.forEach(oi => {
    const dispatched = oi.qtyDispatched || 0;
    const ordered = oi.qtyOrdered || 0;
    const pending = ordered - dispatched;
    
    if (dispatched > 0) {
      dispatchedItemsList.push(`${oi.productName}: ${dispatched}`);
    }
    if (pending > 0) {
      pendingItemsList.push(`${oi.productName}: ${pending}`);
    }
  });

  let messageText = order.status === 'partial' 
    ? "Order partially dispatched. Remaining items will be delivered soon."
    : "Order fully dispatched.";
    
  let detailsText = `Dispatched Items:\n${dispatchedItemsList.join('\n')}`;
  if (pendingItemsList.length > 0) {
    detailsText += `\n\nPending Items:\n${pendingItemsList.join('\n')}`;
  }
  if (expDeliveryDate) {
    const delayStr = delayDays && delayDays > 0 ? ` (${delayDays} Days Delay)` : '';
    detailsText += `\n\nExpected Dispatch Date:\n${new Date(expDeliveryDate).toLocaleDateString('en-IN')}${delayStr}`;
  }

  order.history.push({
    action: messageText,
    details: detailsText,
    by: req.user?.name || 'System',
    role: req.user?.role || 'unknown'
  });

  await order.save();

  const isPartial = order.status === 'partial';
  const isWaiting = (order.status as string) === 'waiting';

  // Notify sales staff
  await notify({
    targetRoles: ['sale_staff', 'salesman', 'admin'],
    type: isPartial ? 'warning' : 'success',
    urgent: true,
    title: isPartial ? '📦 Order Partially Dispatched' : '✅ Order Dispatched',
    message: `${order.orderNumber} (${order.customerName}) — ${isPartial ? 'Partial dispatch done, remaining items pending' : 'Full order dispatched'}`,
    link: isPartial ? `/sale-staff/pending-orders` : `/sale-staff/dispatched-orders`,
    orderId: String(order._id),
  });

  // Notify billing — only if fully dispatched
  if (!isPartial && !isWaiting) {
    await notify({
      targetRoles: ['billing', 'admin'],
      type: 'error',
      urgent: true,
      title: '🧾 Ready for Billing!',
      message: `Order ${order.orderNumber} (${order.customerName}) dispatched — generate bill now`,
      link: `/billing`,
      orderId: String(order._id),
    });
  }

  res.status(201).json(dispatch);
});

// GET /api/dispatch/unverified - dispatches waiting for final check
router.get('/unverified', async (req: AuthRequest, res: Response) => {
  const dispatches = await Dispatch.find({ isVerified: false })
    .sort({ dispatchedAt: -1 })
    .lean();
  res.json(dispatches);
});

// PATCH /api/dispatch/:id/verify - submit final check
router.patch('/:id/verify', async (req: AuthRequest, res: Response) => {
  const { items } = req.body; // array of { productId, checkedQtyInner, checkedQtyPcs, totalCheckedPcs }
  const dispatch = await Dispatch.findById(req.params.id);
  if (!dispatch) return res.status(404).json({ message: 'Dispatch not found' });

  dispatch.items = dispatch.items.map(di => {
    const verified = items.find((v: any) => String(v.productId) === String(di.productId));
    if (verified) {
      di.checkedQtyInner = verified.checkedQtyInner;
      di.checkedQtyPcs = verified.checkedQtyPcs;
      di.totalCheckedPcs = verified.totalCheckedPcs;
    }
    return di;
  });

  dispatch.isVerified = true;
  dispatch.verifiedBy = req.user?._id;
  dispatch.verifiedByName = req.user?.name;
  dispatch.verifiedAt = new Date();

  await dispatch.save();
  res.json({ message: 'Dispatch verified successfully', dispatch });
});

// GET /api/dispatch/:id - get single dispatch by id (must be LAST to avoid shadowing named routes)
router.get('/:id', async (req: AuthRequest, res: Response) => {
  const dispatch = await Dispatch.findById(req.params.id).lean();
  if (!dispatch) return res.status(404).json({ message: 'Dispatch not found' });
  res.json(dispatch);
});

export default router;
