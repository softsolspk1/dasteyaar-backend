const mongoose = require('mongoose');
require('dotenv').config();
const { createOrderWithoutShopify } = require('./src/services/orderService');
const Prescription = require('./src/models/Prescription').default;
const Patient = require('./src/models/Patient').default;
const Doctor = require('./src/models/Doctor').default;

async function check() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Connected");
  
  const prescription = await Prescription.findOne({ shopify_order_id: { $exists: false } }).sort({createdAt: -1});
  if (!prescription) {
    console.log("No prescription without order found");
    process.exit(0);
  }
  console.log("Found prescription:", prescription._id);
  
  const patient = await Patient.findById(prescription.patient_id);
  const doctor = await Doctor.findById(prescription.doctor_id);
  
  try {
    const order = await createOrderWithoutShopify({
      prescription,
      patient,
      doctor,
      city: null
    });
    console.log("Order created successfully!", order._id);
  } catch (err) {
    console.log("Order creation failed:");
    console.error(err);
  }
  
  await mongoose.disconnect();
  process.exit(0);
}
check();
