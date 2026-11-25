import { useState } from 'react';
import { transcribeAudioFile } from '../api/client.js';

const FFMPEG_HINT = 'ffmpeg -i input.m4a -ar 16000 -ac 1 -c:a pcm_s16le output.wav';

export default function UploadCard({ onSaved, onToast }) {
  const [file, setFile] = useState(null);
  const [languageHint, setLanguageHint] = useState('auto');
  const [saveToHistory, setSaveToHistory] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [errorInfo, setErrorInfo] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!file || isUploading) return;

    setIsUploading(true);
    setErrorInfo(null);

    try {
      const result = await transcribeAudioFile({
        file,
        language_hint: languageHint,
        save: saveToHistory,
      });

      const text = result?.data?.text || '';
      setTranscript(text);

      if (result?.data?.saved) {
        onToast('success', 'Audio transcribed and saved to history.');
        onSaved?.();
      } else {
        onToast('success', 'Audio transcribed.');
      }
    } catch (err) {
      setErrorInfo({
        message: err.message || 'Failed to transcribe audio file.',
        isUnsupportedFormat: err.status === 415,
      });
      onToast('error', err.message || 'File transcription failed.');
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <label
            htmlFor="upload-language"
            className="text-sm font-medium text-slate-700"
          >
            Language
          </label>
          <select
            id="upload-language"
            value={languageHint}
            disabled={isUploading}
            onChange={(e) => setLanguageHint(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-100 sm:w-64"
          >
            <option value="auto">Auto (Hindi + English)</option>
            <option value="hi-IN">Hindi (hi-IN)</option>
            <option value="en-IN">English (en-IN)</option>
          </select>
        </div>

        <div>
          <label
            htmlFor="wav-file-input"
            className="mb-1.5 block text-sm font-medium text-slate-700"
          >
            WAV Audio File (16-bit PCM, mono, 16 kHz, max 10 MB)
          </label>
          <input
            id="wav-file-input"
            type="file"
            accept=".wav,audio/wav"
            disabled={isUploading}
            onChange={(e) => {
              setFile(e.target.files?.[0] || null);
              setErrorInfo(null);
            }}
            className="block w-full cursor-pointer rounded-lg border border-slate-300 bg-slate-50 text-sm text-slate-700 file:mr-4 file:cursor-pointer file:border-0 file:bg-indigo-50 file:px-4 file:py-2.5 file:text-sm file:font-semibold file:text-indigo-700 hover:file:bg-indigo-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={saveToHistory}
              disabled={isUploading}
              onChange={(e) => setSaveToHistory(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            Save to history
          </label>

          <button
            type="submit"
            disabled={!file || isUploading}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isUploading && (
              <span
                aria-hidden="true"
                className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"
              />
            )}
            {isUploading ? 'Transcribing...' : 'Transcribe'}
          </button>
        </div>
      </form>

      {errorInfo && (
        <div
          role="alert"
          className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900"
        >
          <p className="font-medium">{errorInfo.message}</p>
          {errorInfo.isUnsupportedFormat && (
            <p className="mt-2 text-xs text-red-800">
              Convert your audio first with:{' '}
              <code className="rounded bg-red-100 px-1.5 py-0.5 font-mono">
                {FFMPEG_HINT}
              </code>
            </p>
          )}
        </div>
      )}

      <div className="mt-5">
        <label
          htmlFor="upload-transcript-box"
          className="mb-1.5 block text-sm font-medium text-slate-700"
        >
          Result
        </label>
        <textarea
          id="upload-transcript-box"
          rows={4}
          readOnly
          value={transcript}
          placeholder="Uploaded audio transcript will appear here..."
          className="w-full rounded-lg border border-slate-300 bg-slate-50 p-3 text-base leading-relaxed text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>
    </section>
  );
}
