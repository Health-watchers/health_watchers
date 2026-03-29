import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import mongoose from 'mongoose';
import {config} from '@health-watchers/config';

const app = express();
const PORT = process.env.PORT || 4000;

// ========================
// SECURITY & PERFORMANCE MIDDLEWARE
// ========================

// 1. Helmet (Security) - First
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
    },
  },
  hidePoweredBy: true,
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
  noSniff: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));

// 2. Compression (Performance) - Should come early, after helmet
app.use(compression({
  level: 6,                    // Balance between speed and compression ratio
  threshold: 1024,             // Only compress responses larger than 1KB
  filter: (req, res) => {
    if (req.headers['x-no-compression']) return false;
    return compression.filter(req, res);
  }
}));

// 3. CORS
app.use(cors({
  origin: process.env.FRONTEND_URL || ['http://localhost:3000', 'http://localhost:3001'],
  credentials: true,
}));

// Body parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ========================
// DATABASE CONNECTION
// ========================
const connectDB = async () => {
  try {
    const mongoUri = config.mongoUri;
    if (!mongoUri) {
      console.error('❌ MONGO_URI is not defined');
      process.exit(1);
    }

    await mongoose.connect(mongoUri);
    const host = new URL(mongoUri).hostname;
    console.log(`✅ MongoDB connected to ${host}`);
  } catch (error: any) {
    console.error('❌ MongoDB connection failed:', error.message);
    process.exit(1);
  }
};

// ========================
// BASIC HEALTH ROUTE
// ========================
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    message: 'Health Watchers API is running',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    compression: 'enabled'
  });
});

// 404 Handler
app.use('*', (req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

// ========================
// START SERVER
// ========================
const startServer = async () => {
  await connectDB();

  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT} with gzip compression enabled`);
  });
};

process.on('unhandledRejection', (err: any) => {
  console.error('Unhandled Rejection:', err.message);
  process.exit(1);
});

startServer();