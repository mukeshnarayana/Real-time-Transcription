import fs from 'node:fs';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import yaml from 'js-yaml';
import morgan from 'morgan';
import swaggerUi from 'swagger-ui-express';
import { env } from './config/env.js';
import { AppError, errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import healthRoutes from './routes/health.routes.js';
import transcribeRoutes from './routes/transcribe.routes.js';
import transcriptionsRoutes from './routes/transcriptions.routes.js';

const app = express();

// Trust first proxy (e.g. Render) so rate limiting uses the real client IP
app.set('trust proxy', 1);

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        // Allow Swagger UI inline scripts/styles on /api-docs
        'script-src': ["'self'", "'unsafe-inline'"],
        'style-src': ["'self'", "'unsafe-inline'"],
        'img-src': ["'self'", 'data:'],
      },
    },
  })
);

const allowedOrigins = env.CLIENT_URL.split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      if (
        env.NODE_ENV === 'development' &&
        /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
      ) {
        callback(null, true);
        return;
      }
      callback(new AppError(403, `CORS origin not allowed: ${origin}`));
    },
    credentials: true,
  })
);

app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '1mb' }));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      error: {
        message: 'Too many requests, please try again later.',
      },
    });
  },
});

app.use('/api', apiLimiter);

// OpenAPI / Swagger UI
const openapiPath = new URL('../docs/openapi.yaml', import.meta.url);
const openapiRaw = fs.readFileSync(openapiPath, 'utf8');
const openapiSpec = yaml.load(openapiRaw);

app.get('/openapi.yaml', (_req, res) => {
  res.type('application/yaml; charset=utf-8').send(openapiRaw);
});
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openapiSpec));

// Routes
app.use('/health', healthRoutes);
app.use('/api/transcriptions', transcriptionsRoutes);
app.use('/api/transcribe', transcribeRoutes);

// 404 + Central error handler
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
