import dotenv from 'dotenv';
import shopify from './src/config/shopify';

dotenv.config();

async function markOrderAsPaid(orderNumber: string) {
  try {

    // Create Shopify session
    const session = shopify.session.customAppSession(process.env.SHOPIFY_STORE_URL!);
    session.accessToken = process.env.SHOPIFY_ACCESS_TOKEN!;
    const client = new shopify.clients.Rest({ session });

    // Search for the order by name
    const searchResponse = await client.get({
      path: 'orders',
      query: { 
        name: orderNumber,
        status: 'any',
        limit: '1'
      },
    });

    const orders = searchResponse.body.orders;

    if (!orders || orders.length === 0) {

      return;
    }

    const order = orders[0];

    if (order.financial_status === 'paid') {

      return;
    }

    // Create a transaction to mark the order as paid

    const transactionResponse = await client.post({
      path: `orders/${order.id}/transactions`,
      data: {
        transaction: {
          kind: 'capture',
          status: 'success',
          amount: order.total_price,
        },
      },
    });

    const transaction = transactionResponse.body.transaction;

    // Fetch updated order to confirm
    const updatedOrderResponse = await client.get({
      path: `orders/${order.id}`,
    });

    const updatedOrder = updatedOrderResponse.body.order;

  } catch (error: any) {

    if (error.response?.body?.errors) {

    }
    process.exit(1);
  }
}

// Get order number from command line argument
const orderNumber = process.argv[2];

if (!orderNumber) {

  process.exit(1);
}

// Ensure order number has # prefix
const formattedOrderNumber = orderNumber.startsWith('#') ? orderNumber : `#${orderNumber}`;

markOrderAsPaid(formattedOrderNumber);

