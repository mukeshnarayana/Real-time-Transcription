import { GoogleGenAI, Modality } from '@google/genai';
import { env } from '../config/env.js';
import { AppError } from '../middleware/errorHandler.js';

const PCM_MIME_TYPE = 'audio/pcm;rate=16000';
const CHUNK_SIZE_BYTES = 3200; // 100 ms at 16 kHz, 16-bit mono PCM
const CHUNK_PACE_MS = 5;

/**
 * Maps API language_hint ('auto' | 'hi-IN' | 'en-IN') to Live API languageCodes.
 * Empty array enables automatic multilingual detection (Hindi + English mixing).
 */
function resolveLanguageCodes(languageHint) {
  if (!languageHint || languageHint === 'auto') {
    return [];
  }
  return [languageHint];
}

/**
 * Creates a GoogleGenAI client whose Live setup message includes
 * `inputAudioTranscription.languageCodes`, working around @google/genai@1.52.0
 * rejecting `languageCodes` in its MLDev parameter serializer.
 */
function createLiveClientWithLanguageCodes(languageCodes) {
  const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  const baseFactory = ai.live.webSocketFactory;

  ai.live.webSocketFactory = {
    create(url, headers, wsCallbacks) {
      const conn = baseFactory.create(url, headers, wsCallbacks);
      const originalSend = conn.send.bind(conn);
      let setupInjected = false;

      conn.send = (rawMessage) => {
        if (!setupInjected) {
          setupInjected = true;
          try {
            const payload = JSON.parse(rawMessage);
            if (payload?.setup?.inputAudioTranscription) {
              payload.setup.inputAudioTranscription.languageCodes = languageCodes;
              payload.setup.inputAudioTranscription.mode = 'SMART';
              return originalSend(JSON.stringify(payload));
            }
          } catch {
            // Fall through and send raw message unchanged
          }
        }
        return originalSend(rawMessage);
      };

      return conn;
    },
  };

  return ai;
}

/**
 * Opens a Gemini Live transcription session.
 * All @google/genai SDK specifics are encapsulated in this module.
 */
export async function createGeminiLiveSession({
  languageHint = 'auto',
  onReady,
  onInterim,
  onFinal,
  onTurnComplete,
  onError,
  onClose,
}) {
  const languageCodes = resolveLanguageCodes(languageHint);
  const ai = createLiveClientWithLanguageCodes(languageCodes);

  let session = null;
  let closed = false;
  let readyEmitted = false;

  const emitReadyOnce = () => {
    if (!readyEmitted && !closed) {
      readyEmitted = true;
      onReady?.();
    }
  };

  try {
    session = await ai.live.connect({
      model: env.GEMINI_MODEL,
      config: {
        responseModalities: [Modality.TEXT],
        inputAudioTranscription: {},
      },
      callbacks: {
        onmessage: (message) => {
          if (closed) return;

          if (message?.setupComplete) {
            emitReadyOnce();
          }

          const content = message?.serverContent;
          if (!content) return;

          if (content.interimInputTranscription?.text) {
            onInterim?.(content.interimInputTranscription.text);
          }

          if (content.inputTranscription?.text) {
            if (content.inputTranscription.finished === false) {
              onInterim?.(content.inputTranscription.text);
            } else {
              onFinal?.(content.inputTranscription.text);
            }
          }

          if (content.turnComplete || content.generationComplete) {
            onTurnComplete?.();
          }
        },
        onerror: (errEvent) => {
          if (closed) return;
          const message =
            errEvent?.message ||
            errEvent?.error?.message ||
            'Gemini Live session error';
          onError?.(new Error(message));
        },
        onclose: (closeEvent) => {
          if (closed) return;
          closed = true;
          onClose?.(closeEvent);
        },
      },
    });
  } catch (err) {
    throw new AppError(
      502,
      `Failed to connect to Gemini Live API: ${err?.message || 'Upstream error'}`
    );
  }

  return {
    sendAudio(pcmBuffer) {
      if (closed || !session || !pcmBuffer?.length) return;
      session.sendRealtimeInput({
        audio: {
          data: pcmBuffer.toString('base64'),
          mimeType: PCM_MIME_TYPE,
        },
      });
    },
    endAudioStream() {
      if (closed || !session) return;
      session.sendRealtimeInput({ audioStreamEnd: true });
    },
    close() {
      if (closed) return;
      closed = true;
      try {
        session?.close();
      } catch {
        // Ignore errors during teardown
      }
    },
    isClosed() {
      return closed;
    },
  };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Streams a raw 16 kHz mono 16-bit PCM buffer to Gemini Live in 100 ms chunks,
 * signals end-of-stream, and collects the finalized transcript.
 */
export async function transcribePcmBuffer({
  pcmBuffer,
  languageHint = 'auto',
  timeoutMs = 60000,
}) {
  let latestFinal = '';
  let latestInterim = '';
  let session = null;
  let settled = false;
  let audioFinishedSending = false;

  return new Promise((resolve, reject) => {
    let timeoutHandle = null;
    let settleHandle = null;

    const cleanup = () => {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      if (settleHandle) clearTimeout(settleHandle);
      session?.close();
    };

    const finishSuccess = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve((latestFinal || latestInterim).trim());
    };

    const finishError = (err) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    };

    timeoutHandle = setTimeout(() => {
      finishError(
        new AppError(504, 'Transcription timed out while waiting for Gemini Live API.')
      );
    }, timeoutMs);

    const scheduleSettleIfReady = (waitMs = 400) => {
      if (!audioFinishedSending || settled) return;
      if (settleHandle) clearTimeout(settleHandle);
      settleHandle = setTimeout(finishSuccess, waitMs);
    };

    createGeminiLiveSession({
      languageHint,
      onReady: async () => {
        try {
          for (let offset = 0; offset < pcmBuffer.length; offset += CHUNK_SIZE_BYTES) {
            if (settled || session?.isClosed()) return;
            const chunk = pcmBuffer.subarray(
              offset,
              Math.min(offset + CHUNK_SIZE_BYTES, pcmBuffer.length)
            );
            session.sendAudio(chunk);
            await delay(CHUNK_PACE_MS);
          }

          if (settled || session?.isClosed()) return;
          audioFinishedSending = true;
          session.endAudioStream();
          // Fallback settle timer in case no explicit turnComplete arrives after trailing silence
          scheduleSettleIfReady(2500);
        } catch (err) {
          finishError(
            new AppError(502, `Error streaming audio to Gemini: ${err.message}`)
          );
        }
      },
      onInterim: (text) => {
        latestInterim = text;
      },
      onFinal: (text) => {
        latestFinal = text;
        latestInterim = '';
        if (audioFinishedSending) {
          scheduleSettleIfReady(400);
        }
      },
      onTurnComplete: () => {
        if (audioFinishedSending) {
          scheduleSettleIfReady(300);
        }
      },
      onError: (err) => {
        finishError(
          new AppError(502, `Gemini transcription failed: ${err.message}`)
        );
      },
      onClose: () => {
        if (settled) return;
        if (audioFinishedSending) {
          finishSuccess();
        } else {
          finishError(
            new AppError(502, 'Gemini session closed unexpectedly before transcription completed.')
          );
        }
      },
    })
      .then((createdSession) => {
        if (settled) {
          createdSession.close();
          return;
        }
        session = createdSession;
      })
      .catch(finishError);
  });
}
