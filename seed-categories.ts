import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Product from './src/models/Product';
import Category from './src/models/Category';

dotenv.config();

async function seedCategories() {
  try {
    console.log('Connecting to MongoDB...', process.env.MONGO_URI);
    await mongoose.connect(process.env.MONGO_URI as string);
    console.log('Connected!');

    const products = await Product.find().select('category');
    const uniqueCategories = [...new Set(products.map(p => p.category).filter(c => c))];

    for (const catName of uniqueCategories) {
      const exists = await Category.findOne({ name: new RegExp(`^${catName}$`, 'i') });
      if (!exists) {
        await Category.create({ name: catName, description: 'Auto-migrated category' });
        console.log(`Created category: ${catName}`);
      } else {
        console.log(`Category already exists: ${catName}`);
      }
    }

    // Add some default categories if not many exist
    const defaultCategories = ['General', 'Electronics', 'Spare Parts', 'Accessories', 'Toys'];
    for (const catName of defaultCategories) {
      const exists = await Category.findOne({ name: new RegExp(`^${catName}$`, 'i') });
      if (!exists) {
        await Category.create({ name: catName, description: 'Default category' });
        console.log(`Created default category: ${catName}`);
      }
    }

    console.log('Seeding completed!');
    process.exit(0);
  } catch (error: any) {
    console.error('Seeding failed:', error.message);
    process.exit(1);
  }
}

seedCategories();
