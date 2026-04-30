import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import Product from './src/models/Product';
import Stock from './src/models/Stock';
import { uploadToImageKit } from './src/utils/imagekit';

const toys = [
  { name: 'Remote Control Race Car', sku: 'TOY-RC-001', category: 'Vehicles', price: 1200, qty: 50, imagePath: 'remote_control_car_1777175616223.png' },
  { name: 'Fluffy Teddy Bear', sku: 'TOY-PL-002', category: 'Soft Toys', price: 800, qty: 100, imagePath: 'teddy_bear_1777175631396.png' },
  { name: 'Lego Building Blocks Set', sku: 'TOY-BL-003', category: 'Educational', price: 2500, qty: 30, imagePath: 'lego_blocks_1777175646709.png' },
  { name: 'Superhero Action Figure', sku: 'TOY-AF-004', category: 'Action Figures', price: 600, qty: 75, imagePath: 'action_figure_1777175667011.png' },
  { name: 'Rubiks Cube', sku: 'TOY-PZ-005', category: 'Puzzles', price: 300, qty: 150, imagePath: 'rubiks_cube_1777175681831.png' },
  { name: 'Barbie Fashion Doll', sku: 'TOY-DL-006', category: 'Dolls', price: 900, qty: 60, imagePath: 'barbie_doll_1777175696247.png' },
  { name: 'Wooden Toy Train Set', sku: 'TOY-TR-007', category: 'Vehicles', price: 1500, qty: 40, imagePath: 'toy_train_1777175720205.png' },
  { name: 'Colorful Water Gun', sku: 'TOY-WG-008', category: 'Outdoor', price: 400, qty: 200, imagePath: 'water_gun_1777175737390.png' },
  { name: 'Classic Wooden Yo-Yo', sku: 'TOY-YY-009', category: 'Classic', price: 150, qty: 300, imagePath: 'yo_yo_1777175752132.png' },
  { name: 'Kids Puzzle Board', sku: 'TOY-PZ-010', category: 'Educational', price: 500, qty: 80, imagePath: 'puzzle_board_1777175776437.png' }
];

async function seedToys() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI as string);
    console.log('Connected!');

    const baseImagePath = 'C:\\Users\\bafna\\.gemini\\antigravity\\brain\\13f8195c-ce3f-46dc-acae-72be5b4fa82c';

    for (const toy of toys) {
      console.log(`Processing ${toy.name}...`);
      
      const existing = await Product.findOne({ sku: toy.sku });
      if (existing) {
        console.log(`SKU ${toy.sku} already exists, skipping.`);
        continue;
      }

      let imageUrl = '';
      let imageFileId = '';

      const fullImagePath = path.join(baseImagePath, toy.imagePath);
      if (fs.existsSync(fullImagePath)) {
        const imageBuffer = fs.readFileSync(fullImagePath);
        console.log(`Uploading image for ${toy.name}...`);
        const uploadResult = await uploadToImageKit(imageBuffer, `${toy.sku}-${Date.now()}`, '/stock-management/products');
        imageUrl = uploadResult.url;
        imageFileId = uploadResult.fileId;
      } else {
        console.log(`Image not found at ${fullImagePath}, skipping image upload for ${toy.name}`);
      }

      const product = await Product.create({
        name: toy.name,
        sku: toy.sku,
        category: toy.category,
        unit: 'pcs',
        pricePerUnit: toy.price,
        gstRate: 18,
        description: `High quality ${toy.name}`,
        imageUrl,
        imageFileId,
        isActive: true
      });

      await Stock.create({
        productId: product._id,
        availableQty: toy.qty,
        totalInward: toy.qty,
        totalOutward: 0,
        reservedQty: 0
      });

      console.log(`Successfully added ${toy.name} with stock ${toy.qty}`);
    }

    console.log('Seeding completed!');
    process.exit(0);
  } catch (error: any) {
    console.error('Seeding failed:', error.message);
    process.exit(1);
  }
}

seedToys();
