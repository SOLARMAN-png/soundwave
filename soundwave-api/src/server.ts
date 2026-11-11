import "dotenv/config";
import app from "./app.js";
import { assertAuthConfiguration } from "./config/auth.js";
import { connectMongoDB } from "./config/database.js";

const port = Number(process.env.PORT ?? 3000);

async function startServer() {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }

  assertAuthConfiguration();
  await connectMongoDB();

  app.listen(port, () => {
    console.log(`Soundwave API listening on port ${port}`);
  });
}

startServer().catch((error: unknown) => {
  console.error("Failed to start Soundwave API:", error);
  process.exitCode = 1;
});