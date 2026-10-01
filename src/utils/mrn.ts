import Patient from '../models/Patient';

/**
 * Generate MRN (Medical Record Number)
 * Format: MRN-{YEAR}{MONTH}-{6-DIGIT-SEQUENTIAL}
 * Example: MRN-202501-000001
 *
 * Uses retry logic to handle race conditions and ensure uniqueness
 */
export const generateMRN = async (): Promise<string> => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const prefix = `MRN-${year}${month}-`;

  // Try up to 10 times to generate a unique MRN
  for (let attempt = 0; attempt < 10; attempt++) {
    // Get count of all patients to generate sequential number
    const count = await Patient.countDocuments();
    const sequential = String(count + 1 + attempt).padStart(6, '0');
    const mrn = `${prefix}${sequential}`;

    // Check if this MRN already exists
    const existing = await Patient.findOne({ mrn });
    if (!existing) {
      return mrn;
    }

    // If exists, increment and try again
  }

  // If all attempts fail, use timestamp to ensure uniqueness
  const timestamp = Date.now().toString().slice(-6);
  return `${prefix}${timestamp}`;
};
