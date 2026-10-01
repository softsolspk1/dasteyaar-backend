import express, { Response } from 'express';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import { authenticateDoctor, AuthRequest } from '../middleware/auth';
import { authenticateAdmin, AdminAuthRequest } from '../middleware/adminAuth';
import Doctor from '../models/Doctor';
import Prescription from '../models/Prescription';
import Order from '../models/Order';
import cloudinary from '../config/cloudinary';

const router = express.Router();

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG and PNG are allowed.'));
    }
  },
});

// Get current doctor profile
router.get('/me', authenticateDoctor, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const doctor = await Doctor.findById(req.doctor!.id)
      .select('-password')
      .populate('district_id', 'name code')
      .populate('kam_id', 'name email');

    if (!doctor) {
      res.status(404).json({
        success: false,
        error: {
          code: 'DOCTOR_NOT_FOUND',
          message: 'Doctor not found',
        },
      });
      return;
    }

    res.json({
      success: true,
      data: doctor,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to fetch doctor profile',
      },
    });
  }
});

// Update doctor profile
router.put('/me', authenticateDoctor, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name, phone, specialty } = req.body;

    const updateData: any = {};
    if (name) updateData.name = name;
    if (phone) updateData.phone = phone;
    if (specialty) updateData.specialty = specialty;

    const doctor = await Doctor.findByIdAndUpdate(
      req.doctor!.id,
      updateData,
      { new: true }
    ).select('-password');

    res.json({
      success: true,
      data: doctor,
      message: 'Profile updated successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to update profile',
      },
    });
  }
});

// Change doctor password
// Update profile photo
router.put('/me/photo', authenticateDoctor, upload.single('photo'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const file = req.file;

    if (!file) {
      res.status(400).json({
        success: false,
        error: {
          code: 'NO_FILE',
          message: 'No photo file provided',
        },
      });
      return;
    }

    // Upload to Cloudinary
    const uploadResult = await new Promise<string>((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: `${process.env.CLOUDINARY_FOLDER || 'DastEYaar'}/profile-photos`,
          resource_type: 'image',
          transformation: [
            { width: 500, height: 500, crop: 'fill', gravity: 'face' },
            { quality: 'auto' }
          ],
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result!.secure_url);
        }
      );
      uploadStream.end(file.buffer);
    });

    // Update doctor profile with photo URL
    await Doctor.findByIdAndUpdate(req.doctor!.id, {
      profile_photo: uploadResult,
    });

    res.json({
      success: true,
      data: {
        profile_photo: uploadResult,
      },
      message: 'Profile photo updated successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to update profile photo',
      },
    });
  }
});

router.put('/me/password', authenticateDoctor, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { newPassword } = req.body;

    if (!newPassword) {
      res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_FIELDS',
          message: 'New password is required',
        },
      });
      return;
    }

    if (newPassword.length < 6) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_PASSWORD',
          message: 'Password must be at least 6 characters',
        },
      });
      return;
    }

    // Hash the new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update the password
    await Doctor.findByIdAndUpdate(req.doctor!.id, {
      password: hashedPassword,
    });

    res.json({
      success: true,
      message: 'Password changed successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to change password',
      },
    });
  }
});

// Get doctor's prescriptions
router.get('/me/prescriptions', authenticateDoctor, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { page = 1, limit = 20, status, patient_id } = req.query;

    const query: any = { doctor_id: req.doctor!.id };
    if (status) {
      query.order_status = status;
    }
    if (patient_id) {
      query.patient_id = patient_id;
    }

    const prescriptions = await Prescription.find(query)
      .populate('patient_id', 'mrn name phone')
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit));

    const total = await Prescription.countDocuments(query);

    res.json({
      success: true,
      data: {
        prescriptions,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit)),
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to fetch prescriptions',
      },
    });
  }
});

// Get doctor's orders
router.get('/me/orders', authenticateDoctor, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { page = 1, limit = 20, status } = req.query;

    const query: any = { 'doctor_info.doctor_id': req.doctor!.id };
    if (status) {
      query.order_status = status;
    }

    const orders = await Order.find(query)
      .populate('prescription_id')
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit));

    const total = await Order.countDocuments(query);

    res.json({
      success: true,
      data: {
        orders,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit)),
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to fetch orders',
      },
    });
  }
});


// Get all doctors (Admin only)
router.get('/', authenticateAdmin, async (req: AdminAuthRequest, res: Response): Promise<void> => {
  try {
    const { page = 1, limit = 20, search, district_id, status } = req.query;
    
    const query: any = {};
    
    if (status) {
      query.status = status;
    }
    
    if (district_id) {
      query.district_id = district_id;
    }

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
      ];
    }

    const doctors = await Doctor.find(query)
      .select('-password')
      .populate('district_id', 'name code')
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit));

    const total = await Doctor.countDocuments(query);

    res.json({
      success: true,
      data: {
        doctors,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit)),
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to fetch doctors',
      },
    });
  }
});

export default router;
