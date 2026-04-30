import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import Product from './src/models/Product';
import { uploadToImageKit } from './src/utils/imagekit';

const imageMap: { [key: string]: string } = {
  'TOY-RC-011': 'dancing_robot_toy_v2_1777204662650.png',
  'TOY-BL-012': 'magnetic_building_tiles_v2_1777204677674.png',
  'TOY-EL-013': 'kids_digital_camera_v2_1777204695270.png',
  'TOY-OT-014': 'glow_slime_v2_1777204714927.png',
  'TOY-RP-015': 'kitchen_play_set_v2_1777204730334.png',
  'TOY-RP-016': 'doctor_play_set_v2_1777204746721.png',
  'TOY-OT-017': 'foam_blaster_v2_1777204766572.png',
  'TOY-SP-018': 'basketball_hoop_v2_1777204782858.png',
  'TOY-RC-019': 'rc_drone_v2_1777204797556.png',
  'TOY-ED-020': 'microscope_kit_v2_1777204811730.png',
};

async function uploadGeneratedImages() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI as string);
    console.log('Connected!');

    const baseDir = 'C:\\Users\\bafna\\.gemini\\antigravity\\brain\\4fc592b5-1b5a-4e17-85bc-20003bf0945c';

    for (const [sku, filename] of Object.entries(imageMap)) {
      const product = await Product.findOne({ sku });
      if (!product) {
        console.log(`Product with SKU ${sku} not found, skipping.`);
        continue;
      }

      const filePath = path.join(baseDir, filename);
      if (!fs.existsSync(filePath)) {
        console.log(`Image file ${filePath} not found, skipping.`);
        continue;
      }

      console.log(`Uploading image for ${product.name} (${sku})...`);
      const fileBuffer = fs.readFileSync(filePath);
      const uploadResult = await uploadToImageKit(fileBuffer, `${sku}-${Date.now()}`, '/stock-management/products');
      
      product.imageUrl = uploadResult.url;
      product.imageFileId = uploadResult.fileId;
      await product.save();

      console.log(`Successfully updated ${product.name} with URL: ${uploadResult.url}`);
    }

    console.log('Image upload and database update completed!');
    process.exit(0);
  } catch (error: any) {
    console.error('Upload failed:', error.message);
    process.exit(1);
  }
}

uploadGeneratedImages();
