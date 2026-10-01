import dotenv from 'dotenv';
import shopify from './src/config/shopify';

dotenv.config();

async function fulfillOrder(orderNumber: string, trackingNumber?: string, trackingCompany?: string) {
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

    if (order.fulfillment_status === 'fulfilled') {

      return;
    }

    // Get line items for fulfillment
    const lineItems = order.line_items.map((item: any) => ({
      id: item.id,
      quantity: item.quantity,
    }));

    // Create fulfillment
    const fulfillmentData: any = {
      fulfillment: {
        line_items_by_fulfillment_order: [],
        notify_customer: false, // Set to true if you want to send email notification
      },
    };

    // Get fulfillment orders first
    const fulfillmentOrdersResponse = await client.get({
      path: `orders/${order.id}/fulfillment_orders`,
    });

    const fulfillmentOrders = fulfillmentOrdersResponse.body.fulfillment_orders;
    
    if (fulfillmentOrders && fulfillmentOrders.length > 0) {
      // Use the new fulfillment API
      const fulfillmentOrderId = fulfillmentOrders[0].id;
      
      fulfillmentData.fulfillment.line_items_by_fulfillment_order = [{
        fulfillment_order_id: fulfillmentOrderId,
      }];
    } else {
      // Fallback to legacy method
      delete fulfillmentData.fulfillment.line_items_by_fulfillment_order;
      fulfillmentData.fulfillment.line_items = lineItems;
    }

    // Add tracking information if provided
    if (trackingNumber) {
      fulfillmentData.fulfillment.tracking_number = trackingNumber;
      fulfillmentData.fulfillment.tracking_company = trackingCompany || 'Other';
      fulfillmentData.fulfillment.tracking_url = `https://track.example.com/${trackingNumber}`;

    }

    const fulfillmentResponse = await client.post({
      path: `fulfillments`,
      data: fulfillmentData,
    });

    const fulfillment = fulfillmentResponse.body.fulfillment;

    if (fulfillment.tracking_number) {

    }

    // Fetch updated order to confirm
    const updatedOrderResponse = await client.get({
      path: `orders/${order.id}`,
    });

    const updatedOrder = updatedOrderResponse.body.order;

    // Determine overall status
    let overallStatus = 'fulfilled';

  } catch (error: any) {

    if (error.response?.body?.errors) {

    }
    process.exit(1);
  }
}

// Get order number from command line arguments
const orderNumber = process.argv[2];
const trackingNumber = process.argv[3];
const trackingCompany = process.argv[4];

if (!orderNumber) {

  process.exit(1);
}

// Ensure order number has # prefix
const formattedOrderNumber = orderNumber.startsWith('#') ? orderNumber : `#${orderNumber}`;

fulfillOrder(formattedOrderNumber, trackingNumber, trackingCompany);

