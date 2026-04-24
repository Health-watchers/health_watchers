import express from "express";
import { config } from "@health-watchers/config";
import authRoutes from "./modules/auth/auth.routes";
import patientRoutes from "./modules/patients/patients.routes";
import encounterRoutes from "./modules/encounters/encounters.routes";
import paymentRoutes from "./modules/payments/payments.routes";
import aiRoutes from "./modules/ai/ai.routes";
import apiKeyRoutes from "./modules/api-keys/api-keys.routes";

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => res.json({ status: "ok", service: "health-watchers-api" }));

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/patients", patientRoutes);
app.use("/api/v1/encounters", encounterRoutes);
app.use("/api/v1/payments", paymentRoutes);
app.use("/api/v1/ai", aiRoutes);
app.use("/api/v1/api-keys", apiKeyRoutes);

app.listen(config.apiPort, () => {
  console.log(`Health Watchers API running on port ${config.apiPort}`);
});

export default app;
