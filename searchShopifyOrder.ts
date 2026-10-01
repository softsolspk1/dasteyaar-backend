import shopify from './src/config/shopify';
import dotenv from 'dotenv';

dotenv.config();

async function searchShopifyOrder(orderName?: string) {
  try {
    // Create Shopify session
    const session = shopify.session.customAppSession(process.env.SHOPIFY_STORE_URL!);
    session.accessToken = process.env.SHOPIFY_ACCESS_TOKEN!;

    const client = new shopify.clients.Rest({ session });

    // Search for orders
    if (orderName) {
    } else {
    }

    const query: any = { status: 'any', limit: '10', order: 'created_at desc' };
    if (orderName) {
      query.name = orderName;
    }

    const response = await client.get({
      path: 'orders',
      query,
    });

    const orders = response.body.orders;

    if (!orders || orders.length === 0) {
      return;
    }
    orders.forEach((order: any) => {
      order.line_items?.forEach((item: any) => {
      });
    });
  } catch (error: any) {
    if (error.response) {
    }
  }
}

// Search for order
const orderName = process.argv[2];
searchShopifyOrder(orderName);
