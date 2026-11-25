import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import * as transcriptionsController from '../controllers/transcriptions.controller.js';

const router = Router();

const languageHintSchema = z.enum(['auto', 'hi-IN', 'en-IN']);
const sourceSchema = z.enum(['live', 'file']);

const idParamSchema = z.object({
  id: z
    .string()
    .regex(/^[1-9]\d*$/, 'id must be a positive integer')
    .transform((val) => Number(val))
    .refine((val) => Number.isSafeInteger(val) && val > 0, 'id must be a positive integer'),
});

const createBodySchema = z.object({
  text: z
    .string({ required_error: 'text is required' })
    .trim()
    .min(1, 'text must be at least 1 character')
    .max(50000, 'text must be at most 50000 characters'),
  language_hint: languageHintSchema.default('auto'),
  source: sourceSchema.default('live'),
  duration_sec: z.number().int().min(0).nullable().optional(),
});

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  q: z.string().trim().max(500).optional(),
  sort: z.enum(['created_at', 'updated_at']).default('created_at'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

const updateBodySchema = z
  .object({
    text: z
      .string()
      .trim()
      .min(1, 'text must be at least 1 character')
      .max(50000, 'text must be at most 50000 characters')
      .optional(),
    language_hint: languageHintSchema.optional(),
  })
  .refine(
    (data) => data.text !== undefined || data.language_hint !== undefined,
    { message: 'At least one of text or language_hint must be provided' }
  );

router.post('/', validate({ body: createBodySchema }), transcriptionsController.create);
router.get('/', validate({ query: listQuerySchema }), transcriptionsController.list);
router.get('/:id', validate({ params: idParamSchema }), transcriptionsController.getById);
router.put(
  '/:id',
  validate({ params: idParamSchema, body: updateBodySchema }),
  transcriptionsController.update
);
router.delete('/:id', validate({ params: idParamSchema }), transcriptionsController.remove);

export default router;
