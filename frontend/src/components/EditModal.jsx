import { useEffect, useState } from 'react';

export default function EditModal({ item, onClose, onSave }) {
  const [text, setText] = useState(item?.text || '');
  const [languageHint, setLanguageHint] = useState(item?.language_hint || 'auto');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setText(item?.text || '');
    setLanguageHint(item?.language_hint || 'auto');
  }, [item]);

  useEffect(() => {
    if (!item) return undefined;
    function handleKeyDown(e) {
      if (e.key === 'Escape' && !isSubmitting) {
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [item, isSubmitting, onClose]);

  if (!item) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await onSave(item.id, { text: trimmed, language_hint: languageHint });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-modal-title"
      className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/50 p-4"
    >
      <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl sm:p-6">
        <h2 id="edit-modal-title" className="text-lg font-semibold text-slate-900">
          Edit Transcription
        </h2>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label
              htmlFor="edit-language"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Language
            </label>
            <select
              id="edit-language"
              value={languageHint}
              disabled={isSubmitting}
              onChange={(e) => setLanguageHint(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="auto">Auto (Hindi + English)</option>
              <option value="hi-IN">Hindi (hi-IN)</option>
              <option value="en-IN">English (en-IN)</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="edit-text"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Transcript Text
            </label>
            <textarea
              id="edit-text"
              rows={5}
              required
              disabled={isSubmitting}
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="w-full rounded-lg border border-slate-300 p-3 text-base leading-relaxed text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!text.trim() || isSubmitting}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
