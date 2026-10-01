import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../src/models/User';
import District from '../src/models/District';

dotenv.config();

async function check() {
  try {
    console.log('Connecting to database...');
    await mongoose.connect(process.env.MONGODB_URI!);
    console.log('Connected.');

    const kams = await User.find({ role: 'kam' });
    const districts = await District.find({});

    console.log('KAMS_LIST:', JSON.stringify(kams.map(k => ({ id: k._id, name: k.name }))));
    console.log('DISTRICTS_LIST:', JSON.stringify(districts.map(d => ({ id: d._id, name: d.name }))));

    process.exit(0);
  } catch (err) {
    console.error('Error during check:', err);
    process.exit(1);
  }
}

check();
