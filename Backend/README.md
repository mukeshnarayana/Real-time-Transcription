# Speech-to-Text Backend (`Backend/`)

Real-time multilingual (Hindi + English) Speech-to-Text backend built with Node.js (ESM), Express 4, Neon PostgreSQL (`pg`), WebSockets (`ws`), and the Gemini Live API (`@google/genai`).

## Features

- **Real-time WebSocket transcription** at `/ws/transcribe` streaming 16 kHz mono 16-bit PCM to Gemini Live (`gemini-3.5-transcribe-live`) with interim and final transcript events.
- **Multilingual code-switching** (`auto` mode sends an empty `languageCodes` list so Hindi + English mixing works automatically; `hi-IN` and `en-IN` hints are also supported).
- **WAV file transcription endpoint** (`POST /api/transcribe/file`) for no-microphone testing and fallback uploads.
- **PostgreSQL persistence on Neon** using parameterized SQL queries (`$1, $2 ...`), idempotent `npm run db:init`, pagination, case-insensitive search (`ILIKE`), and whitelisted sorting.
- **Interactive API docs** served at `/api-docs` (Swagger UI) and `/openapi.yaml`.

---

## Setup Steps

1. **Create a Neon PostgreSQL project**
   - Go to [Neon](https://neon.tech) and create a project.
   - Copy the **pooled** connection string (contains `-pooler` and `?sslmode=require`).

2. **Configure environment variables**
   ```bash
   cd Backend
   cp .env.example .env
   ```
   Fill in `DATABASE_URL` and `GEMINI_API_KEY` in `.env`:
   ```env
   PORT=5000
   NODE_ENV=development
   DATABASE_URL=postgresql://USER:PASSWORD@HOST-pooler.REGION.aws.neon.tech/DBNAME?sslmode=require
   GEMINI_API_KEY=your_key_here
   GEMINI_MODEL=gemini-3.5-transcribe-live
   CLIENT_URL=http://localhost:5173
   ```

3. **Install dependencies**
   ```bash
   npm install
   ```

4. **Initialize the database schema**
   ```bash
   npm run db:init
   ```
   Safe to run multiple times (`CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, idempotent `updated_at` trigger).

5. **Run the server**
   ```bash
   npm run dev
   ```
   - API base: `http://localhost:5000`
   - Swagger UI: `http://localhost:5000/api-docs`
   - WebSocket: `ws://localhost:5000/ws/transcribe`

---

## REST API Endpoints

| Method | Route | Behavior |
|---|---|---|
| `GET` | `/health` | Returns `{ status: "ok", db: "up" \| "down", uptime }` (`SELECT 1`) |
| `POST` | `/api/transcriptions` | Creates a transcription (`text`, `language_hint`, `source`, `duration_sec`). Returns `201` |
| `GET` | `/api/transcriptions` | Lists transcriptions with `page`, `limit` (max 100), `q` (`ILIKE`), `sort` (`created_at` \| `updated_at`), `order` (`asc` \| `desc`) |
| `GET` | `/api/transcriptions/:id` | Reads one transcription by positive integer ID (`404` if missing) |
| `PUT` | `/api/transcriptions/:id` | Updates `text` and/or `language_hint` (`404` if missing) |
| `DELETE` | `/api/transcriptions/:id` | Deletes a transcription (`204` on success, `404` if missing) |
| `POST` | `/api/transcribe/file` | Multipart WAV upload (`audio`, optional `language_hint`, `save`) |
| `GET` | `/api-docs` | Swagger UI interactive documentation |
| `GET` | `/openapi.yaml` | Raw OpenAPI 3.0.3 YAML specification |

---

## Real-Time WebSocket Protocol (`/ws/transcribe`)

- **Browser -> Server (binary frames):** raw PCM, 16-bit signed little-endian, 16 kHz, mono.
- **Browser -> Server (JSON text frames):**
  - `{ "type": "start", "language_hint": "auto" | "hi-IN" | "en-IN" }` *(optional, sent first)*
  - `{ "type": "stop" }`
- **Server -> Browser (JSON text frames):**
  - `{ "type": "ready" }` — Gemini session is open
  - `{ "type": "interim", "text": "..." }` — Partial live transcript
  - `{ "type": "final", "text": "..." }` — Finalized transcript segment
  - `{ "type": "error", "message": "..." }` — Error notification
  - `{ "type": "closed" }` — Gemini session closed

The WebSocket does **not** save to PostgreSQL. The frontend saves the final transcript via `POST /api/transcriptions` when recording stops.

---

## Testing with Swagger UI & Test WAV File

1. Open `http://localhost:5000/api-docs` in your browser.
2. Run `GET /health` to verify `db: "up"`.
3. Test full CRUD (`POST`, `GET`, `PUT`, `DELETE`) under **Transcriptions**.
4. To test `POST /api/transcribe/file` without a microphone, convert any audio file into the required 16 kHz mono 16-bit PCM WAV format:
   ```bash
   ffmpeg -i input.m4a -ar 16000 -ac 1 -c:a pcm_s16le output.wav
   ```
   Upload `output.wav` in Swagger UI under `POST /api/transcribe/file`.

---

## Deploying to Render

1. Create a new **Web Service** on Render pointing to `Backend/` (Root Directory: `Backend`).
2. Set Build Command: `npm install` and Start Command: `npm start`.
3. Add all environment variables (`DATABASE_URL`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `CLIENT_URL`, `NODE_ENV=production`).
4. Run `npm run db:init` once (locally against the same Neon `DATABASE_URL` or via Render Shell).
5. Notes for Render free tier:
   - Free instances sleep after inactivity, causing cold starts on both Render and Neon (handled via a 10s `connectionTimeoutMillis` and startup connection retry).
   - `trust proxy` is enabled so `express-rate-limit` reads client IPs correctly behind Render's proxy.
   - WebSockets work automatically over `wss://<your-service>.onrender.com/ws/transcribe`.
