import fs from 'node:fs';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import mongoose from 'mongoose';
import { env } from './config/env.js';
import routes from './routes/index.js';
import { sanitizeBody } from './middleware/sanitize.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { ApiError } from './utils/ApiError.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', env.trustProxy);

  // Images are served to the client origin, so allow cross-origin resource loading.
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(
    cors({
      origin(origin, cb) {
        // Requests without an Origin header (curl, server-to-server, same-origin proxy) are allowed.
        if (!origin || env.clientOrigins.includes(origin)) return cb(null, true);
        return cb(new ApiError(403, `Origin ${origin} is not allowed by CORS`));
      },
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      exposedHeaders: ['Content-Disposition'],
    })
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(sanitizeBody);
  if (!env.isTest) app.use(morgan(env.isProduction ? 'combined' : 'dev'));

  app.get('/api/health', (_req, res) => {
    res.json({
      success: true,
      status: 'ok',
      database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
      time: new Date().toISOString(),
    });
  });

  fs.mkdirSync(env.uploadDir, { recursive: true });
  app.use('/uploads', express.static(env.uploadDir, { maxAge: '7d', index: false }));

  app.use('/api', routes);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
