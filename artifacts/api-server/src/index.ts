import "dotenv/config";
import app from "./app.js";
import { logger } from "./lib/logger.js";
import { connectDb } from "@workspace/db";

// On Replit, PORT is injected by the platform. For local/laptop dev this
// falls back to 4000 (matching artifacts/ludo-game's default API_PORT) so
// `pnpm dev` works out of the box.
const rawPort = process.env["PORT"] || "4000";

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Real-time multiplayer runs on HTTP polling (see src/lib/room-engine.ts),
// not WebSockets — so this is a plain HTTP server, no Socket.IO involved.
// That's also what makes `app` deployable as-is on serverless platforms
// (e.g. Vercel), where a persistent WebSocket connection wouldn't work.
async function main() {
  await connectDb();
  logger.info("Connected to MongoDB");

  app.listen(port, () => {
    logger.info({ port }, "Server listening");
  });
}

main().catch((err) => {
  logger.error({ err }, "Failed to start server");
  process.exit(1);
});
