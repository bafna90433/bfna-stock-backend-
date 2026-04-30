import { Router, Response } from 'express';
import Notification from '../models/Notification';
import { protect, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(protect);

// GET /api/notifications — fetch for current user's role
router.get('/', async (req: AuthRequest, res: Response) => {
  const role = req.user?.role;
  const userId = String(req.user?._id);
  const notifications = await Notification.find({
    targetRoles: role,
    createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }, // last 7 days
  }).sort({ createdAt: -1 }).limit(50).lean();

  const mapped = notifications.map(n => ({
    ...n,
    read: n.readBy.includes(userId),
  }));
  res.json(mapped);
});

// PATCH /api/notifications/:id/read
router.patch('/:id/read', async (req: AuthRequest, res: Response) => {
  const userId = String(req.user?._id);
  await Notification.findByIdAndUpdate(req.params.id, {
    $addToSet: { readBy: userId },
  });
  res.json({ ok: true });
});

// PATCH /api/notifications/read-all
router.patch('/read-all/mark', async (req: AuthRequest, res: Response) => {
  const role = req.user?.role;
  const userId = String(req.user?._id);
  await Notification.updateMany(
    { targetRoles: role, readBy: { $ne: userId } },
    { $addToSet: { readBy: userId } }
  );
  res.json({ ok: true });
});

export default router;
