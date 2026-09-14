import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const serverDirectory = path.dirname(fileURLToPath(import.meta.url));
const databaseUrl = process.env.DATABASE_URL?.trim();

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required. Copy server/.env.example to server/.env and enter your PostgreSQL credentials.");
}

function booleanEnv(name, fallback = false) {
  const value = process.env[name];
  if (value === undefined) return fallback;
  return value.toLowerCase() === "true";
}

function integerEnv(name, fallback) {
  const value = Number.parseInt(process.env[name] || "", 10);
  return Number.isFinite(value) ? value : fallback;
}

export const config = {
  nodeEnv: process.env.NODE_ENV || "development",
  host: process.env.HOST || "0.0.0.0",
  port: integerEnv("PORT", 4000),
  databaseUrl,
  databaseSsl: booleanEnv("DATABASE_SSL"),
  allowedOrigins: (process.env.ALLOWED_ORIGINS || "http://localhost:5173,http://127.0.0.1:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  publicAppUrl: process.env.PUBLIC_APP_URL || "http://localhost:5173",
  // Railway supplies the mount path at runtime when a volume is attached.
  // Keep explicit paths authoritative for existing document repositories.
  pdfStoragePath: path.resolve(serverDirectory, process.env.PDF_STORAGE_PATH?.trim() || process.env.RAILWAY_VOLUME_MOUNT_PATH?.trim() || "storage/pdfs"),
  sessionHours: integerEnv("SESSION_HOURS", 12),
  secureCookies: booleanEnv("SECURE_COOKIES", process.env.NODE_ENV === "production"),
  useMockAiReview: booleanEnv("USE_MOCK_AI_REVIEW", true),
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || "",
    model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
  },
  smtp: {
    host: process.env.SMTP_HOST || "",
    port: integerEnv("SMTP_PORT", 587),
    secure: booleanEnv("SMTP_SECURE"),
    user: process.env.SMTP_USER || "",
    password: process.env.SMTP_PASSWORD || "",
    from: process.env.SMTP_FROM || "KU Legal Affairs <no-reply@example.edu>",
  },
  clientBuildPath: path.resolve(serverDirectory, "../Code/dist"),
};
