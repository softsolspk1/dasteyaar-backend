import '@shopify/shopify-api/adapters/node';
import { shopifyApi, ApiVersion } from '@shopify/shopify-api';
import dotenv from 'dotenv';

// Ensure env vars are loaded
dotenv.config();

const shopify = shopifyApi({
  apiKey: process.env.SHOPIFY_API_KEY!,
  apiSecretKey: process.env.SHOPIFY_API_SECRET!,
  scopes: ['read_orders', 'write_orders', 'read_products', 'read_customers', 'write_customers', 'read_draft_orders', 'write_draft_orders'],
  hostName: process.env.SHOPIFY_STORE_URL!.replace('https://', '').replace('http://', ''),
  apiVersion: ApiVersion.January24,
  isEmbeddedApp: false,
  isCustomStoreApp: true,
  adminApiAccessToken: process.env.SHOPIFY_ACCESS_TOKEN!,
});

export default shopify;
