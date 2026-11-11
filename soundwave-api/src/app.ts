import cors from "cors";
import express, { type ErrorRequestHandler } from "express";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { pingMongoDB } from "./config/database.js";
import { createCookieCsrfGuard } from "./middleware/csrf.js";
import authRouter from "./features/auth/auth.routes.js";
import adminRouter from "./features/admin/admin.routes.js";
import catalogRouter from "./features/catalog/catalog.routes.js";
import libraryRouter from "./features/library/library.routes.js";
import playbackRouter from "./features/playback/playback.routes.js";
import playlistRouter from "./features/playlists/playlist.routes.js";

const app = express();
const clientOrigin = new URL(process.env.CLIENT_ORIGIN ?? "http://localhost:5173");
if (clientOrigin.protocol !== "http:" && clientOrigin.protocol !== "https:") {
  throw new Error("CLIENT_ORIGIN must use HTTP or HTTPS");
}
const allowedClientOrigin = clientOrigin.origin;

app.use(helmet());
app.use(
  cors({
    origin: allowedClientOrigin,
    credentials: true,
  }),
);
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());
app.use("/api", createCookieCsrfGuard(allowedClientOrigin));

app.use("/api", catalogRouter);
app.use("/api/auth", authRouter);
app.use("/api/admin", adminRouter);
app.use("/api/playlists", playlistRouter);
app.use("/api/library", libraryRouter);
app.use("/api/history", playbackRouter);

app.get("/api/v1/health", (_request, response) => {
  response.status(200).json({ status: "ok" });
});

app.get("/api/v1/ready", async (_request, response) => {
  try {
    await pingMongoDB();
    response.status(200).json({ status: "ready", database: "connected" });
  } catch (error: unknown) {
    console.error("Database readiness check failed:", error);
    response.status(503).json({ status: "not_ready", database: "disconnected" });
  }
});

app.use((_request, response) => {
  response.status(404).json({ error: "Route not found" });
});

const errorHandler: ErrorRequestHandler = (error, _request, response, next) => {
  if (response.headersSent) {
    next(error);
    return;
  }

  if (error instanceof SyntaxError) {
    response.status(400).json({ error: "Invalid JSON body" });
    return;
  }

  console.error(error);
  response.status(500).json({ error: "Internal server error" });
};

app.use(errorHandler);

export default app;