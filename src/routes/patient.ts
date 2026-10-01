import express, { Response } from 'express';
import { authenticateDoctor, AuthRequest } from '../middleware/auth';
import Patient from '../models/Patient';
import { generateMRN } from '../utils/mrn';
import { validate } from '../middleware/validate';
import { createPatientSchema, updatePatientSchema, searchPatientSchema } from '../validators/patient.validator';

const router = express.Router();

// Create new patient
router.post('/', authenticateDoctor, validate(createPatientSchema), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name, phone, age, gender, city } = req.body;

    // Generate unique MRN with retry logic
    const mrn = await generateMRN();

    const patient = await Patient.create({
      mrn,
      name,
      phone,
      age,
      gender,
      city,
      created_by: req.doctor!.id,
    });

    res.status(201).json({
      success: true,
      data: patient,
      message: 'Patient created successfully',
    });
  } catch (error: any) {
    // Handle duplicate MRN error
    if (error.code === 11000 && error.keyPattern?.mrn) {
      res.status(409).json({
        success: false,
        error: {
          code: 'DUPLICATE_MRN',
          message: 'Failed to generate unique MRN. Please try again.',
        },
      });
      return;
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to create patient',
      },
    });
  }
});

// Search patients by phone or MRN
router.get('/', authenticateDoctor, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { search } = req.query;

    let patients;
    if (!search) {
      // If no search query, return all patients for this doctor
      patients = await Patient.find({
        created_by: req.doctor!.id,
      }).limit(50).sort({ createdAt: -1 });
    } else {
      patients = await Patient.find({
        $or: [
          { phone: { $regex: search, $options: 'i' } },
          { mrn: { $regex: search, $options: 'i' } },
        ],
        created_by: req.doctor!.id,
      }).limit(10);
    }

    res.json({
      success: true,
      data: patients,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to search patients',
      },
    });
  }
});

// Get patient by ID
router.get('/:id', authenticateDoctor, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const patient = await Patient.findOne({
      _id: req.params.id,
      created_by: req.doctor!.id,
    });

    if (!patient) {
      res.status(404).json({
        success: false,
        error: {
          code: 'PATIENT_NOT_FOUND',
          message: 'Patient not found',
        },
      });
      return;
    }

    res.json({
      success: true,
      data: patient,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to fetch patient',
      },
    });
  }
});

// Update patient
router.put('/:id', authenticateDoctor, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name, phone, age, gender, city } = req.body;

    const updateData: any = {};
    if (name) updateData.name = name;
    if (phone) updateData.phone = phone;
    if (age !== undefined) updateData.age = age;
    if (gender) updateData.gender = gender;
    if (city !== undefined) updateData.city = city;

    const patient = await Patient.findOneAndUpdate(
      { _id: req.params.id, created_by: req.doctor!.id },
      updateData,
      { new: true }
    );

    if (!patient) {
      res.status(404).json({
        success: false,
        error: {
          code: 'PATIENT_NOT_FOUND',
          message: 'Patient not found',
        },
      });
      return;
    }

    res.json({
      success: true,
      data: patient,
      message: 'Patient updated successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to update patient',
      },
    });
  }
});

export default router;

