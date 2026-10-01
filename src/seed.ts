import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import District from './models/District';
import User from './models/User';
import Doctor from './models/Doctor';
import Product from './models/Product';
import DistrictProduct from './models/DistrictProduct';

dotenv.config();

const seedData = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI!);
    // Clear existing data
    await District.deleteMany({});
    await User.deleteMany({});
    await Doctor.deleteMany({});
    await Product.deleteMany({});
    await DistrictProduct.deleteMany({});
    // Create Super Admin
    const hashedAdminPassword = await bcrypt.hash('admin123', 10);
    const superAdmin = await User.create({
      email: 'admin@dasteyaar.com',
      password: hashedAdminPassword,
      name: 'Super Administrator',
      role: 'super_admin',
      assigned_districts: [],
      status: 'active',
    });
    // Create District
    const district = await District.create({
      name: 'Gulberg',
      code: 'LHE-GLB',
      kam_id: superAdmin._id, // Temporary, will create KAM next
      status: 'active',
    });
    // Create KAM
    const hashedKamPassword = await bcrypt.hash('kam123', 10);
    const kam = await User.create({
      email: 'kam@dasteyaar.com',
      password: hashedKamPassword,
      name: 'Ahmed Hassan',
      role: 'kam',
      assigned_districts: [district._id],
      status: 'active',
    });
    // Update district with KAM
    district.kam_id = kam._id as any;
    await district.save();

    // Create Test Doctor
    const hashedDoctorPassword = await bcrypt.hash('doctor123', 10);
    const doctor = await Doctor.create({
      email: 'doctor@dasteyaar.com',
      password: hashedDoctorPassword,
      name: 'Dr. Ali Hussain',
      phone: '+92-300-1234567',
      district_id: district._id,
      kam_id: kam._id,
      pmdc_number: '12345-A',
      specialty: 'General Physician',
      status: 'active',
    });
    // Create Demo Doctor for Testing
    const hashedDemoPassword = await bcrypt.hash('Hello123', 10);
    const demoDoctor = await Doctor.create({
      email: 'doctor@test.com',
      password: hashedDemoPassword,
      name: 'Dr. Sarah Ahmed',
      phone: '+92-321-9876543',
      district_id: district._id,
      kam_id: kam._id,
      pmdc_number: '67890-B',
      specialty: 'Cardiologist',
      status: 'active',
    });
    // Create Products
    const products = await Product.insertMany([
      {
        name: '2Sum Im/Iv Injection 1G',
        sku: 'SAMI-2SUM-1G',
        description: 'Cefoperazone, Salbactam - Used For Bacterial Infection',
        price: 437.00,
        shopify_product_id: '8735268176108',
        status: 'active',
      },
      {
        name: 'A-Glip Tablets 100MG 14\'S',
        sku: 'ATCO-AGLIP-100',
        description: 'Sitagliptin - Used For Diabetes',
        price: 589.00,
        shopify_product_id: '8976855073004',
        status: 'active',
      },
      {
        name: 'A-Glip Tablets 50MG 14\'S',
        sku: 'ATCO-AGLIP-50',
        description: 'Sitagliptin - Used For Diabetes',
        price: 437.00,
        shopify_product_id: '8976791830764',
        status: 'active',
      },
    ]);
    // Assign Products to District
    for (const product of products) {
      await DistrictProduct.create({
        district_id: district._id,
        product_id: product._id,
        assigned_at: new Date(),
        assigned_by: superAdmin._id,
        status: 'active',
      });
    }
    process.exit(0);
  } catch (error) {
    process.exit(1);
  }
};

seedData();
