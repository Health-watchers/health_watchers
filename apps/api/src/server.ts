import { config } from "@health-watchers/config";
import { connectDB } from "./config/db";
import app from "./app";

connectDB().then(() => {
  app.listen(config.apiPort, () => {
    console.log(`Health Watchers API running on port ${config.apiPort}`);
  });
});
