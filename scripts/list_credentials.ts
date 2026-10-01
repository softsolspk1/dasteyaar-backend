import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../src/models/User';
import Doctor from '../src/models/Doctor';
import Distributor from '../src/models/Distributor';

dotenv.config();

async function listUsers() {
  try {
    await mongoose.connect(process.env.MONGODB_URI!);
    
    const users = await User.find({}, 'name email role').lean();
    const doctors = await Doctor.find({}, 'name email').lean();
    const distributors = await Distributor.find({}, 'name email').lean();

    console.log('--- SYSTEM USERS (KAMs/Admins) ---');
    console.log(JSON.stringify(users, null, 2));
    
    console.log('--- DOCTORS ---');
    console.log(JSON.stringify(doctors.map(d => ({ name: d.name, email: d.email })), null, 2));

    console.log('--- DISTRIBUTORS ---');
    console.log(JSON.stringify(distributors.map(d => ({ name: d.name, email: d.email })), null, 2));

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

listUsers();
