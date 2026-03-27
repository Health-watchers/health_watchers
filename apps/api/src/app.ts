import express from "express";
import { config } from "@health-watchers/config";
import { httpLogger, correlationMiddleware } from "./middlewares/correlation.middleware";
import { errorMiddleware } from "./middlewares/error.middleware";
import { authRoutes } from "./modules/auth/auth.controller";
import { patientRoutes } from "./modules/patients/patients.controller";
import { encounterRoutes } from "./modules/encounters/encounters.controller";
import { paymentRoutes } from "./modules/payments/payments.controller";
import aiRoutes from "./modules/ai/ai.routes";
import { setupSwagger } from "./docs/swagger";
import dashboardRoutes from "./modules/dashboard/dashboard.routes";

const app = express();

// ── Correlation / logging (must be first) ────────────────────────────────────
app.use(httpLogger);
app.use(correlationMiddleware);

app.use(express.json());

// ── Health check ─────────────────────────────────────────────────────────────
app.get("/health", (_req, res) =>
  res.json({ status: "ok", service: "health-watchers-api" })
);

// ── Routes ───────────────────────────────────────────────────────────────────
app.use("/api/v1/auth",       authRoutes);
app.use("/api/v1/patients",   patientRoutes);
app.use("/api/v1/encounters", encounterRoutes);
app.use("/api/v1/payments",   paymentRoutes);
app.use("/api/v1/ai",         aiRoutes);
app.use("/api/v1/dashboard",  dashboardRoutes);

setupSwagger(app);

// ── Global error handler (includes requestId in every error response) ────────
app.use(errorMiddleware);

app.listen(config.apiPort, () => {
  console.log(`Health Watchers API running on port ${config.apiPort}`);
});

export default app;
