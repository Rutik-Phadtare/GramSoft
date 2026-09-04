import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Consistent pager for every list view backed by the backend's
 * { page, limit, total, totalPages } shape (see backend/src/utils/paginate.js).
 */
export default function Pagination({ pagination, onPageChange }) {
  if (!pagination || pagination.total === 0) return null;

  const { page, limit, total, totalPages } = pagination;
  const start = (page - 1) * limit + 1;
  const end = Math.min(page * limit, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-t border-line text-sm">
      <span className="text-ink-muted">
        {start}–{end} of {total}
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="p-1.5 rounded-md text-ink-soft hover:bg-canvas disabled:opacity-40 disabled:pointer-events-none"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-ink-muted px-1 tabular-nums whitespace-nowrap">
          Page {page} of {totalPages}
        </span>
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="p-1.5 rounded-md text-ink-soft hover:bg-canvas disabled:opacity-40 disabled:pointer-events-none"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
