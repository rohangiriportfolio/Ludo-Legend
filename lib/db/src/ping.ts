/**
 * Quick standalone connectivity check for local development:
 *   pnpm --filter @workspace/db run ping
 */
import "dotenv/config";
import { connectDb, mongoose } from "./index.js";

async function main() {
  console.log(`Connecting to ${process.env.DATABASE_URL} ...`);
  await connectDb();
  console.log("✅ Connected to MongoDB successfully.");
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("❌ Failed to connect to MongoDB:", err instanceof Error ? err.message : err);
  process.exit(1);
});
