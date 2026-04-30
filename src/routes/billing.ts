import { Router, Response } from 'express';
import Bill from '../models/Bill';
import Order from '../models/Order';
import Dispatch from '../models/Dispatch';
import { protect, AuthRequest } from '../middleware/auth';
import { notify } from '../utils/notify';

const router = Router();
router.use(protect);

// GET /api/billing/dashboard-stats
router.get('/dashboard-stats', async (req: AuthRequest, res: Response) => {
  try {
    const [unpaidCount, readyOrdersCount, paidAggregation] = await Promise.all([
      Bill.countDocuments({ status: 'unpaid' }),
      Order.countDocuments({ status: 'dispatched', billInfo: { $exists: false } }),
      Bill.aggregate([{ $match: { status: 'paid' } }, { $group: { _id: null, total: { $sum: '$totalAmount' } } }])
    ]);
    const totalCollected = paidAggregation[0]?.total || 0;
    const recentBills = await Bill.find().sort({ createdAt: -1 }).limit(5).lean();
    
    // Fetch top 5 orders ready for billing (fully dispatched)
    const readyOrders = await Order.find({ status: 'dispatched', billInfo: { $exists: false } })
                                   .sort({ updatedAt: -1 })
                                   .limit(5)
                                   .lean();

    res.json({
      stats: { pendingBills: readyOrdersCount, unpaidBills: unpaidCount, totalCollected },
      recentBills,
      readyOrders
    });
  } catch (error: any) {
    res.status(500).json({ message: 'Error fetching billing stats', error: error.message });
  }
});

// GET /api/billing
router.get('/', async (req: AuthRequest, res: Response) => {
  const { paymentStatus, search } = req.query;
  const query: any = {};
  if (paymentStatus) query.paymentStatus = paymentStatus;
  if (search) query.$or = [
    { customerName: { $regex: search, $options: 'i' } },
    { billNumber: { $regex: search, $options: 'i' } },
    { orderNumber: { $regex: search, $options: 'i' } },
  ];
  const bills = await Bill.find(query).sort({ createdAt: -1 });
  res.json(bills);
});

// GET /api/billing/pending-summary
router.get('/pending-summary', async (req: AuthRequest, res: Response) => {
  const pendingBills = await Bill.find({ paymentStatus: { $in: ['pending', 'partial'] } });
  const totalPending = pendingBills.reduce((sum, b) => sum + b.balanceDue, 0);
  const byCustomer = pendingBills.reduce((acc: any, b) => {
    if (!acc[b.customerName]) acc[b.customerName] = { customerName: b.customerName, bills: [], totalDue: 0 };
    acc[b.customerName].bills.push(b);
    acc[b.customerName].totalDue += b.balanceDue;
    return acc;
  }, {});
  res.json({ totalPending, byCustomer: Object.values(byCustomer), count: pendingBills.length });
});

// GET /api/billing/:id
router.get('/:id', async (req: AuthRequest, res: Response) => {
  const bill = await Bill.findById(req.params.id);
  if (!bill) return res.status(404).json({ message: 'Bill not found' });
  res.json(bill);
});

// POST /api/billing - generate bill from dispatch
router.post('/', async (req: AuthRequest, res: Response) => {
  const { orderId, dispatchId } = req.body;

  const order = await Order.findById(orderId);
  if (!order) return res.status(404).json({ message: 'Order not found' });
  const dispatch = await Dispatch.findById(dispatchId);
  if (!dispatch) return res.status(404).json({ message: 'Dispatch not found' });

  // build bill items
  const billItems = dispatch.items
    .filter(i => i.qtyDispatched > 0)
    .map(i => {
      const orderItem = order.items.find(oi => String(oi.productId) === String(i.productId));
      const pricePerUnit = orderItem?.pricePerUnit || 0;
      const gstRate = orderItem?.gstRate || 18;
      const baseAmount = pricePerUnit * i.qtyDispatched;
      const gstAmount = (baseAmount * gstRate) / 100;
      return {
        productName: i.productName,
        sku: i.sku,
        unit: i.unit,
        qty: i.qtyDispatched,
        pricePerUnit,
        gstRate,
        gstAmount,
        totalAmount: baseAmount + gstAmount,
      };
    });

  const subtotal = billItems.reduce((s, i) => s + i.pricePerUnit * i.qty, 0);
  const totalGst = billItems.reduce((s, i) => s + i.gstAmount, 0);
  const totalAmount = subtotal + totalGst;

  const bill = await Bill.create({
    orderId,
    orderNumber: order.orderNumber,
    dispatchId,
    customerName: order.customerName,
    items: billItems,
    subtotal,
    totalGst,
    totalAmount,
    paidAmount: 0,
    balanceDue: totalAmount,
    paymentStatus: 'pending',
  });

  // update order status
  order.status = 'billed';
  order.history.push({
    action: `Bill Generated (₹${totalAmount})`,
    by: req.user?.name || 'System',
    role: req.user?.role || 'unknown'
  });
  await order.save();

  await notify({
    targetRoles: ['sale_staff', 'salesman', 'admin'],
    type: 'info',
    urgent: false,
    title: '🧾 Bill Generated',
    message: `Bill for ${order.customerName} — ₹${totalAmount.toFixed(2)} — Order ${order.orderNumber}`,
    link: `/billing/${bill._id}`,
    orderId: String(order._id),
  });

  res.status(201).json(bill);
});

// PATCH /api/billing/:id/payment - record payment
router.patch('/:id/payment', async (req: AuthRequest, res: Response) => {
  const { amount, method, note } = req.body;
  const bill = await Bill.findById(req.params.id);
  if (!bill) return res.status(404).json({ message: 'Bill not found' });

  bill.paidAmount += Number(amount);
  bill.balanceDue = Math.max(0, bill.totalAmount - bill.paidAmount);
  bill.paymentHistory.push({ amount: Number(amount), date: new Date(), method: method || 'cash', note: note || '' });
  bill.paymentStatus = bill.balanceDue === 0 ? 'paid' : bill.paidAmount > 0 ? 'partial' : 'pending';

  if (bill.paymentStatus === 'paid') {
    const order = await Order.findById(bill.orderId);
    if (order) {
      order.status = 'paid';
      order.history.push({
        action: `Payment Completed (₹${bill.totalAmount})`,
        by: req.user?.name || 'System',
        role: req.user?.role || 'unknown'
      });
      await order.save();
    }
  } else {
    const order = await Order.findById(bill.orderId);
    if (order) {
      order.history.push({
        action: `Partial Payment Recorded (₹${amount})`,
        by: req.user?.name || 'System',
        role: req.user?.role || 'unknown'
      });
      await order.save();
    }
  }

  await bill.save();

  await notify({
    targetRoles: ['billing', 'admin', 'sale_staff', 'salesman'],
    type: bill.paymentStatus === 'paid' ? 'success' : 'info',
    urgent: false,
    title: bill.paymentStatus === 'paid' ? '💰 Payment Complete!' : '💵 Partial Payment Received',
    message: `₹${Number(amount).toFixed(2)} received from ${bill.customerName} via ${method || 'cash'} — ${bill.billNumber}`,
    link: `/billing/${bill._id}`,
  });

  res.json(bill);
});

export default router;
