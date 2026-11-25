export default function ToastContainer({ toasts, onDismiss }) {
  if (!toasts.length) return null;

  return (
    <div
      className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-full max-w-sm flex-col gap-2 pl-4 sm:pl-0"
      aria-live="polite"
    >
      {toasts.map((toast) => {
        const isError = toast.type === 'error';
        const isInfo = toast.type === 'info';
        const badgeStyle = isError
          ? 'border-red-200 bg-red-50 text-red-900'
          : isInfo
            ? 'border-indigo-200 bg-indigo-50 text-indigo-900'
            : 'border-emerald-200 bg-emerald-50 text-emerald-900';

        return (
          <div
            key={toast.id}
            role="status"
            className={`pointer-events-auto flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-sm shadow-md ${badgeStyle}`}
          >
            <span className="leading-snug">{toast.message}</span>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              aria-label="Dismiss notification"
              className="rounded p-0.5 text-xs font-medium opacity-70 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              ✕
            </button>
          </div>
        );
      })}
    </div>
  );
}
