import mongoose from "mongoose";
import * as dotenv from "dotenv";
import path from "path";
import Order from "./src/models/Order";
import Counter from "./src/models/Counter";

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, ".env") });

async function runMigration() {
  try {
    await mongoose.connect(process.env.MONGODB_URI as string);
    console.log("Connected to DB");

    // 1. Find duplicates
    const duplicates = await Order.aggregate([
      { $match: { shopify_order_number: { $ne: null } } },
      { $group: { _id: "$shopify_order_number", count: { $sum: 1 }, docs: { $push: "$_id" } } },
      { $match: { count: { $gt: 1 } } }
    ]);

    console.log(`Found ${duplicates.length} duplicate order numbers.`);

    for (const dup of duplicates) {
      console.log(`Fixing duplicate: ${dup._id}`);
      // Skip the first one, rename the rest
      for (let i = 1; i < dup.docs.length; i++) {
        const idToUpdate = dup.docs[i];
        const newOrderNumber = `${dup._id}-${i}`;
        await Order.findByIdAndUpdate(idToUpdate, { shopify_order_number: newOrderNumber });
        console.log(`  Updated order ${idToUpdate} to ${newOrderNumber}`);
      }
    }

    // 2. Find max manual order number
    // We expect them to start with "#0" like "#000158"
    const localOrders = await Order.find({ shopify_order_number: { $regex: /^#0/ } }, 'shopify_order_number');
    
    let maxNumber = 0;
    for (const order of localOrders) {
      if (order.shopify_order_number) {
        // Strip out the '#0' prefix and any suffixes like '-1'
        const match = order.shopify_order_number.match(/^#0(\d+)/);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxNumber) {
            maxNumber = num;
          }
        }
      }
    }

    console.log(`Max manual order number is ${maxNumber}`);

    // 3. Initialize Counter
    await Counter.findOneAndUpdate(
      { _id: "manual_order_number" },
      { $set: { seq: maxNumber } },
      { upsert: true, new: true }
    );
    console.log(`Initialized Counter manual_order_number to ${maxNumber}`);

    console.log("Migration complete.");
    process.exit(0);
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }
}

runMigration();
