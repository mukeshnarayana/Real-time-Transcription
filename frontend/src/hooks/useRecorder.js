import { useCallback, useEffect, useRef, useState } from 'react';
import { WS_URL } from '../api/client.js';

function mapMicError(err) {
  if (!err) return 'Could not access microphone.';
  if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
    return 'Microphone permission denied. Please allow mic access in your browser settings.';
  }
  if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
    return 'No microphone found. Connect a microphone or use the Upload audio tab.';
  }
  if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
    return 'Microphone is busy or unavailable in another application.';
  }
  return err.message || 'Could not access microphone.';
}

export function useRecorder({ onError } = {}) {
  const [status, setStatus] = useState('idle'); // idle | connecting | recording | stopping
  const [elapsedSec, setElapsedSec] = useState(0);
  const [interimText, setInterimText] = useState('');
  const [finalText, setFinalText] = useState('');

  const wsRef = useRef(null);
  const audioContextRef = useRef(null);
  const streamRef = useRef(null);
  const sourceNodeRef = useRef(null);
  const workletNodeRef = useRef(null);
  const gainNodeRef = useRef(null);
  const timerRef = useRef(null);
  const stopTimeoutRef = useRef(null);
  const intentionalStopRef = useRef(false);
  const isReadyRef = useRef(false);
  const finalTextRef = useRef('');
  const sessionPrefixRef = useRef('');
  const onErrorRef = useRef(onError);

  useEffect(() => {
    finalTextRef.current = finalText;
  }, [finalText]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const teardownAudio = useCallback(() => {
    stopTimer();

    if (workletNodeRef.current) {
      try {
        workletNodeRef.current.port.postMessage('flush');
        workletNodeRef.current.port.onmessage = null;
        workletNodeRef.current.disconnect();
      } catch {
        // Ignore teardown errors
      }
      workletNodeRef.current = null;
    }

    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.disconnect();
      } catch {
        // Ignore
      }
      sourceNodeRef.current = null;
    }

    if (gainNodeRef.current) {
      try {
        gainNodeRef.current.disconnect();
      } catch {
        // Ignore
      }
      gainNodeRef.current = null;
    }

    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
  }, [stopTimer]);

  const teardownAll = useCallback(() => {
    if (stopTimeoutRef.current) {
      clearTimeout(stopTimeoutRef.current);
      stopTimeoutRef.current = null;
    }
    isReadyRef.current = false;
    teardownAudio();

    if (wsRef.current) {
      const ws = wsRef.current;
      wsRef.current = null;
      ws.onopen = null;
      ws.onmessage = null;
      ws.onerror = null;
      ws.onclose = null;
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        try {
          ws.close();
        } catch {
          // Ignore
        }
      }
    }

    setInterimText('');
    setStatus('idle');
  }, [teardownAudio]);

  useEffect(() => {
    return () => {
      intentionalStopRef.current = true;
      teardownAll();
    };
  }, [teardownAll]);

  const start = useCallback(
    async (languageHint = 'auto') => {
      if (status !== 'idle') return;

      if (!WS_URL) {
        onErrorRef.current?.('VITE_WS_URL is not configured. Copy .env.example to .env.');
        return;
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        onErrorRef.current?.(
          'Microphone not available. Use HTTPS or try the Upload audio tab.'
        );
        return;
      }

      intentionalStopRef.current = false;
      isReadyRef.current = false;
      sessionPrefixRef.current = finalTextRef.current.trim();
      setElapsedSec(0);
      setInterimText('');
      setStatus('connecting');

      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
          },
        });
        streamRef.current = stream;
      } catch (err) {
        teardownAll();
        onErrorRef.current?.(mapMicError(err));
        return;
      }

      let audioContext;
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        audioContext = new AudioCtx();
        audioContextRef.current = audioContext;

        if (audioContext.state === 'suspended') {
          await audioContext.resume();
        }
        await audioContext.audioWorklet.addModule('/pcm-worklet.js');

        const source = audioContext.createMediaStreamSource(stream);
        const worklet = new AudioWorkletNode(audioContext, 'pcm-worklet');
        const silentGain = audioContext.createGain();
        silentGain.gain.value = 0;

        source.connect(worklet);
        worklet.connect(silentGain);
        silentGain.connect(audioContext.destination);

        sourceNodeRef.current = source;
        workletNodeRef.current = worklet;
        gainNodeRef.current = silentGain;

        worklet.port.onmessage = (event) => {
          const ws = wsRef.current;
          if (isReadyRef.current && ws && ws.readyState === WebSocket.OPEN) {
            ws.send(event.data);
          }
        };
      } catch (err) {
        teardownAll();
        onErrorRef.current?.(err?.message || 'Failed to initialize audio capture.');
        return;
      }

      const ws = new WebSocket(WS_URL);
      ws.binaryType = 'arraybuffer';
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            type: 'start',
            language_hint: languageHint,
          })
        );
      };

      ws.onmessage = (event) => {
        let msg;
        try {
          msg = JSON.parse(event.data);
        } catch {
          return;
        }

        if (msg.type === 'ready') {
          isReadyRef.current = true;
          setStatus('recording');
          stopTimer();
          timerRef.current = setInterval(() => {
            setElapsedSec((prev) => prev + 1);
          }, 1000);
        } else if (msg.type === 'interim') {
          setInterimText(msg.text || '');
        } else if (msg.type === 'final') {
          // SMART mode emits the cumulative self-corrected transcript for the active session
          const chunk = (msg.text || '').trim();
          if (chunk) {
            const prefix = sessionPrefixRef.current;
            setFinalText(prefix ? `${prefix} ${chunk}` : chunk);
          }
          setInterimText('');
        } else if (msg.type === 'error') {
          intentionalStopRef.current = true;
          onErrorRef.current?.(msg.message || 'Transcription error.');
          teardownAll();
        } else if (msg.type === 'closed') {
          const wasIntentional = intentionalStopRef.current;
          teardownAll();
          if (!wasIntentional) {
            onErrorRef.current?.('Connection lost');
          }
        }
      };

      ws.onerror = () => {
        if (!intentionalStopRef.current) {
          onErrorRef.current?.('Connection lost');
        }
        intentionalStopRef.current = true;
        teardownAll();
      };

      ws.onclose = () => {
        const wasIntentional = intentionalStopRef.current;
        if (wsRef.current === ws) {
          teardownAll();
          if (!wasIntentional) {
            onErrorRef.current?.('Connection lost');
          }
        }
      };
    },
    [status, stopTimer, teardownAll]
  );

  const stop = useCallback(() => {
    if (status !== 'recording' && status !== 'connecting') return;

    intentionalStopRef.current = true;
    isReadyRef.current = false;
    setStatus('stopping');
    teardownAudio();

    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify({ type: 'stop' }));
      } catch {
        teardownAll();
        return;
      }

      // Wait briefly for the final transcript & server 'closed' frame before forcing teardown
      stopTimeoutRef.current = setTimeout(() => {
        teardownAll();
      }, 3500);
    } else {
      teardownAll();
    }
  }, [status, teardownAll, teardownAudio]);

  const clear = useCallback(() => {
    setFinalText('');
    setInterimText('');
    setElapsedSec(0);
  }, []);

  return {
    status,
    elapsedSec,
    interimText,
    finalText,
    setFinalText,
    start,
    stop,
    clear,
  };
}
