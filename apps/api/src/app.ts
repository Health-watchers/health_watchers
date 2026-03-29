import express from "express";
import { config } from "@health-watchers/config";
import { authRoutes } from "./modules/auth/auth.controller";
import { patientRoutes } from "./modules/patients/patients.controller";
import { encounterRoutes } from "./modules/encounters/encounters.controller";
import { paymentRoutes } from "./modules/payments/payments.controller";
import aiRoutes from "./modules/ai/ai.routes";
import { setupSwagger } from "./docs/swagger";
import dashboardRoutes from "./modules/dashboard/dashboard.routes";
import { usersRoutes } from "./modules/users/users.controller";

const app = express();
app.disable('x-powered-by');

app.get("/health", (_req, res) =>
  res.json({ status: "ok", service: "health-watchers-api" }),
);

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/patients", patientRoutes);
app.use("/api/v1/encounters", encounterRoutes);
app.use("/api/v1/payments", paymentRoutes);
app.use("/api/v1/ai", aiRoutes);
app.use("/api/v1/dashboard", dashboardRoutes);
app.use("/api/v1/users", usersRoutes);

setupSwagger(app);

// Global error handler — must be last
app.use(errorHandler);

async function start() {
  try {
    await connectDB();

    // Start background jobs
    startPaymentExpirationJob();

    const server = app.listen(config.apiPort, () => {
      logger.info(`Health Watchers API running on port ${config.apiPort}`);
    });

    const SHUTDOWN_TIMEOUT_MS = Number(process.env.SHUTDOWN_TIMEOUT_MS ?? 10000);

    async function shutdown(signal: string) {
      logger.info({ signal }, 'Shutting down gracefully...');

      // Stop background jobs
      stopPaymentExpirationJob();

      server.close(async () => {
        logger.info('HTTP server closed');
        try {
          await mongoose.disconnect();
          logger.info('MongoDB connection closed');
          process.exit(0);
        } catch (err) {
          logger.error({ err }, 'Error closing MongoDB connection');
          process.exit(1);
        }
      });

      setTimeout(() => {
        logger.error('Shutdown timeout exceeded — forcing exit');
        process.exit(1);
      }, SHUTDOWN_TIMEOUT_MS).unref();
    }

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (err) {
    logger.error({ err }, 'Failed to start API');
    process.exit(1);
  }
}

start();

export default app;
