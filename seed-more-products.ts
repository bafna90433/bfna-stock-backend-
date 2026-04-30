import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import Product from './src/models/Product';
import Stock from './src/models/Stock';

const moreProducts = [
  { name: 'Dancing Robot Toy', sku: 'TOY-RC-011', category: 'Vehicles', price: 1800, qty: 25 },
  { name: 'Magnetic Building Tiles', sku: 'TOY-BL-012', category: 'Educational', price: 2200, qty: 40 },
  { name: 'Kids Digital Camera', sku: 'TOY-EL-013', category: 'Electronics', price: 3500, qty: 15 },
  { name: 'Glow in the Dark Slime', sku: 'TOY-OT-014', category: 'Outdoor', price: 200, qty: 100 },
  { name: 'Kitchen Play Set', sku: 'TOY-RP-015', category: 'Roleplay', price: 2800, qty: 20 },
  { name: 'Doctor Play Set', sku: 'TOY-RP-016', category: 'Roleplay', price: 1200, qty: 50 },
  { name: 'Foam Dart Blaster', sku: 'TOY-OT-017', category: 'Outdoor', price: 1500, qty: 35 },
  { name: 'Mini Basketball Hoop', sku: 'TOY-SP-018', category: 'Sports', price: 900, qty: 60 },
  { name: 'Remote Control Drone', sku: 'TOY-RC-019', category: 'Vehicles', price: 4500, qty: 10 },
  { name: 'Scientific Microscope Kit', sku: 'TOY-ED-020', category: 'Educational', price: 3200, qty: 15 }
];

async function seedMoreProducts() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI as string);
    console.log('Connected!');

    for (const item of moreProducts) {
      console.log(`Processing ${item.name}...`);
      
      const existing = await Product.findOne({ sku: item.sku });
      if (existing) {
        console.log(`SKU ${item.sku} already exists, skipping.`);
        continue;
      }

      const product = await Product.create({
        name: item.name,
        sku: item.sku,
        category: item.category,
        unit: 'pcs',
        pricePerUnit: item.price,
        gstRate: 18,
        description: `Premium quality ${item.name} for kids.`,
        imageUrl: 'https://ik.imagekit.io/rishii/placeholder-product.png', // Using a placeholder
        imageFileId: '',
        isActive: true
      });

      await Stock.create({
        productId: product._id,
        availableQty: item.qty,
        totalInward: item.qty,
        totalOutward: 0,
        reservedQty: 0
      });

      console.log(`Successfully added ${item.name} with stock ${item.qty}`);
    }

    console.log('Additional seeding completed!');
    process.exit(0);
  } catch (error: any) {
    console.error('Seeding failed:', error.message);
    process.exit(1);
  }
}

seedMoreProducts();
