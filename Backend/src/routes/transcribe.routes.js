import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import { z } from 'zod';
import { AppError } from '../middleware/errorHandler.js';
import { transcribePcmBuffer } from '../services/gemini.service.js';
import { createTranscription } from '../services/transcriptions.service.js';
import { FFMPEG_CONVERSION_CMD, parseAndStripWav } from '../utils/wav.js';

const router = Router();

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
    files: 1,
  },
});

const fileLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      error: {
        message: 'Too many file transcription requests. Please try again later.',
      },
    });
  },
});

const fileBodySchema = z.object({
  language_hint: z.enum(['auto', 'hi-IN', 'en-IN']).default('auto'),
  save: z
    .union([z.boolean(), z.enum(['true', 'false', '1', '0', ''])])
    .optional()
    .transform((val) => val === true || val === 'true' || val === '1'),
});

router.post(
  '/file',
  fileLimiter,
  upload.single('audio'),
  async (req, res, next) => {
    try {
      if (!req.file) {
        throw new AppError(
          400,
          `Missing multipart file field "audio". Upload a 16 kHz mono 16-bit WAV file (${FFMPEG_CONVERSION_CMD}).`
        );
      }

      const { language_hint, save } = fileBodySchema.parse(req.body ?? {});
      const { pcmBuffer, durationSec } = parseAndStripWav(req.file.buffer);

      const text = await transcribePcmBuffer({
        pcmBuffer,
        languageHint: language_hint,
        timeoutMs: 60000,
      });

      let saved = false;
      let transcription = null;

      if (save && text.trim().length > 0) {
        transcription = await createTranscription({
          text: text.trim(),
          language_hint,
          source: 'file',
          duration_sec: durationSec,
        });
        saved = true;
      }

      res.json({
        data: {
          text,
          saved,
          transcription,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
