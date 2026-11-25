import { WebSocketServer } from 'ws';
import { z } from 'zod';
import { createGeminiLiveSession } from '../services/gemini.service.js';

const WS_PATH = '/ws/transcribe';
const HEARTBEAT_INTERVAL_MS = 30000;
const MAX_MESSAGE_BYTES = 128 * 1024; // 128 KB max per WS frame
const MAX_CONCURRENT_SOCKETS = 20;
const MAX_BUFFERED_AUDIO_FRAMES = 50;
const AUTO_START_GRACE_MS = 350;

const controlMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('start'),
    language_hint: z.enum(['auto', 'hi-IN', 'en-IN']).default('auto'),
  }),
  z.object({
    type: z.literal('stop'),
  }),
]);

function sendJson(ws, payload) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

/**
 * Attaches the real-time speech-to-text WebSocket bridge at `/ws/transcribe`.
 */
export function attachTranscribeSocket(server) {
  const wss = new WebSocketServer({
    server,
    path: WS_PATH,
    maxPayload: MAX_MESSAGE_BYTES,
  });

  const heartbeatInterval = setInterval(() => {
    for (const client of wss.clients) {
      if (client.isAlive === false) {
        client.terminate();
        continue;
      }
      client.isAlive = false;
      client.ping();
    }
  }, HEARTBEAT_INTERVAL_MS);

  wss.on('close', () => {
    clearInterval(heartbeatInterval);
  });

  wss.on('connection', (ws) => {
    if (wss.clients.size > MAX_CONCURRENT_SOCKETS) {
      sendJson(ws, {
        type: 'error',
        message: 'Server busy: maximum concurrent transcription sessions reached.',
      });
      ws.close(1013, 'Too many concurrent connections');
      return;
    }

    ws.isAlive = true;
    ws.on('pong', () => {
      ws.isAlive = true;
    });

    let geminiSession = null;
    let geminiReady = false;
    let sessionStarting = false;
    let clientClosed = false;
    let stopRequested = false;
    let graceTimer = null;
    let stopCloseTimer = null;
    const pendingAudioFrames = [];

    const cleanupSession = (notifyClosed = false) => {
      if (graceTimer) {
        clearTimeout(graceTimer);
        graceTimer = null;
      }
      if (stopCloseTimer) {
        clearTimeout(stopCloseTimer);
        stopCloseTimer = null;
      }
      pendingAudioFrames.length = 0;

      if (geminiSession) {
        geminiSession.close();
        geminiSession = null;
      }
      geminiReady = false;

      if (notifyClosed && !clientClosed) {
        sendJson(ws, { type: 'closed' });
      }
    };

    const startGeminiSession = async (languageHint = 'auto') => {
      if (sessionStarting || geminiSession || clientClosed || stopRequested) {
        return;
      }
      sessionStarting = true;

      if (graceTimer) {
        clearTimeout(graceTimer);
        graceTimer = null;
      }

      try {
        const created = await createGeminiLiveSession({
          languageHint,
          onReady: () => {
            if (clientClosed) {
              created.close();
              return;
            }
            geminiReady = true;
            sendJson(ws, { type: 'ready' });

            while (pendingAudioFrames.length > 0) {
              const frame = pendingAudioFrames.shift();
              created.sendAudio(frame);
            }
          },
          onInterim: (text) => {
            sendJson(ws, { type: 'interim', text });
          },
          onFinal: (text) => {
            sendJson(ws, { type: 'final', text });
          },
          onTurnComplete: () => {
            if (stopRequested) {
              if (stopCloseTimer) {
                clearTimeout(stopCloseTimer);
              }
              stopCloseTimer = setTimeout(() => {
                cleanupSession(true);
              }, 100);
            }
          },
          onError: (err) => {
            sendJson(ws, {
              type: 'error',
              message: err?.message || 'Upstream transcription error',
            });
            cleanupSession(true);
          },
          onClose: () => {
            const shouldNotify = !clientClosed;
            geminiSession = null;
            geminiReady = false;
            if (stopCloseTimer) {
              clearTimeout(stopCloseTimer);
              stopCloseTimer = null;
            }
            if (shouldNotify) {
              sendJson(ws, { type: 'closed' });
            }
          },
        });

        if (clientClosed || stopRequested) {
          created.close();
          return;
        }
        geminiSession = created;
      } catch (err) {
        sendJson(ws, {
          type: 'error',
          message: err?.message || 'Failed to open Gemini transcription session',
        });
        cleanupSession(true);
      } finally {
        sessionStarting = false;
      }
    };

    // Start automatically with 'auto' if client doesn't send an explicit 'start' frame
    graceTimer = setTimeout(() => {
      startGeminiSession('auto');
    }, AUTO_START_GRACE_MS);

    ws.on('message', (data, isBinary) => {
      if (stopRequested) return;

      if (isBinary) {
        const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
        if (buffer.length === 0) return;

        if (!geminiSession && !sessionStarting) {
          startGeminiSession('auto');
        }

        if (geminiReady && geminiSession) {
          geminiSession.sendAudio(buffer);
        } else if (pendingAudioFrames.length < MAX_BUFFERED_AUDIO_FRAMES) {
          pendingAudioFrames.push(buffer);
        }
        return;
      }

      let parsedJson;
      try {
        parsedJson = JSON.parse(data.toString('utf8'));
      } catch {
        sendJson(ws, { type: 'error', message: 'Invalid JSON control frame.' });
        return;
      }

      const result = controlMessageSchema.safeParse(parsedJson);
      if (!result.success) {
        sendJson(ws, {
          type: 'error',
          message: 'Invalid control message. Expected "start" or "stop".',
        });
        return;
      }

      const msg = result.data;
      if (msg.type === 'start') {
        if (geminiSession || sessionStarting) {
          sendJson(ws, {
            type: 'error',
            message: 'Transcription session already started.',
          });
          return;
        }
        startGeminiSession(msg.language_hint);
      } else if (msg.type === 'stop') {
        stopRequested = true;
        if (geminiSession && geminiReady) {
          geminiSession.endAudioStream();
          // Wait for generationComplete/turnComplete (or up to 3s) so trailing final text is relayed
          stopCloseTimer = setTimeout(() => {
            cleanupSession(true);
          }, 3000);
        } else {
          cleanupSession(true);
        }
      }
    });

    ws.on('close', () => {
      clientClosed = true;
      cleanupSession(false);
    });

    ws.on('error', (err) => {
      console.error('WebSocket client error:', err.message);
      clientClosed = true;
      cleanupSession(false);
    });
  });

  return wss;
}
