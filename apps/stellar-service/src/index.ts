// apps/stellar-service/src/index.ts

import './tracing'; // must be first — initialises OpenTelemetry SDK
import './config.js'; // validates env vars and fails fast if invalid
import app from './app.js';
import logger from './logger.js';
import { stellarConfig } from './config.js';

const PORT = stellarConfig.port;

app.listen(PORT, () => {
  logger.info({ port: PORT, network: stellarConfig.network }, 'Stellar service started');
});

export default app;
