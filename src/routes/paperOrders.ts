import { Router, Response } from 'express';
import multer from 'multer';
import PaperOrder from '../models/PaperOrder';
import { protect, AuthRequest } from '../middleware/auth';
import { uploadToImageKit } from '../utils/imagekit';

const router = Router();
router.use(protect);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// POST /api/paper-orders
router.post('/', upload.single('image'), async (req: AuthRequest, res: Response) => {
  const { customerName, notes } = req.body;
  
  if (!customerName) return res.status(400).json({ message: 'Customer name required' });
  if (!req.file) return res.status(400).json({ message: 'Paper order image required' });

  try {
    const result = await uploadToImageKit(req.file.buffer, `paper-order-${Date.now()}`, '/stock-management/paper-orders');
    
    const paperOrder = await PaperOrder.create({
      salesmanId: req.user?._id,
      salesmanName: req.user?.name,
      customerName,
      imageUrl: result.url,
      notes,
      status: 'pending'
    });

    res.status(201).json(paperOrder);
  } catch (error: any) {
    res.status(500).json({ message: 'Failed to upload image', error: error.message });
  }
});

// GET /api/paper-orders
router.get('/', async (req: AuthRequest, res: Response) => {
  const query: any = {};
  if (req.query.status) query.status = req.query.status;
  if (req.query.linkedOrderId) query.linkedOrderId = req.query.linkedOrderId;

  // If salesman, only see their own. Sale staff sees all.
  if (req.user?.role === 'salesman') {
    query.salesmanId = req.user._id;
  }

  const orders = await PaperOrder.find(query).sort({ createdAt: -1 });
  res.json(orders);
});

// GET /api/paper-orders/:id
router.get('/:id', async (req: AuthRequest, res: Response) => {
  const order = await PaperOrder.findById(req.params.id);
  if (!order) return res.status(404).json({ message: 'Paper order not found' });
  res.json(order);
});

// PUT /api/paper-orders/:id
router.put('/:id', async (req: AuthRequest, res: Response) => {
  const order = await PaperOrder.findById(req.params.id);
  if (!order) return res.status(404).json({ message: 'Paper order not found' });

  const { status, linkedOrderId } = req.body;
  if (status) order.status = status;
  if (linkedOrderId) order.linkedOrderId = linkedOrderId;

  await order.save();
  res.json(order);
});

// DELETE /api/paper-orders/:id
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  const order = await PaperOrder.findById(req.params.id);
  if (!order) return res.status(404).json({ message: 'Paper order not found' });

  // Permission: admin and sale_staff can delete any. Salesman can only delete own pending orders.
  const role = req.user?.role;
  const isOwner = String(order.salesmanId) === String(req.user?._id);

  if (role === 'salesman') {
    if (!isOwner) return res.status(403).json({ message: 'You can only delete your own paper orders' });
    if (order.status === 'processed') return res.status(400).json({ message: 'Cannot delete a processed paper order' });
  } else if (role !== 'admin' && role !== 'sale_staff') {
    return res.status(403).json({ message: 'Not authorized' });
  }

  await order.deleteOne();
  res.json({ message: 'Paper order deleted successfully' });
});

export default router;
