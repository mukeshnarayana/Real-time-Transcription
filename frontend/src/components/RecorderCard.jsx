import { useState } from 'react';
import { createTranscription } from '../api/client.js';
import { useRecorder } from '../hooks/useRecorder.js';

function formatTimer(totalSec) {
  const mins = String(Math.floor(totalSec / 60)).padStart(2, '0');
  const secs = String(totalSec % 60).padStart(2, '0');
  return `${mins}:${secs}`;
}

export default function RecorderCard({ onSaved, onToast }) {
  const [languageHint, setLanguageHint] = useState('auto');
  const [isSaving, setIsSaving] = useState(false);

  const {
    status,
    elapsedSec,
    interimText,
    finalText,
    setFinalText,
    start,
    stop,
    clear,
  } = useRecorder({
    onError: (msg) => onToast('error', msg),
  });

  const isRecording = status === 'recording';
  const isBusy = status === 'connecting' || status === 'stopping';
  const hasContent = finalText.trim().length > 0 || interimText.trim().length > 0;

  async function handleSave() {
    const trimmed = finalText.trim();
    if (!trimmed || isRecording || isBusy) return;

    setIsSaving(true);
    try {
      await createTranscription({
        text: trimmed,
        language_hint: languageHint,
        source: 'live',
        duration_sec: elapsedSec > 0 ? elapsedSec : null,
      });
      onToast('success', 'Transcription saved to history.');
      onSaved?.();
    } catch (err) {
      onToast('error', err.message || 'Failed to save transcription.');
    } finally {
      setIsSaving(false);
    }
  }

  function handleRecordClick() {
    if (isRecording) {
      stop();
    } else if (status === 'idle') {
      start(languageHint);
    }
  }

  let statusLabel = 'Idle';
  if (status === 'connecting') statusLabel = 'Connecting...';
  else if (status === 'recording') statusLabel = `Listening ${formatTimer(elapsedSec)}`;
  else if (status === 'stopping') statusLabel = 'Finalizing...';

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <label
          htmlFor="live-language"
          className="text-sm font-medium text-slate-700"
        >
          Language
        </label>
        <select
          id="live-language"
          value={languageHint}
          disabled={status !== 'idle'}
          onChange={(e) => setLanguageHint(e.target.value)}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-100 sm:w-64"
        >
          <option value="auto">Auto (Hindi + English)</option>
          <option value="hi-IN">Hindi (hi-IN)</option>
          <option value="en-IN">English (en-IN)</option>
        </select>
      </div>

      <div className="mb-6 flex flex-col items-center justify-center gap-3">
        <div className="relative flex items-center justify-center">
          {isRecording && (
            <span
              aria-hidden="true"
              className="absolute inline-flex h-24 w-24 animate-ping rounded-full bg-red-400 opacity-40"
            />
          )}
          <button
            type="button"
            onClick={handleRecordClick}
            disabled={isBusy}
            aria-label={isRecording ? 'Stop recording' : 'Start recording'}
            className={`relative z-10 flex h-24 w-24 items-center justify-center rounded-full text-sm font-semibold text-white shadow-sm transition focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${
              isRecording
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-indigo-600 hover:bg-indigo-700'
            }`}
          >
            {status === 'connecting'
              ? 'Wait...'
              : status === 'stopping'
                ? 'Stopping'
                : isRecording
                  ? 'Stop'
                  : 'Start'}
          </button>
        </div>

        <p
          aria-live="polite"
          className={`text-sm font-medium ${
            isRecording ? 'text-red-600' : 'text-slate-600'
          }`}
        >
          Status: {statusLabel}
        </p>
      </div>

      <div className="mb-4">
        <label
          htmlFor="live-transcript-box"
          className="mb-1.5 block text-sm font-medium text-slate-700"
        >
          Transcript
        </label>

        {status === 'idle' ? (
          <textarea
            id="live-transcript-box"
            rows={5}
            value={finalText}
            onChange={(e) => setFinalText(e.target.value)}
            placeholder="Press Start and speak in Hindi, English, or a mix of both..."
            className="w-full rounded-lg border border-slate-300 bg-slate-50/50 p-3 text-base leading-relaxed text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        ) : (
          <div
            id="live-transcript-box"
            aria-live="polite"
            className="min-h-[136px] w-full rounded-lg border border-slate-300 bg-slate-50/60 p-3 text-base leading-relaxed"
          >
            {!hasContent ? (
              <span className="text-slate-400">Listening for speech...</span>
            ) : (
              <>
                {finalText && (
                  <span className="text-slate-900">{finalText} </span>
                )}
                {interimText && (
                  <span className="text-slate-400 italic">{interimText}</span>
                )}
              </>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={clear}
          disabled={status !== 'idle' || !finalText}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Clear
        </button>

        <button
          type="button"
          onClick={handleSave}
          disabled={status !== 'idle' || !finalText.trim() || isSaving}
          className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSaving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </section>
  );
}
