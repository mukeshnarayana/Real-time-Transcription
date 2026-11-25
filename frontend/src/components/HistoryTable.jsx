import { useCallback, useEffect, useState } from 'react';
import {
  deleteTranscription,
  listTranscriptions,
  updateTranscription,
} from '../api/client.js';
import ConfirmDialog from './ConfirmDialog.jsx';
import EditModal from './EditModal.jsx';

const SORT_OPTIONS = {
  newest: { sort: 'created_at', order: 'desc' },
  oldest: { sort: 'created_at', order: 'asc' },
  updated: { sort: 'updated_at', order: 'desc' },
};

const TRUNCATE_LIMIT = 100;

export default function HistoryTable({ refreshTrigger, onToast }) {
  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0,
  });
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [sortOption, setSortOption] = useState('newest');

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedIds, setExpandedIds] = useState(() => new Set());
  const [editingItem, setEditingItem] = useState(null);
  const [deletingItem, setDeletingItem] = useState(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchInput);
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const loadHistory = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    const { sort, order } = SORT_OPTIONS[sortOption] || SORT_OPTIONS.newest;

    try {
      const res = await listTranscriptions({
        page,
        limit: 10,
        q: debouncedQuery,
        sort,
        order,
      });
      setRows(res?.data || []);
      setPagination(
        res?.pagination || { page: 1, limit: 10, total: 0, totalPages: 0 }
      );
    } catch (err) {
      setError(err.message || 'Failed to load transcriptions.');
    } finally {
      setIsLoading(false);
    }
  }, [page, debouncedQuery, sortOption]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory, refreshTrigger]);

  function toggleExpand(id) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSaveEdit(id, payload) {
    try {
      const res = await updateTranscription(id, payload);
      const updated = res?.data;
      if (updated) {
        setRows((prev) => prev.map((row) => (row.id === id ? updated : row)));
      }
      setEditingItem(null);
      onToast('success', 'Transcription updated.');
    } catch (err) {
      onToast('error', err.message || 'Failed to update transcription.');
    }
  }

  async function handleConfirmDelete() {
    if (!deletingItem) return;
    const targetId = deletingItem.id;
    const isLastOnPage = rows.length === 1 && page > 1;

    try {
      await deleteTranscription(targetId);
      setDeletingItem(null);
      onToast('success', 'Transcription deleted.');
      if (isLastOnPage) {
        setPage((p) => Math.max(1, p - 1));
      } else {
        loadHistory();
      }
    } catch (err) {
      onToast('error', err.message || 'Failed to delete transcription.');
    }
  }

  function renderTextCell(row) {
    const isLong = row.text.length > TRUNCATE_LIMIT;
    const isExpanded = expandedIds.has(row.id);
    const displayText =
      isLong && !isExpanded
        ? `${row.text.slice(0, TRUNCATE_LIMIT)}...`
        : row.text;

    return isLong ? (
      <button
        type="button"
        onClick={() => toggleExpand(row.id)}
        className="text-left text-slate-900 hover:text-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        title={isExpanded ? 'Click to collapse' : 'Click to expand'}
      >
        {displayText}
      </button>
    ) : (
      <span className="text-slate-900">{displayText}</span>
    );
  }

  const totalPages = pagination.totalPages || 0;

  return (
    <section className="mt-8 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold text-slate-900">History</h2>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            type="search"
            aria-label="Search transcriptions"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search..."
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 sm:w-56"
          />

          <select
            aria-label="Sort transcriptions"
            value={sortOption}
            onChange={(e) => {
              setSortOption(e.target.value);
              setPage(1);
            }}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 sm:w-44"
          >
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="updated">Recently updated</option>
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3 py-4" aria-busy="true">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className="h-12 animate-pulse rounded-lg bg-slate-100"
            />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-center">
          <p className="text-sm text-red-800">{error}</p>
          <button
            type="button"
            onClick={loadHistory}
            className="mt-3 rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            Retry
          </button>
        </div>
      ) : rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-500">
          {debouncedQuery
            ? 'No matching transcriptions found.'
            : 'No transcriptions yet. Record something above!'}
        </p>
      ) : (
        <>
          {/* Mobile stacked cards */}
          <div className="space-y-3 md:hidden">
            {rows.map((row) => (
              <article
                key={row.id}
                className="rounded-lg border border-slate-200 bg-slate-50/50 p-4"
              >
                <div className="mb-2 text-sm leading-relaxed">
                  {renderTextCell(row)}
                </div>
                <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span className="rounded bg-slate-200 px-2 py-0.5 font-medium text-slate-700">
                    {row.language_hint}
                  </span>
                  <span className="rounded bg-indigo-50 px-2 py-0.5 font-medium text-indigo-700">
                    {row.source}
                  </span>
                  <span>{new Date(row.created_at).toLocaleString()}</span>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingItem(row)}
                    className="rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeletingItem(row)}
                    className="rounded-md border border-red-200 bg-white px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500"
                  >
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="py-2.5 pr-4">Text</th>
                  <th className="py-2.5 pr-4">Lang</th>
                  <th className="py-2.5 pr-4">Source</th>
                  <th className="py-2.5 pr-4">Date</th>
                  <th className="py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => (
                  <tr key={row.id} className="align-top hover:bg-slate-50/70">
                    <td className="max-w-md py-3 pr-4 leading-relaxed">
                      {renderTextCell(row)}
                    </td>
                    <td className="whitespace-nowrap py-3 pr-4 text-slate-600">
                      {row.language_hint}
                    </td>
                    <td className="whitespace-nowrap py-3 pr-4">
                      <span className="inline-block rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700">
                        {row.source}
                      </span>
                    </td>
                    <td className="whitespace-nowrap py-3 pr-4 text-xs text-slate-500">
                      {new Date(row.created_at).toLocaleString()}
                    </td>
                    <td className="whitespace-nowrap py-3 text-right">
                      <div className="inline-flex gap-2">
                        <button
                          type="button"
                          onClick={() => setEditingItem(row)}
                          className="rounded px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingItem(row)}
                          className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-4 text-sm">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              &lt; Prev
            </button>

            <span className="text-slate-600">
              Page {pagination.page} of {Math.max(1, totalPages)}
            </span>

            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next &gt;
            </button>
          </div>
        </>
      )}

      <EditModal
        item={editingItem}
        onClose={() => setEditingItem(null)}
        onSave={handleSaveEdit}
      />

      <ConfirmDialog
        open={Boolean(deletingItem)}
        title="Delete this transcription?"
        onCancel={() => setDeletingItem(null)}
        onConfirm={handleConfirmDelete}
      />
    </section>
  );
}
