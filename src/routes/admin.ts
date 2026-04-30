import { Router, Response } from 'express';
import User from '../models/User';
import { protect, requireRole, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(protect);
router.use(requireRole('admin'));

// GET /api/admin/users
router.get('/users', async (req: AuthRequest, res: Response) => {
  const users = await User.find().select('-password').sort({ createdAt: -1 });
  res.json(users);
});

// POST /api/admin/users
router.post('/users', async (req: AuthRequest, res: Response) => {
  const { name, username, password, role } = req.body;
  const existing = await User.findOne({ username: username?.toLowerCase() });
  if (existing) return res.status(400).json({ message: 'Username already exists' });
  const user = await User.create({ name, username, password, role });
  res.status(201).json({ _id: user._id, name: user.name, username: user.username, role: user.role });
});

// PUT /api/admin/users/:id
router.put('/users/:id', async (req: AuthRequest, res: Response) => {
  const { name, role, isActive, password } = req.body;
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ message: 'User not found' });
  if (name) user.name = name;
  if (role) user.role = role;
  if (typeof isActive === 'boolean') user.isActive = isActive;
  if (password) user.password = password;
  await user.save();
  res.json({ _id: user._id, name: user.name, username: user.username, role: user.role, isActive: user.isActive });
});

// DELETE /api/admin/users/:id
router.delete('/users/:id', async (req: AuthRequest, res: Response) => {
  await User.findByIdAndDelete(req.params.id);
  res.json({ message: 'User deleted' });
});

export default router;
