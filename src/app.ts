import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import helmet from 'helmet';
import connectDB from './db';

import authRoutes from './routes/auth';
import adminRoutes from './routes/admin';
import productRoutes from './routes/products';
import orderRoutes from './routes/orders';
import dispatchRoutes from './routes/dispatch';
import billingRoutes from './routes/billing';
import categoryRoutes from './routes/categories';
import paperOrderRoutes from './routes/paperOrders';
import dashboardRoutes from './routes/dashboard';
import notificationRoutes from './routes/notifications';

// Seed admin user
import User from './models/User';

const app = express();

// Middleware
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(morgan('dev'));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/dispatch', dispatchRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/paper-orders', paperOrderRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/notifications', notificationRoutes);

// Health check
app.get('/health', (_, res) => res.json({ status: 'OK', timestamp: new Date().toISOString() }));

// Error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ message: err.message || 'Internal Server Error' });
});

const seedAdmin = async () => {
  const adminExists = await User.findOne({ username: 'admin' });
  if (!adminExists) {
    await User.create({
      name: 'Super Admin',
      username: 'admin',
      password: 'admin123',
      role: 'admin',
    });
    console.log('✅ Default admin created — username: admin, password: admin123');
  }
};

const PORT = process.env.PORT || 5000;

connectDB().then(async () => {
  await seedAdmin();
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  });
});
