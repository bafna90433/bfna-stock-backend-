import { Router, Response } from 'express';
import Category from '../models/Category';
import { protect, requireRole, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(protect);

// GET /api/categories - get all active categories
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const categories = await Category.find({ isActive: true }).sort({ name: 1 });
    res.json(categories);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/categories/all - get all categories (including inactive) - admin/stock_manager only
router.get('/all', requireRole('admin', 'stock_manager'), async (req: AuthRequest, res: Response) => {
  try {
    const categories = await Category.find().sort({ createdAt: -1 });
    res.json(categories);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/categories - create new category
router.post('/', requireRole('admin', 'stock_manager'), async (req: AuthRequest, res: Response) => {
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ message: 'Category name is required' });

  try {
    const existing = await Category.findOne({ name: new RegExp(`^${name}$`, 'i') });
    if (existing) return res.status(400).json({ message: 'Category already exists' });

    const category = await Category.create({ name, description });
    res.status(201).json(category);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/categories/:id - update category
router.put('/:id', requireRole('admin', 'stock_manager'), async (req: AuthRequest, res: Response) => {
  const { name, description, isActive } = req.body;

  try {
    const category = await Category.findById(req.params.id);
    if (!category) return res.status(404).json({ message: 'Category not found' });

    if (name && name.trim() !== category.name) {
      // Allow case-only changes (KEYCHAIN → Keychain). Only block truly duplicate names.
      const existing = await Category.findOne({
        name: new RegExp(`^${name.trim()}$`, 'i'),
        _id: { $ne: req.params.id },
      });
      if (existing) return res.status(400).json({ message: 'Category name already exists' });
      category.name = name.trim();
    }

    if (description !== undefined) category.description = description;
    if (isActive !== undefined) category.isActive = isActive;

    await category.save();
    res.json(category);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/categories/:id - permanently delete category
router.delete('/:id', requireRole('admin', 'stock_manager'), async (req: AuthRequest, res: Response) => {
  try {
    const category = await Category.findByIdAndDelete(req.params.id);
    if (!category) return res.status(404).json({ message: 'Category not found' });
    res.json({ message: 'Category deleted successfully' });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
