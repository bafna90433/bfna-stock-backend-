import { Router, Response } from 'express';
import { protect, AuthRequest } from '../middleware/auth';
import Product from '../models/Product';
import Stock from '../models/Stock';
import Order from '../models/Order';
import Dispatch from '../models/Dispatch';
import Bill from '../models/Bill';
import PaperOrder from '../models/PaperOrder';

const router = Router();
router.use(protect);

router.get('/stats', async (req: AuthRequest, res: Response) => {
  const role = req.user?.role;
  const userId = req.user?._id;

  try {
    if (role === 'admin') {
      const [total, pending, dispatched, billed, paid] = await Promise.all([
        Order.countDocuments(),
        Order.countDocuments({ status: { $in: ['pending', 'waiting', 'partial'] } }),
        Order.countDocuments({ status: 'dispatched' }),
        Order.countDocuments({ status: 'billed' }),
        Order.countDocuments({ status: 'paid' }),
      ]);
      const recentActivity = await Order.find().sort({ createdAt: -1 }).limit(5).lean();
      return res.json({ stats: { total, pending, dispatched, billed, paid }, recentActivity });
    }

    if (role === 'stock_manager') {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      const [totalProducts, outOfStock, lowStock, pendingAlerts] = await Promise.all([
        Product.countDocuments(),
        Stock.countDocuments({ availableQty: { $lte: 0 } }),
        Stock.countDocuments({ availableQty: { $gt: 0, $lte: 20 } }),
        Order.countDocuments({ 
          status: { $in: ['pending', 'waiting', 'partial'] },
          createdAt: { $lte: yesterday } 
        }),
      ]);
      const recentActivity = await Product.find().sort({ createdAt: -1 }).limit(5).lean();
      return res.json({ stats: { totalProducts, outOfStock, lowStock, pendingAlerts }, recentActivity });
    }

    if (role === 'salesman') {
      const [totalOrders, pendingOrders, completedOrders] = await Promise.all([
        Order.countDocuments({ salesmanId: userId }),
        Order.countDocuments({ salesmanId: userId, status: 'pending' }),
        Order.countDocuments({ salesmanId: userId, status: { $in: ['dispatched', 'billed', 'paid'] } }),
      ]);
      const recentActivity = await Order.find({ salesmanId: userId }).sort({ createdAt: -1 }).limit(5).lean();
      return res.json({ stats: { totalOrders, pendingOrders, completedOrders }, recentActivity });
    }

    if (role === 'dispatch') {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const [pendingDispatch, dispatchedToday, totalDispatches, unseenOrders] = await Promise.all([
        Order.countDocuments({ status: { $in: ['pending', 'partial', 'waiting'] } }),
        Dispatch.countDocuments({ dispatchedAt: { $gte: startOfDay } }),
        Dispatch.countDocuments(),
        Order.countDocuments({ dispatchSeen: false, status: { $in: ['pending', 'partial', 'waiting'] } }),
      ]);
      const recentActivity = await Dispatch.find().sort({ createdAt: -1 }).limit(5).lean();
      return res.json({ stats: { pendingDispatch, dispatchedToday, totalDispatches, unseenOrders }, recentActivity });
    }

    if (role === 'billing') {
      const [pendingBills, unpaidBills, paidAggregation] = await Promise.all([
        Order.countDocuments({ status: 'dispatched' }), // Orders fully ready to be billed
        Bill.countDocuments({ status: 'unpaid' }),
        Bill.aggregate([{ $match: { status: 'paid' } }, { $group: { _id: null, total: { $sum: '$totalAmount' } } }])
      ]);
      const totalCollected = paidAggregation[0]?.total || 0;
      const recentActivity = await Bill.find().sort({ createdAt: -1 }).limit(5).lean();
      return res.json({ stats: { pendingBills, unpaidBills, totalCollected }, recentActivity });
    }

    if (role === 'sale_staff') {
      const [total, pending, dispatched, paid, unseenDeliveries] = await Promise.all([
        Order.countDocuments(),
        Order.countDocuments({ status: { $in: ['pending', 'waiting', 'partial'] } }),
        Order.countDocuments({ status: 'dispatched' }),
        Order.countDocuments({ status: 'paid' }),
        Order.countDocuments({ deliverySeenByStaff: false }),
      ]);
      const recentActivity = await Order.find().sort({ createdAt: -1 }).limit(5).lean();
      return res.json({ stats: { total, pending, dispatched, paid, unseenDeliveries }, recentActivity });
    }

    return res.json({ stats: {}, recentActivity: [] });
  } catch (error: any) {
    res.status(500).json({ message: 'Error fetching dashboard stats', error: error.message });
  }
});

export default router;
