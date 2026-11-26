# Speech to Text Frontend (`frontend/`)

React 18 + Vite + Tailwind CSS client for real-time multilingual (Hindi + English) Speech-to-Text backed by the Node/Express/Neon PostgreSQL server.

## Setup

1. Install dependencies:
   ```bash
   cd frontend
   npm install
   ```

2. Create `.env` from `.env.example`:
   ```bash
   cp .env.example .env
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```
   Open `http://localhost:5173`.

## Environment Variables

| Variable | Local Example | Description |
|---|---|---|
| `VITE_API_URL` | `http://localhost:5000` | Backend REST base URL |
| `VITE_WS_URL` | `ws://localhost:5000/ws/transcribe` | Backend WebSocket endpoint |

## How Audio Capture Works

1. The browser requests microphone access via `getUserMedia` (mono, echo cancellation, noise suppression).
2. An `AudioContext` loads `public/pcm-worklet.js`, which downsamples incoming audio from the hardware rate (typically 44.1/48 kHz) to 16 kHz.
3. The worklet converts float32 samples into 16-bit signed little-endian PCM, buffers ~100 ms chunks (3,200 bytes), and sends each chunk as a binary WebSocket frame.
4. Live `interim` (grey italic) and `final` (dark) text frames from the backend update the transcript box in real time.

## Testing Without a Microphone

Switch to the **Upload audio** tab, select a 16-bit PCM, mono, 16 kHz `.wav` file, and click **Transcribe**. You can convert any audio file with:
```bash
ffmpeg -i input.m4a -ar 16000 -ac 1 -c:a pcm_s16le output.wav
```

## Deployment (Vercel)

> **Note:** Browser microphone access (`navigator.mediaDevices.getUserMedia`) requires **HTTPS** when deployed (localhost is exempt during local development).

1. Import the repository in Vercel and set the Root Directory to `frontend`.
2. Add environment variables in Vercel Project Settings using `https://` and `wss://`:
   - `VITE_API_URL=https://real-time-transcription-qfxp.onrender.com`
   - `VITE_WS_URL=wss://real-time-transcription-qfxp.onrender.com/ws/transcribe`
3. Deploy (`npm run build` outputs to `dist/`).
