import { Request, Response } from 'express';
import Banner, { IBanner } from '../models/Banner';
import { v2 as cloudinary } from 'cloudinary';
import { uploadToCloudinary, deleteFromCloudinary } from '../utils/cloudinary';

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// GET /api/banners - Get all banners (admin) or active banners (mobile)
export const getBanners = async (req: Request, res: Response) => {
  try {
    const { active } = req.query;
    
    // For mobile app, only return active banners
    const query = active === 'true' ? { is_active: true } : {};
    
    const banners = await Banner.find(query)
      .sort({ order: 1, createdAt: -1 })
      .lean();

    res.json({
      success: true,
      data: {
        banners,
        total: banners.length,
      },
    });
  } catch (error: any) {
    console.error('Error fetching banners:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_BANNERS_ERROR',
        message: error.message || 'Failed to fetch banners',
      },
    });
  }
};

// GET /api/banners/active - Get only active banners (for mobile app)
export const getActiveBanners = async (req: Request, res: Response) => {
  try {
    const banners = await Banner.find({ is_active: true })
      .sort({ order: 1, createdAt: -1 })
      .lean();

    res.json({
      success: true,
      data: {
        banners,
        total: banners.length,
      },
    });
  } catch (error: any) {
    console.error('Error fetching active banners:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ACTIVE_BANNERS_ERROR',
        message: error.message || 'Failed to fetch active banners',
      },
    });
  }
};

// GET /api/banners/:id - Get specific banner
export const getBannerById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const banner = await Banner.findById(id).lean();
    
    if (!banner) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'BANNER_NOT_FOUND',
          message: 'Banner not found',
        },
      });
    }

    res.json({
      success: true,
      data: { banner },
    });
  } catch (error: any) {
    console.error('Error fetching banner:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_BANNER_ERROR',
        message: error.message || 'Failed to fetch banner',
      },
    });
  }
};

// POST /api/banners - Create new banner (admin only)
export const createBanner = async (req: Request, res: Response) => {
  try {
    const { title, description, order, is_active } = req.body;
    
    if (!title) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Title is required',
        },
      });
    }

    // Handle file upload
    let image_url = '';
    let cloudinary_id = '';

    if (req.file) {
      // Upload to Cloudinary
      const uploadResult = await uploadToCloudinary(req.file.buffer, 'DastEYaar/banners');
      image_url = uploadResult.secure_url;
      cloudinary_id = uploadResult.public_id;
    } else {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Image is required',
        },
      });
    }

    // Create banner
    const banner = await Banner.create({
      title,
      description,
      order: order || 0,
      is_active: is_active !== undefined ? is_active : true,
      image_url,
      cloudinary_id,
    });

    res.status(201).json({
      success: true,
      data: { banner },
      message: 'Banner created successfully',
    });
  } catch (error: any) {
    console.error('Error creating banner:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'CREATE_BANNER_ERROR',
        message: error.message || 'Failed to create banner',
      },
    });
  }
};

// PUT /api/banners/:id - Update banner (admin only)
export const updateBanner = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { title, description, order, is_active } = req.body;
    
    const banner = await Banner.findById(id);
    
    if (!banner) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'BANNER_NOT_FOUND',
          message: 'Banner not found',
        },
      });
    }

    // Handle new image upload if provided
    if (req.file) {
      // Delete old image from Cloudinary
      if (banner.cloudinary_id) {
        try {
          await deleteFromCloudinary(banner.cloudinary_id);
        } catch (error) {
          console.error('Error deleting old image:', error);
        }
      }

      // Upload new image
      const uploadResult = await uploadToCloudinary(req.file.buffer, 'DastEYaar/banners');
      banner.image_url = uploadResult.secure_url;
      banner.cloudinary_id = uploadResult.public_id;
    }

    // Update other fields
    if (title !== undefined) banner.title = title;
    if (description !== undefined) banner.description = description;
    if (order !== undefined) banner.order = order;
    if (is_active !== undefined) banner.is_active = is_active;

    await banner.save();

    res.json({
      success: true,
      data: { banner },
      message: 'Banner updated successfully',
    });
  } catch (error: any) {
    console.error('Error updating banner:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'UPDATE_BANNER_ERROR',
        message: error.message || 'Failed to update banner',
      },
    });
  }
};

// DELETE /api/banners/:id - Delete banner (admin only)
export const deleteBanner = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const banner = await Banner.findById(id);
    
    if (!banner) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'BANNER_NOT_FOUND',
          message: 'Banner not found',
        },
      });
    }

    // Delete image from Cloudinary
    if (banner.cloudinary_id) {
      try {
        await deleteFromCloudinary(banner.cloudinary_id);
      } catch (error) {
        console.error('Error deleting image from Cloudinary:', error);
      }
    }

    // Delete banner from database
    await Banner.findByIdAndDelete(id);

    res.json({
      success: true,
      message: 'Banner deleted successfully',
    });
  } catch (error: any) {
    console.error('Error deleting banner:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'DELETE_BANNER_ERROR',
        message: error.message || 'Failed to delete banner',
      },
    });
  }
};
