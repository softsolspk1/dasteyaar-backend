import mongoose from 'mongoose';
import dotenv from 'dotenv';
import fs from 'fs';
import User from '../src/models/User';
import Doctor from '../src/models/Doctor';
import Distributor from '../src/models/Distributor';

dotenv.config();

async function generateCSV() {
  try {
    await mongoose.connect(process.env.MONGODB_URI!);
    
    const users = await User.find({}, 'name email role').lean();
    const doctors = await Doctor.find({}, 'name email').lean();
    const distributors = await Distributor.find({}, 'name email').lean();

    let csvContent = 'Type,Name,Email,Default Password\n';

    // KAMs/Admins
    users.forEach(u => {
      const password = u.role === 'kam' ? 'Kam123!' : '(Hashed/Unknown)';
      csvContent += `System User (${u.role}),"${u.name}",${u.email},${password}\n`;
    });

    // Doctors
    doctors.forEach(d => {
      csvContent += `Doctor,"${d.name}",${d.email},Doctor123!\n`;
    });

    // Distributors
    distributors.forEach(dist => {
      csvContent += `Distributor,"${dist.name}",${dist.email},Dist123!\n`;
    });

    fs.writeFileSync('../../all_credentials.csv', csvContent);
    console.log('CSV generated: all_credentials.csv');

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

generateCSV();
