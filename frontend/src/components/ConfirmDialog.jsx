import { useEffect, useState } from 'react';

export default function ConfirmDialog({
  open,
  title = 'Delete this transcription?',
  description = 'This action cannot be undone.',
  onCancel,
  onConfirm,
}) {
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    function handleKeyDown(e) {
      if (e.key === 'Escape' && !isDeleting) {
        onCancel();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, isDeleting, onCancel]);

  if (!open) return null;

  async function handleConfirm() {
    if (isDeleting) return;
    setIsDeleting(true);
    try {
      await onConfirm();
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/50 p-4"
    >
      <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl sm:p-6">
        <h2 id="confirm-dialog-title" className="text-lg font-semibold text-slate-900">
          {title}
        </h2>
        <p className="mt-1.5 text-sm text-slate-600">{description}</p>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isDeleting}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isDeleting}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isDeleting ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}
