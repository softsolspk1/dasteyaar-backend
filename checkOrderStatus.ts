import dotenv from 'dotenv';
import shopify from './src/config/shopify';

dotenv.config();

async function checkOrderStatus(orderNumbers: string[]) {
  try {
    // Create Shopify session
    const session = shopify.session.customAppSession(process.env.SHOPIFY_STORE_URL!);
    session.accessToken = process.env.SHOPIFY_ACCESS_TOKEN!;
    const client = new shopify.clients.Rest({ session });

    for (const orderNumber of orderNumbers) {
      try {
        // Search for the order by name
        const response = await client.get({
          path: 'orders',
          query: { 
            name: orderNumber,
            status: 'any',
            limit: '1'
          },
        });

        const orders = response.body.orders;

        if (!orders || orders.length === 0) {
          continue;
        }

        const order = orders[0];
        if (order.fulfillments && order.fulfillments.length > 0) {
          order.fulfillments.forEach((fulfillment: any, index: number) => {
          });
        } else {
        }
        order.line_items?.forEach((item: any, index: number) => {
        });
        // Determine overall status
        let overallStatus = 'pending';
        if (order.cancelled_at) {
          overallStatus = 'cancelled';
        } else if (order.fulfillment_status === 'fulfilled') {
          overallStatus = 'fulfilled';
        } else if (order.financial_status === 'paid') {
          overallStatus = 'processing';
        }
      } catch (error: any) {
      }
    }
  } catch (error: any) {
    process.exit(1);
  }
}

// Get order numbers from command line arguments
const orderNumbers = process.argv.slice(2);

if (orderNumbers.length === 0) {
  process.exit(1);
}

// Ensure order numbers have # prefix if not provided
const formattedOrderNumbers = orderNumbers.map(num => num.startsWith('#') ? num : `#${num}`);

checkOrderStatus(formattedOrderNumbers);

