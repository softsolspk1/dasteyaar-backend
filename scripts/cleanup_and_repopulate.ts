import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import path from 'path';

// Import models
import City from '../src/models/City';
import Distributor from '../src/models/Distributor';
import Patient from '../src/models/Patient';
import Doctor from '../src/models/Doctor';

dotenv.config();

const DISTRIBUTOR_DATA = [
  { city: 'Multan', distributors: ["PATIENT'S CARE", "PillBox"] },
  { city: 'PESHAWER', distributors: ["HAFIZ TRADERS - PESHAWAR"] },
  { city: 'Islamabad', distributors: ["Q - MED PHARMA DISTRIBUTION - RAWALPINDI", "IMPRESSIVE PHARMA (MM PHARMACY)"] },
  { city: 'KARACHI', distributors: ["EXPRESS PHARMA - KARACHI", "MARYSOL PHARMA KARACHI", "SM Karachi", "PillBox"] },
  { city: 'LAHORE', distributors: ["Onco Health Pharma", "Al- Khair Distributors", "DYNAMIC PHARMA LAHORE", "PillBox"] },
  { city: 'RAWALPINDI', distributors: ["ZAIDI TARDERS RAWALPINDI", "GODUC PHARMA"] },
  { city: 'Quetta', distributors: ["AL REHMAT QUETTA"] },
  { city: 'Fasialabad', distributors: ["AL MAKA DISTRIBUTION"] },
  { city: 'Gujranwala', distributors: ["PUBLIC PATIENT CARE"] },
  { city: 'Sukkur', distributors: ["JAFFAR MEDICAL STORE"] },
  { city: 'Larakana', distributors: ["NEW ISLAM MEDICAL STORE"] }
];

async function run() {
  try {
    const mongoURI = process.env.MONGODB_URI;
    if (!mongoURI) throw new Error('MONGODB_URI not found');

    console.log('Connecting to database...');
    await mongoose.connect(mongoURI);

    console.log('Deleting existing records...');
    const patientResult = await Patient.deleteMany({});
    const doctorResult = await Doctor.deleteMany({});
    const cityResult = await City.deleteMany({});
    const distributorResult = await Distributor.deleteMany({});
    console.log(`Deleted: ${patientResult.deletedCount} Patients, ${doctorResult.deletedCount} Doctors, ${cityResult.deletedCount} Cities, ${distributorResult.deletedCount} Distributors`);

    const hashedPassword = await bcrypt.hash('Dist123!', 10);

    for (const item of DISTRIBUTOR_DATA) {
      console.log(`Processing city: ${item.city}`);
      
      // Find or create city
      let city = await City.findOne({ name: { $regex: new RegExp(`^${item.city}$`, 'i') } });
      
      const hasPillBox = item.distributors.some(d => d.toLowerCase() === 'pillbox');
      
      if (!city) {
        city = await City.create({
          name: item.city,
          distributor_channel: hasPillBox ? 'pillbox' : 'other',
          distributor_ids: [],
          status: 'active'
        });
      } else {
        city.distributor_channel = hasPillBox ? 'pillbox' : 'other';
        city.distributor_ids = [];
        await city.save();
      }

      const createdDistributorIds = [];

      for (const distName of item.distributors) {
        if (distName.toLowerCase() === 'pillbox') continue; // Don't create distributor record for PillBox (Shopify)

        const email = `${distName.toLowerCase().replace(/[^a-z0-9]/g, '')}@dasteyaar.com`;
        
        // Check if distributor email already exists (just in case)
        let distributor = await Distributor.findOne({ email });
        
        if (!distributor) {
          distributor = await Distributor.create({
            name: distName,
            email,
            password: hashedPassword,
            phone: '0000-0000000',
            city_id: city._id,
            status: 'active'
          });
          console.log(`  - Created distributor: ${distName}`);
        } else {
          distributor.city_id = city._id;
          await distributor.save();
          console.log(`  - Updated distributor: ${distName}`);
        }
        
        createdDistributorIds.push(distributor._id);
      }

      // Update city with distributor IDs
      city.distributor_ids = createdDistributorIds;
      await city.save();
    }

    console.log('Database update completed successfully.');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

run();
