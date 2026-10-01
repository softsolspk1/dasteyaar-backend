/**
 * GreenAPI Integration Test Script
 *
 * Usage: npx ts-node src/tests/greenapi.test.ts
 *
 * This script tests:
 * 1. GreenAPI connection
 * 2. WhatsApp message formatting
 * 3. Message sending to a test phone number
 */

import dotenv from 'dotenv';
// Load environment variables
dotenv.config();

import greenApiService from '../services/greenApiService';
import logger from '../config/logger';


async function runTests() {
  console.log('🚀 Starting GreenAPI Integration Tests...\n');

  try {
    // Test 1: Check connection
    console.log('📡 Test 1: Checking GreenAPI Connection...');
    const connectionOk = await greenApiService.testConnection();
    if (connectionOk) {
      console.log('✅ GreenAPI connection successful!\n');
    } else {
      console.log('❌ GreenAPI connection failed!\n');
    }

    // Test 2: Send test message for CinnoRA
    console.log('📱 Test 2: Sending Test WhatsApp Message (CinnoRA)...');

    // Use your phone number for testing (923248855666)
    const testResult = await greenApiService.sendPrescriptionMessage({
      patientName: 'Ahmed Hassan',
      patientPhone: '923248855666', // Your phone number for testing
      mrn: 'MRN-202501-000001',
      doctorName: 'Dr. Muhammad Ali',
      productName: 'CinnoRA',
    });

    // Test 3: Send test message for Cinnopar
    console.log('\n�� Test 3: Sending Test WhatsApp Message (Cinnopar)...');
    const testResult2 = await greenApiService.sendPrescriptionMessage({
      patientName: 'Fatima Khan',
      patientPhone: '923248855666', // Your phone number for testing
      mrn: 'MRN-202501-000002',
      doctorName: 'Dr. Sarah Ahmed',
      productName: 'Cinnopar',
    });

    if (testResult) {
      console.log('✅ CinnoRA test message sent successfully!');
    } else {
      console.log('❌ Failed to send CinnoRA test message');
    }

    if (testResult2) {
      console.log('✅ Cinnopar test message sent successfully!');
    } else {
      console.log('❌ Failed to send Cinnopar test message');
    }

    console.log('\n📲 Check your WhatsApp on +923248855666\n');

    if (testResult && testResult2) {
      console.log('✅ All tests completed successfully!');
      process.exit(0);
    } else {
      console.log('⚠️ Some tests failed');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Test error:', error);
    process.exit(1);
  }
}

runTests();

