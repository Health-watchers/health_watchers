import http from "http";
import express from "express";
import mongoSanitize from "express-mongo-sanitize";
import { config } from "@health-watchers/config";
import { connectDB } from "./config/db";
import { authRoutes } from "./modules/auth/auth.controller";
import { patientRoutes } from "./modules/patients/patients.controller";
import { encounterRoutes } from "./modules/encounters/encounters.controller";
import { paymentRoutes } from "./modules/payments/payments.controller";
import aiRoutes from "./modules/ai/ai.routes";
import { setupSwagger } from "./docs/swagger";
import dashboardRoutes from "./modules/dashboard/dashboard.routes";
import { errorHandler } from "./middlewares/error.middleware";

const app = express();

// Standard body size limit — configurable via MAX_REQUEST_BODY_SIZE (default 50kb)
const standardLimit = process.env.MAX_REQUEST_BODY_SIZE ?? "50kb";
// AI routes allow larger payloads for summarization (default 500kb)
const aiLimit = process.env.AI_REQUEST_BODY_SIZE ?? "500kb";

app.use(express.json({ limit: standardLimit }));

// Sanitize req.body, req.query, req.params — replace $ and . to block NoSQL injection
app.use(mongoSanitize({ replaceWith: "_" }));

// Override limit for AI routes before the standard middleware applies
app.use("/api/v1/ai", express.json({ limit: aiLimit }), aiRoutes);

app.get("/health", (_req, res) =>
  res.json({ status: "ok", service: "health-watchers-api", db: dbState() })
);

app.use("/api/v1/auth",       authRoutes);
app.use("/api/v1/patients",   patientRoutes);
app.use("/api/v1/encounters", encounterRoutes);
app.use("/api/v1/payments",   paymentRoutes);
app.use("/api/v1/ai",         aiRoutes);
app.use("/api/v1/dashboard",  dashboardRoutes);

setupSwagger(app);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: "NotFound", message: "Route not found" });
});

// Global error handler — must be last
app.use(errorHandler);

(async () => {
  try {
    await connectDB();
    app.listen(config.apiPort, () => {
      console.log(`Health Watchers API running on port ${config.apiPort}`);
    });
  } catch (err) {
    console.error("❌ Failed to start server:", err);
    process.exit(1);
  }
})();

export default app;
