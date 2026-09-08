import fs from "node:fs";
import path from "node:path";
import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { config } from "./config.js";
import { pool, query } from "./db.js";
import { authenticate, verifyCsrf } from "./middleware/auth.js";
import authRoutes from "./routes/authRoutes.js";
import apiRoutes from "./routes/apiRoutes.js";

const app = express();
if (config.nodeEnv === "production") app.set("trust proxy", 1);

await fs.promises.mkdir(config.pdfStoragePath, { recursive: true });

app.disable("x-powered-by");
app.use(helmet({
  crossOriginResourcePolicy: { policy: "same-site" },
  contentSecurityPolicy: config.nodeEnv === "production" ? {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'"],
      workerSrc: ["'self'", "blob:"],
      frameSrc: ["'self'", "blob:"],
    },
  } : false,
}));

app.use(cors({
  credentials: true,
  origin(origin, callback) {
    // Vite is commonly opened through the server PC's LAN address during local
    // development. Production remains restricted to explicitly configured origins.
    if (!origin || config.nodeEnv === "development" || config.allowedOrigins.includes(origin)) return callback(null, true);
    callback(Object.assign(new Error(`Origin ${origin} is not allowed.`), { status: 403 }));
  },
}));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));
app.use(cookieParser());
app.use(authenticate);
app.use(verifyCsrf);

const authenticationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 40,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many authentication attempts. Try again later." },
});

app.get("/api/health", async (_req, res, next) => {
  try {
    await query("select 1");
    await fs.promises.access(config.pdfStoragePath, fs.constants.R_OK | fs.constants.W_OK);
    res.json({ ok: true, database: "connected", storage: "available" });
  } catch (error) { next(error); }
});
app.use("/api/auth", authenticationLimiter, authRoutes);
app.use("/api", apiRoutes);

if (fs.existsSync(config.clientBuildPath)) {
  app.use(express.static(config.clientBuildPath, { index: false, maxAge: config.nodeEnv === "production" ? "1h" : 0 }));
  app.use((req, res, next) => {
    if (req.method !== "GET" || req.path.startsWith("/api/")) return next();
    res.sendFile(path.join(config.clientBuildPath, "index.html"));
  });
}

app.use((_req, res) => res.status(404).json({ error: "Endpoint not found." }));

app.use((error, _req, res, _next) => {
  const status = error.status || (error.code === "LIMIT_FILE_SIZE" ? 413 : 500);
  const publicMessage = status >= 500 && config.nodeEnv === "production" ? "The server could not complete the request." : error.message;
  if (status >= 500) console.error(error);
  res.status(status).json({ error: publicMessage || "Unexpected server error." });
});

const server = app.listen(config.port, config.host, () => {
  console.log(`KU Legal Affairs server listening on http://${config.host}:${config.port}`);
  console.log(`Central document storage: ${config.pdfStoragePath}`);
});

const cleanupTimer = setInterval(() => {
  query("delete from sessions where expires_at <= now()").catch((error) => console.error("Session cleanup failed", error));
  query("delete from password_reset_tokens where expires_at <= now() or used_at is not null").catch(() => {});
}, 60 * 60 * 1000);
cleanupTimer.unref();

async function shutdown(signal) {
  console.log(`${signal} received; shutting down.`);
  clearInterval(cleanupTimer);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
