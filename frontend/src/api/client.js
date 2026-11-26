const API_URL = (import.meta.env.VITE_API_URL || '').trim().replace(/\/+$/, '');
export const WS_URL = (import.meta.env.VITE_WS_URL || '').trim().replace(/\/+$/, '');

const SLOW_THRESHOLD_MS = 5000;
const slowListeners = new Set();
let activeSlowRequests = 0;

export function subscribeSlowBackend(listener) {
  slowListeners.add(listener);
  return () => slowListeners.delete(listener);
}

function notifySlowChange(isWaking) {
  for (const listener of slowListeners) {
    listener(isWaking);
  }
}

async function request(path, options = {}) {
  if (!API_URL) {
    throw new Error('VITE_API_URL is not configured. Copy .env.example to .env.');
  }

  let markedSlow = false;
  const slowTimer = setTimeout(() => {
    markedSlow = true;
    activeSlowRequests += 1;
    if (activeSlowRequests === 1) {
      notifySlowChange(true);
    }
  }, SLOW_THRESHOLD_MS);

  try {
    const response = await fetch(`${API_URL}${path}`, options);

    if (response.status === 204) {
      return null;
    }

    let payload = null;
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      payload = await response.json();
    }

    if (!response.ok) {
      const message =
        payload?.error?.message ||
        `Request failed (${response.status} ${response.statusText})`;
      const err = new Error(message);
      err.status = response.status;
      err.details = payload?.error?.details;
      throw err;
    }

    return payload;
  } catch (err) {
    if (err instanceof TypeError) {
      const networkErr = new Error(
        'Cannot reach the backend server. Please check that it is running.'
      );
      networkErr.isNetworkError = true;
      throw networkErr;
    }
    throw err;
  } finally {
    clearTimeout(slowTimer);
    if (markedSlow) {
      activeSlowRequests = Math.max(0, activeSlowRequests - 1);
      if (activeSlowRequests === 0) {
        notifySlowChange(false);
      }
    }
  }
}

export function listTranscriptions({
  page = 1,
  limit = 10,
  q = '',
  sort = 'created_at',
  order = 'desc',
} = {}) {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
    sort,
    order,
  });
  if (q && q.trim()) {
    params.set('q', q.trim());
  }
  return request(`/api/transcriptions?${params.toString()}`);
}

export function createTranscription({ text, language_hint, source, duration_sec }) {
  return request('/api/transcriptions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, language_hint, source, duration_sec }),
  });
}

export function updateTranscription(id, { text, language_hint }) {
  return request(`/api/transcriptions/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, language_hint }),
  });
}

export function deleteTranscription(id) {
  return request(`/api/transcriptions/${id}`, {
    method: 'DELETE',
  });
}

export function transcribeAudioFile({ file, language_hint = 'auto', save = false }) {
  const formData = new FormData();
  formData.append('audio', file);
  formData.append('language_hint', language_hint);
  formData.append('save', String(Boolean(save)));

  return request('/api/transcribe/file', {
    method: 'POST',
    body: formData,
  });
}
