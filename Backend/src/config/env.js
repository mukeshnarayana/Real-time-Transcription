import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

// Load Backend/.env first (if present), then fall back to workspace root .env
const envPaths = [
  fileURLToPath(new URL('../../.env', import.meta.url)),
  fileURLToPath(new URL('../../../.env', import.meta.url)),
];

for (const envPath of envPaths) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
  }
}

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(5000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z
    .string({ required_error: 'DATABASE_URL is required' })
    .trim()
    .min(1, 'DATABASE_URL is required')
    .refine(
      (val) => val.startsWith('postgres://') || val.startsWith('postgresql://'),
      'DATABASE_URL must be a valid PostgreSQL connection string'
    ),
  GEMINI_API_KEY: z
    .string({ required_error: 'GEMINI_API_KEY is required' })
    .trim()
    .min(1, 'GEMINI_API_KEY is required'),
  GEMINI_MODEL: z
    .string()
    .trim()
    .min(1)
    .default('gemini-3.5-transcribe-live'),
  CLIENT_URL: z
    .string()
    .trim()
    .min(1)
    .default('*'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Environment configuration validation failed:');
  for (const issue of parsed.error.issues) {
    const key = issue.path.join('.') || 'ENV';
    console.error(`  - ${key}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = Object.freeze(parsed.data);
