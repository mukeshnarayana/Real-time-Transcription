import multer from 'multer';
import { ZodError } from 'zod';
import { env } from '../config/env.js';

export class AppError extends Error {
  constructor(statusCode, message, details = undefined) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

export function notFoundHandler(req, res) {
  res.status(404).json({
    error: {
      message: `Route not found: ${req.method} ${req.originalUrl}`,
    },
  });
}

export function errorHandler(err, _req, res, _next) {
  if (err instanceof ZodError) {
    const details = err.issues.map((issue) => ({
      field: issue.path.join('.') || 'input',
      message: issue.message,
    }));

    return res.status(400).json({
      error: {
        message: 'Validation failed',
        details,
      },
    });
  }

  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        error: {
          message: 'Uploaded audio file exceeds the 10 MB size limit.',
        },
      });
    }
    return res.status(400).json({
      error: {
        message: err.message,
      },
    });
  }

  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      error: {
        message: 'Malformed JSON request body.',
      },
    });
  }

  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      console.error('Server AppError:', err);
    }
    return res.status(err.statusCode).json({
      error: {
        message: err.message,
        ...(err.details ? { details: err.details } : {}),
      },
    });
  }

  console.error('Unhandled error:', err);

  const safeMessage =
    env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err?.message || 'Internal server error';

  return res.status(500).json({
    error: {
      message: safeMessage,
    },
  });
}
