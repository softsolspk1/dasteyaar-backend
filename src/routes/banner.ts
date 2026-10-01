import express from 'express';
import multer from 'multer';
import {
  getBanners,
  getActiveBanners,
  getBannerById,
  createBanner,
  updateBanner,
  deleteBanner,
} from '../controllers/bannerController';
import { authenticateAdmin } from '../middleware/adminAuth';
import { requireRole } from '../middleware/role';

const router = express.Router();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    // Check if file is an image
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  },
});

// Public routes (for mobile app)
router.get('/active', getActiveBanners); // Get only active banners for mobile app

// Protected routes (require admin authentication)
router.use(authenticateAdmin);

// Admin/KAM routes (require admin or KAM role)
router.get('/', requireRole(['super_admin', 'kam']), getBanners); // Get all banners (admin)
router.get('/:id', requireRole(['super_admin', 'kam']), getBannerById); // Get specific banner

// Super admin only routes
router.post('/', requireRole(['super_admin']), upload.single('image'), createBanner); // Create banner
router.put('/:id', requireRole(['super_admin']), upload.single('image'), updateBanner); // Update banner
router.delete('/:id', requireRole(['super_admin']), deleteBanner); // Delete banner

export default router;
