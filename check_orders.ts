import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
import { createOrderWithoutShopify } from './src/services/orderService';
import Prescription from './src/models/Prescription';
import Patient from './src/models/Patient';
import Doctor from './src/models/Doctor';

async function check() {
  await mongoose.connect(process.env.MONGODB_URI as string);
  console.log("Connected to DB, looking for missing orders...");
  
  const prescriptions = await Prescription.find({ shopify_order_id: { $exists: false } });
  console.log(`Found ${prescriptions.length} prescriptions without orders.`);
  
  for (const prescription of prescriptions) {
    console.log(`Fixing prescription: ${prescription._id}`);
    const patient = await Patient.findById(prescription.patient_id);
    const doctor = await Doctor.findById(prescription.doctor_id);
    
    if (!patient || !doctor) {
      console.log(`Missing patient or doctor for ${prescription._id}, skipping.`);
      continue;
    }
    
    try {
      const order = await createOrderWithoutShopify({
        prescription,
        patient,
        doctor,
        city: null
      });
      console.log(`Successfully created local fallback order ${order._id} for prescription ${prescription._id}`);
    } catch (err) {
      console.log(`Failed to create order for prescription ${prescription._id}:`, err);
    }
  }
  
  await mongoose.disconnect();
  process.exit(0);
}
check();
