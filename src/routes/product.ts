import mongoose from 'mongoose';
import express, { Response } from 'express';
import { authenticateDoctor, AuthRequest } from '../middleware/auth';
import Product from '../models/Product';
import TeamProduct from '../models/TeamProduct';

const router = express.Router();

// Get products assigned to doctor's team
router.get('/team', authenticateDoctor, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const doctorTeamId = req.doctor?.team_id;

    if (!doctorTeamId) {
      const allActiveProducts = await Product.find({ status: 'active' })
        .select('_id name sku price description status shopify_product_id shopify_variant_id')
        .lean();
      res.json({
        success: true,
        data: allActiveProducts,
        message: 'No team assigned to this doctor, showing all active products',
      });
      return;
    }

    // OPTIMIZED: Use Aggregation to fetch products directly
    // This avoids loading thousands of IDs into memory (Double Fetch)
    const products = await TeamProduct.aggregate([
      {
        $match: {
          team_id: new mongoose.Types.ObjectId(String(doctorTeamId)),
          status: 'active',
        },
      },
      {
        $lookup: {
          from: 'products',
          localField: 'product_id',
          foreignField: '_id',
          as: 'product',
        },
      },
      {
        $unwind: '$product',
      },
      {
        $match: {
          'product.status': 'active',
        },
      },
      {
        $replaceRoot: {
          newRoot: '$product',
        },
      },
      {
        $project: {
          _id: 1,
          name: 1,
          sku: 1,
          price: 1,
          description: 1,
          status: 1,
          shopify_product_id: 1,
          shopify_variant_id: 1,
        },
      },
    ]);

    if (products.length === 0) {
      const allActiveProducts = await Product.find({ status: 'active' })
        .select('_id name sku price description status shopify_product_id shopify_variant_id')
        .lean();
      res.json({
        success: true,
        data: allActiveProducts,
        message: 'No products assigned to team, showing all active products',
      });
      return;
    }

    res.json({
      success: true,
      data: products,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to fetch products',
        details: error.message,
      },
    });
  }
});

// Get product by ID
router.get('/:id', authenticateDoctor, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      res.status(404).json({
        success: false,
        error: {
          code: 'PRODUCT_NOT_FOUND',
          message: 'Product not found',
        },
      });
      return;
    }

    res.json({
      success: true,
      data: product,
    });
  } catch (error) {

    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to fetch product',
      },
    });
  }
});

export default router;
