import http from 'node:http';
import { env } from './config/env.js';
import app from './app.js';
import { pool, verifyDbConnection } from './db/pool.js';
import { attachTranscribeSocket } from './ws/transcribeSocket.js';

const server = http.createServer(app);
const wss = attachTranscribeSocket(server);

async function start() {
  try {
    await verifyDbConnection();
    console.log('Connected to PostgreSQL database.');
  } catch (err) {
    console.warn(
      'Database connection check failed on startup (server will still start):',
      err.message
    );
  }

  server.listen(env.PORT, () => {
    console.log(
      `Speech-to-Text backend listening on http://localhost:${env.PORT} (${env.NODE_ENV})`
    );
    console.log(`Swagger UI available at http://localhost:${env.PORT}/api-docs`);
    console.log(`WebSocket endpoint available at ws://localhost:${env.PORT}/ws/transcribe`);
  });
}

let isShuttingDown = false;

async function shutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`Received ${signal}. Shutting down gracefully...`);

  const forceExitTimer = setTimeout(() => {
    console.error('Forced shutdown after timeout.');
    process.exit(1);
  }, 10000);
  forceExitTimer.unref();

  for (const client of wss.clients) {
    try {
      client.close(1001, 'Server shutting down');
    } catch {
      client.terminate();
    }
  }

  await new Promise((resolve) => {
    wss.close(() => resolve());
  });

  await new Promise((resolve) => {
    server.close(() => resolve());
  });

  await pool.end();
  console.log('Shutdown complete.');
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

start();
