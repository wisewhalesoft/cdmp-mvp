import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { X, ChevronLeft, ChevronRight, FileText, ExternalLink } from 'lucide-react';
import { getExtractionLogs } from '@/api/extraction-tasks';
import { formatDateTW, formatDuration } from '@/utils/date-utils';
import type { ExtractionLogResponse, ExtractionTriggeredBy } from '@cdmp/shared';

interface ExtractionLogDrawerProps {
  open: boolean;
  taskId: string;
  taskName: string;
  onClose: () => void;
}

const LOG_PAGE_SIZE = 5;

const statusConfig: Record<string, { dot: string; bg: string; text: string; animate?: boolean }> = {
  running: { dot: 'bg-blue-500', bg: 'bg-blue-100', text: 'text-blue-700', animate: true },
  completed: { dot: 'bg-green-500', bg: 'bg-green-100', text: 'text-green-700' },
  failed: { dot: 'bg-red-500', bg: 'bg-red-100', text: 'text-red-700' },
};

const triggeredByLabels: Record<ExtractionTriggeredBy, string> = {
  schedule: '排程',
  manual: '手動',
  retry: '重新執行',
};

function LogStatusBadge({ status }: { status: string }) {
  const c = statusConfig[status] ?? statusConfig.completed;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium rounded ${c.bg} ${c.text}`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${c.dot} ${c.animate ? 'animate-pulse' : ''}`}
      />
      {status}
    </span>
  );
}

function LogCard({ log, taskId }: { log: ExtractionLogResponse; taskId: string }) {
  const isFailed = log.status === 'failed';
  const isCompleted = log.status === 'completed';
  const showPreview = isCompleted && log.extractedCount > 0;

  return (
    <div
      data-testid={`log-card-${log.id}`}
      className={`border rounded-lg p-4 ${isFailed ? 'border-red-200' : 'border-gray-200'}`}
    >
      <div className="flex items-center justify-between mb-2">
        <LogStatusBadge status={log.status} />
        <span className="text-xs text-gray-400">{triggeredByLabels[log.triggeredBy]}</span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
        <div>
          <span className="text-gray-400">開始時間：</span>
          {formatDateTW(log.startedAt)}
        </div>
        <div>
          <span className="text-gray-400">結束時間：</span>
          {log.finishedAt ? formatDateTW(log.finishedAt) : '-'}
        </div>
        <div>
          <span className="text-gray-400">執行時間：</span>
          {formatDuration(log.durationMs)}
        </div>
        <div>
          <span className="text-gray-400">擷取筆數：</span>
          {log.extractedCount.toLocaleString()} 筆
        </div>
      </div>
      {isFailed && log.errorMessage && (
        <div className="mt-2 p-2 bg-red-50 rounded text-xs text-red-600">
          {log.errorMessage}
        </div>
      )}
      {showPreview && (
        <div className="mt-3 pt-3 border-t border-gray-200">
          <Link
            to={`/extraction-tasks/${taskId}/raw-data`}
            className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            預覽資料
          </Link>
        </div>
      )}
    </div>
  );
}

export function ExtractionLogDrawer({ open, taskId, taskName, onClose }: ExtractionLogDrawerProps) {
  const [logs, setLogs] = useState<ExtractionLogResponse[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(false);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getExtractionLogs(taskId, { page, limit: LOG_PAGE_SIZE });
      setLogs(result.data);
      setTotal(result.meta.total);
      setTotalPages(result.meta.totalPages);
    } catch {
      // Graceful degradation
    } finally {
      setLoading(false);
    }
  }, [taskId, page]);

  useEffect(() => {
    if (open) {
      setPage(1);
    }
  }, [open, taskId]);

  useEffect(() => {
    if (open) {
      fetchLogs();
    }
  }, [open, fetchLogs]);

  if (!open) return null;

  const startIndex = (page - 1) * LOG_PAGE_SIZE + 1;
  const endIndex = Math.min(page * LOG_PAGE_SIZE, total);

  return (
    <>
      {/* Backdrop */}
      <div
        data-testid="log-drawer-backdrop"
        className="fixed inset-0 bg-black/30 z-40"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed top-0 right-0 h-full w-[480px] bg-white shadow-xl z-50 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0">
          <h3 className="text-base font-semibold text-gray-800">
            擷取日誌 — <span>{taskName}</span>
          </h3>
          <button
            onClick={onClose}
            aria-label="關閉"
            className="p-1 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {loading ? (
            <div className="text-center text-gray-400 py-12">載入中...</div>
          ) : logs.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-gray-400 py-12">
              <div className="text-center">
                <FileText className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                <p className="text-sm">此任務尚無執行紀錄</p>
              </div>
            </div>
          ) : (
            logs.map((log) => <LogCard key={log.id} log={log} taskId={taskId} />)
          )}
        </div>

        {/* Footer Pagination */}
        {total > 0 && (
          <div className="px-6 py-3 border-t border-gray-200 text-sm text-gray-500 flex items-center justify-between shrink-0">
            <span>顯示 {startIndex}-{endIndex} 筆，共 {total} 筆</span>
            <div className="flex items-center gap-2">
              <button
                aria-label="上一頁"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-2 py-1 border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-40"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs">{page} / {totalPages}</span>
              <button
                aria-label="下一頁"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="px-2 py-1 border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-40"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
