import { useCallback, useEffect, useRef, useState } from 'react';
import { subscribeSlowBackend } from './api/client.js';
import Header from './components/Header.jsx';
import HistoryTable from './components/HistoryTable.jsx';
import RecorderCard from './components/RecorderCard.jsx';
import ToastContainer from './components/Toast.jsx';
import UploadCard from './components/UploadCard.jsx';

export default function App() {
  const [activeTab, setActiveTab] = useState('live'); // live | upload
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [toasts, setToasts] = useState([]);
  const [backendWaking, setBackendWaking] = useState(false);
  const toastTimersRef = useRef(new Map());

  const dismissToast = useCallback((id) => {
    const timer = toastTimersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      toastTimersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (type, message) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev, { id, type, message }]);
      const timer = setTimeout(() => {
        dismissToast(id);
      }, 4000);
      toastTimersRef.current.set(id, timer);
    },
    [dismissToast]
  );

  useEffect(() => {
    const timers = toastTimersRef.current;
    const unsubscribe = subscribeSlowBackend((isWaking) => {
      setBackendWaking(isWaking);
    });
    return () => {
      unsubscribe();
      for (const timer of timers.values()) {
        clearTimeout(timer);
      }
      timers.clear();
    };
  }, []);

  const refreshHistory = useCallback(() => {
    setRefreshTrigger((n) => n + 1);
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 py-6 sm:py-8">
      <main className="mx-auto max-w-4xl px-4">
        <Header />

        {backendWaking && (
          <div
            role="status"
            className="mb-4 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-900"
          >
            Backend is waking up, please wait...
          </div>
        )}

        <div role="tablist" aria-label="Transcription mode" className="mb-4 flex gap-2">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'live'}
            onClick={() => setActiveTab('live')}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
              activeTab === 'live'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            Live mic
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'upload'}
            onClick={() => setActiveTab('upload')}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
              activeTab === 'upload'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            Upload audio
          </button>
        </div>

        {activeTab === 'live' ? (
          <RecorderCard onSaved={refreshHistory} onToast={addToast} />
        ) : (
          <UploadCard onSaved={refreshHistory} onToast={addToast} />
        )}

        <HistoryTable refreshTrigger={refreshTrigger} onToast={addToast} />
      </main>

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
