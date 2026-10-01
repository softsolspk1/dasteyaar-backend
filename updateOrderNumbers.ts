import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Order from './src/models/Order';
import Prescription from './src/models/Prescription';
import shopify from './src/config/shopify';

dotenv.config();

async function updateOrderNumbers() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI!);
    // Create Shopify session
    const session = shopify.session.customAppSession(process.env.SHOPIFY_STORE_URL!);
    session.accessToken = process.env.SHOPIFY_ACCESS_TOKEN!;
    const client = new shopify.clients.Rest({ session });

    // Get all orders from database
    const orders = await Order.find({});
    for (const order of orders) {
      try {
        // Fetch order from Shopify
        const response = await client.get({
          path: `orders/${order.shopify_order_id}`,
        });

        const shopifyOrder = response.body.order;
        const correctOrderNumber = shopifyOrder.name;
        if (order.shopify_order_number !== correctOrderNumber) {
          // Update order
          await Order.updateOne(
            { _id: order._id },
            { shopify_order_number: correctOrderNumber }
          );

          // Update prescription if it exists
          if (order.prescription_id) {
            await Prescription.updateOne(
              { _id: order.prescription_id },
              { shopify_order_number: correctOrderNumber }
            );
          }
        } else {
        }
      } catch (error: any) {
      }
    }
    await mongoose.disconnect();
  } catch (error) {
    process.exit(1);
  }
}

updateOrderNumbers();
