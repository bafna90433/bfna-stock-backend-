import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User';

const router = Router();

const signToken = (id: string) =>
  jwt.sign({ id }, process.env.JWT_SECRET as string, { expiresIn: '7d' });

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ message: 'Username and password required' });

  const user = await User.findOne({ username: username.toLowerCase() });
  if (!user || !user.isActive)
    return res.status(401).json({ message: 'Invalid credentials' });

  const isMatch = await user.comparePassword(password);
  if (!isMatch)
    return res.status(401).json({ message: 'Invalid credentials' });

  const token = signToken(String(user._id));
  res.json({
    token,
    user: { _id: user._id, name: user.name, username: user.username, role: user.role },
  });
});

// GET /api/auth/me
import { protect, AuthRequest } from '../middleware/auth';
router.get('/me', protect, async (req: AuthRequest, res: Response) => {
  res.json(req.user);
});

export default router;
