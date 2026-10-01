import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import User from '../src/models/User';
import District from '../src/models/District';
import Team from '../src/models/Team';
import Doctor from '../src/models/Doctor';

dotenv.config();

import * as XLSX from 'xlsx';
import path from 'path';

async function run() {
  try {
    const mongoURI = process.env.MONGODB_URI;
    if (!mongoURI) throw new Error('MONGODB_URI not found');

    console.log('Connecting to database...');
    await mongoose.connect(mongoURI);
    console.log('Connected.');

    const filePath = path.join(__dirname, '../../doctor.xlsx');
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data: any[] = XLSX.utils.sheet_to_json(worksheet);

    console.log(`Found ${data.length} rows in Excel.`);

    const hashedDoctorPassword = await bcrypt.hash('Doctor123!', 10);
    const hashedKamPassword = await bcrypt.hash('Kam123!', 10);

    let docCount = 0;

    for (const row of data) {
      const kamName = row['KAM']?.trim() || 'Unknown KAM';
      const teamName = row['Team']?.trim() || 'Unknown Team';
      const cityName = row['City']?.trim() || 'Unknown City';
      const docName = row['Doctor Name']?.trim();
      const specialty = row['Specialty']?.trim() || 'GENERAL PHYSICIAN';

      if (!docName) continue;

      // 1. Find or create KAM
      let kam = await User.findOne({ 
        name: { $regex: new RegExp(`^${kamName}$`, 'i') },
        role: 'kam'
      });

      if (!kam) {
        const email = `${kamName.toLowerCase().replace(/[^a-z0-9]/g, '')}_${Math.floor(Math.random()*1000)}@dasteyaar.com`;
        kam = await User.create({
          name: kamName,
          email,
          password: hashedKamPassword,
          role: 'kam',
          status: 'active',
          assigned_districts: []
        });
        console.log(`  - Created KAM: ${kamName}`);
      }

      // 2. Find or create District (City)
      let district = await District.findOne({
        name: { $regex: new RegExp(`^${cityName}$`, 'i') }
      });

      if (!district) {
        district = await District.create({
          name: cityName,
          code: cityName.substring(0, 3).toUpperCase() + Math.floor(Math.random() * 100),
          kam_id: kam._id,
          status: 'active'
        });
        console.log(`  - Created District: ${cityName}`);
      }

      // 3. Find or create Team
      let team = await Team.findOne({
        name: { $regex: new RegExp(`^${teamName}$`, 'i') },
        district_id: district._id
      });

      if (!team) {
        team = await Team.create({
          name: teamName,
          district_id: district._id,
          status: 'active'
        });
        console.log(`  - Created Team: ${teamName} in ${cityName}`);
      }

      // 4. Create Doctor
      // Generate a somewhat unique email/pmdc since they aren't in excel
      const sanitizedName = docName.toLowerCase().replace(/[^a-z0-9]/g, '');
      const uniqueSuffix = Math.floor(Math.random() * 10000);
      const doctorEmail = `${sanitizedName}_${uniqueSuffix}@dasteyaar.com`;
      const pmdcNumber = `TBD-${uniqueSuffix}`;
      
      await Doctor.create({
        name: docName,
        email: doctorEmail,
        password: hashedDoctorPassword,
        phone: '0000-0000000',
        district_id: district._id,
        team_id: team._id,
        kam_id: kam._id,
        pmdc_number: pmdcNumber,
        specialty: specialty,
        status: 'active'
      });
      docCount++;
      if (docCount % 50 === 0) console.log(`Processed ${docCount} doctors...`);
    }

    console.log(`Doctor import completed. Total: ${docCount}`);
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

run();
