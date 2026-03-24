import { useState, useEffect, useCallback } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import {
  Users,
  Database,
  ArrowDownToLine,
  Workflow,
  LogOut,
  ArrowLeft,
  ChevronRight,
  Pencil,
  Diff,
  Rocket,
  History,
  CheckCircle,
} from 'lucide-react';
import { clearAuth, getUser } from '@/stores/auth-store';
import { logout } from '@/api/auth';
import {
  getPipelineVersions,
  getPipelines,
  publishPipelineVersion,
  rollbackPipelineVersion,
} from '@/api/etl-pipelines';
import { formatDateTW } from '@/utils/date-utils';
import type {
  PipelineVersionListItem,
  PipelineVersionStatus,
  EtlPipelineStatus,
} from '@cdmp/shared';
import { VersionDiffView } from './version-diff-view';
import { RollbackConfirmDialog } from './rollback-confirm-dialog';
import { PublishConfirmDialog } from './publish-confirm-dialog';

function VersionStatusBadge({ status }: { status: PipelineVersionStatus }) {
  const config: Record<PipelineVersionStatus, { bg: string; text: string }> = {
    draft: { bg: 'bg-gray-100', text: 'text-gray-600' },
    testing: { bg: 'bg-amber-50', text: 'text-amber-700' },
    published: { bg: 'bg-green-50', text: 'text-green-700' },
  };
  const c = config[status];
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${c.bg} ${c.text}`}
      data-testid={`version-status-${status}`}
    >
      {status}
    </span>
  );
}

function PipelineStatusBadge({ status }: { status: EtlPipelineStatus }) {
  const config: Record<EtlPipelineStatus, { bg: string; text: string }> = {
    draft: { bg: 'bg-gray-100', text: 'text-gray-600' },
    active: { bg: 'bg-green-50', text: 'text-green-700' },
    running: { bg: 'bg-blue-50', text: 'text-blue-700' },
    failed: { bg: 'bg-red-50', text: 'text-red-700' },
    disabled: { bg: 'bg-gray-100', text: 'text-gray-600' },
  };
  const c = config[status] ?? { bg: 'bg-gray-100', text: 'text-gray-600' };
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${c.bg} ${c.text}`}
    >
      {status}
    </span>
  );
}

interface ToastState {
  title: string;
  message: string;
}

export function PipelineVersionsPage() {
  const { id: pipelineId } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const user = getUser();

  const navState = location.state as {
    pipelineName?: string;
    pipelineStatus?: EtlPipelineStatus;
  } | null;

  const [pipelineName, setPipelineName] = useState(navState?.pipelineName ?? '');
  const [pipelineStatus, setPipelineStatus] = useState<EtlPipelineStatus>(
    navState?.pipelineStatus ?? 'draft',
  );
  const [versions, setVersions] = useState<PipelineVersionListItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Diff view state
  const [showDiff, setShowDiff] = useState(false);
  const [diffFrom, setDiffFrom] = useState(0);
  const [diffTo, setDiffTo] = useState(0);

  // Rollback dialog state
  const [rollbackVersion, setRollbackVersion] = useState<PipelineVersionListItem | null>(null);

  // Publish dialog state
  const [publishVersion, setPublishVersion] = useState<PipelineVersionListItem | null>(null);
  const [publishing, setPublishing] = useState(false);

  // Toast state
  const [toast, setToast] = useState<ToastState | null>(null);

  const showToast = useCallback((title: string, message: string) => {
    setToast({ title, message });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const fetchVersions = useCallback(async () => {
    if (!pipelineId) return;
    setLoading(true);
    try {
      const res = await getPipelineVersions(pipelineId);
      setVersions(res.data);
    } catch {
      // handled by API client
    } finally {
      setLoading(false);
    }
  }, [pipelineId]);

  // Fetch pipeline info if not in nav state
  useEffect(() => {
    if (!pipelineId) return;
    if (!navState?.pipelineName) {
      getPipelines({ keyword: '', page: 1, pageSize: 100 }).then((res) => {
        const pipeline = res.data.find((p) => p.id === pipelineId);
        if (pipeline) {
          setPipelineName(pipeline.name);
          setPipelineStatus(pipeline.status);
        }
      });
    }
  }, [pipelineId, navState]);

  useEffect(() => {
    fetchVersions();
  }, [fetchVersions]);

  const handleLogout = async () => {
    try {
      await logout();
    } finally {
      clearAuth();
      navigate('/login');
    }
  };

  // Sort versions descending
  const sortedVersions = [...versions].sort((a, b) => b.version - a.version);
  const oldestVersion = sortedVersions.length > 0 ? sortedVersions[sortedVersions.length - 1].version : 0;

  // Current published version (or latest)
  const currentPublished = sortedVersions.find((v) => v.status === 'published');
  const currentVersionLabel = currentPublished
    ? `v${currentPublished.version}`
    : sortedVersions.length > 0
      ? `v${sortedVersions[0].version}`
      : '-';

  const handleDiffClick = (version: PipelineVersionListItem) => {
    // Diff between this version and the previous one
    const idx = sortedVersions.findIndex((v) => v.version === version.version);
    const prevVersion = idx < sortedVersions.length - 1 ? sortedVersions[idx + 1] : null;
    if (!prevVersion) return;

    setDiffFrom(prevVersion.version);
    setDiffTo(version.version);
    setShowDiff(true);
  };

  const handlePublishConfirm = async () => {
    if (!pipelineId || !publishVersion) return;
    setPublishing(true);
    try {
      await publishPipelineVersion(pipelineId, publishVersion.id);
      setPublishVersion(null);
      showToast('版本已發布', `v${publishVersion.version} 已發布，Pipeline 現在可以啟用排程`);
      await fetchVersions();
    } catch {
      showToast('發布失敗', '請稍後再試');
    } finally {
      setPublishing(false);
    }
  };

  const handleRollbackConfirm = async () => {
    if (!pipelineId || !rollbackVersion) return;
    try {
      const res = await rollbackPipelineVersion(pipelineId, rollbackVersion.id);
      setRollbackVersion(null);
      showToast(
        `已回滾至 v${rollbackVersion.version}`,
        `新版本 v${res.version} (draft) 已建立`,
      );
      await fetchVersions();
    } catch {
      showToast('回滾失敗', '請稍後再試');
    }
  };

  const renderActionButtons = (version: PipelineVersionListItem) => {
    const isOldest = version.version === oldestVersion;

    return (
      <div className="flex items-center justify-end gap-1">
        {/* Diff button - always shown, disabled for oldest */}
        {isOldest ? (
          <button
            className="p-1.5 rounded text-gray-300 cursor-not-allowed"
            disabled
            title="最舊版本，無法比對"
            data-testid={`diff-btn-v${version.version}`}
          >
            <Diff className="w-4 h-4" />
          </button>
        ) : (
          <button
            onClick={() => handleDiffClick(version)}
            className="p-1.5 hover:bg-gray-100 rounded text-gray-500 hover:text-blue-600"
            title="Diff 比對"
            data-testid={`diff-btn-v${version.version}`}
          >
            <Diff className="w-4 h-4" />
          </button>
        )}

        {/* Publish button - testing: enabled, draft: disabled with tooltip, published: hidden */}
        {version.status === 'testing' && (
          <button
            onClick={() => setPublishVersion(version)}
            className="p-1.5 hover:bg-gray-100 rounded text-gray-500 hover:text-green-500"
            title="發布"
            data-testid={`publish-btn-v${version.version}`}
          >
            <Rocket className="w-4 h-4" />
          </button>
        )}
        {version.status === 'draft' && (
          <button
            className="p-1.5 rounded text-gray-300 cursor-not-allowed relative group"
            disabled
            title="請先完成測試執行"
            data-testid={`publish-btn-v${version.version}`}
          >
            <Rocket className="w-4 h-4" />
            <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 text-xs text-white bg-gray-800 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition pointer-events-none">
              請先完成測試執行
            </span>
          </button>
        )}

        {/* Rollback button - only for published versions */}
        {version.status === 'published' && (
          <button
            onClick={() => setRollbackVersion(version)}
            className="p-1.5 hover:bg-gray-100 rounded text-gray-500 hover:text-amber-500"
            title="回滾至此版本"
            data-testid={`rollback-btn-v${version.version}`}
          >
            <History className="w-4 h-4" />
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-56 bg-white border-r border-gray-200 flex flex-col shrink-0">
        <div className="px-5 py-5 border-b border-gray-200">
          <h1 className="text-xl font-bold text-blue-600 tracking-wide">CDMP</h1>
          <p className="text-xs text-gray-500 mt-0.5">資料治理平台</p>
        </div>
        <nav className="flex-1 py-3">
          <a
            href="/"
            className="flex items-center gap-3 px-5 py-2.5 text-sm text-gray-600 hover:bg-gray-50"
          >
            <Users size={20} />
            帳號管理
          </a>
          <a
            href="/datasources"
            className="flex items-center gap-3 px-5 py-2.5 text-sm text-gray-600 hover:bg-gray-50"
          >
            <Database size={20} />
            資料來源
          </a>
          <a
            href="/extraction-tasks"
            className="flex items-center gap-3 px-5 py-2.5 text-sm text-gray-600 hover:bg-gray-50"
          >
            <ArrowDownToLine size={20} />
            資料擷取
          </a>
          <a
            href="/etl-pipelines"
            className="flex items-center gap-3 px-5 py-2.5 text-sm text-blue-600 bg-blue-50 border-l-[3px] border-blue-600 font-medium"
            aria-current="page"
          >
            <Workflow size={20} />
            ETL Pipeline
          </a>
        </nav>
      </aside>

      {/* Main Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header with Breadcrumb */}
        <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center gap-2 text-sm">
            <button
              onClick={() => navigate('/etl-pipelines')}
              className="text-gray-400 hover:text-blue-600"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <nav className="flex items-center text-gray-500">
              <a href="/etl-pipelines/list" className="hover:text-blue-600">
                Pipeline 清單
              </a>
              <ChevronRight className="w-4 h-4 mx-1" />
              <span className="text-gray-800 font-medium">{pipelineName}</span>
              <ChevronRight className="w-4 h-4 mx-1" />
              <span className="text-blue-600 font-medium">版本管理</span>
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-700">{user?.name}</span>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
            >
              <LogOut size={16} />
              登出
            </button>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 p-6 overflow-auto">
          {/* Pipeline Summary Card */}
          <div
            className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 mb-6"
            data-testid="pipeline-summary"
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-800">{pipelineName}</h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  目前版本：{currentVersionLabel}
                </p>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-center">
                  <p className="text-xs text-gray-500">Pipeline 狀態</p>
                  <div className="mt-1">
                    <PipelineStatusBadge status={pipelineStatus} />
                  </div>
                </div>
                <button
                  onClick={() =>
                    navigate(`/etl-pipelines/${pipelineId}/editor`, {
                      state: { pipelineName },
                    })
                  }
                  className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 flex items-center gap-1.5"
                  data-testid="editor-link"
                >
                  <Pencil className="w-4 h-4" />
                  編輯器
                </button>
              </div>
            </div>
          </div>

          {/* Version List Table */}
          {loading ? (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center text-gray-500">
              載入中...
            </div>
          ) : (
            <div
              className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden mb-6"
              data-testid="version-list"
            >
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">版號</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">建立時間</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">變更摘要</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">狀態</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">建立者</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-500">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedVersions.map((version, idx) => (
                    <tr
                      key={version.id}
                      className={`${idx < sortedVersions.length - 1 ? 'border-b border-gray-200' : ''} hover:bg-gray-50 transition`}
                      data-testid={`version-row-v${version.version}`}
                    >
                      <td className="px-4 py-3 font-medium">v{version.version}</td>
                      <td className="px-4 py-3 text-gray-500">
                        {formatDateTW(version.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {version.changeSummary ?? '-'}
                      </td>
                      <td className="px-4 py-3">
                        <VersionStatusBadge status={version.status} />
                      </td>
                      <td className="px-4 py-3 text-gray-500">{version.createdBy}</td>
                      <td className="px-4 py-3 text-right">
                        {renderActionButtons(version)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Diff View (inline, toggle) */}
          {showDiff && pipelineId && (
            <VersionDiffView
              pipelineId={pipelineId}
              versions={versions}
              initialFrom={diffFrom}
              initialTo={diffTo}
              onClose={() => setShowDiff(false)}
            />
          )}
        </main>
      </div>

      {/* Rollback Dialog */}
      <RollbackConfirmDialog
        open={!!rollbackVersion}
        versionNumber={rollbackVersion?.version ?? 0}
        onConfirm={handleRollbackConfirm}
        onCancel={() => setRollbackVersion(null)}
      />

      {/* Publish Dialog */}
      <PublishConfirmDialog
        open={!!publishVersion}
        versionNumber={publishVersion?.version ?? 0}
        loading={publishing}
        onConfirm={handlePublishConfirm}
        onCancel={() => {
          if (!publishing) setPublishVersion(null);
        }}
      />

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50" data-testid="toast">
          <div className="bg-white rounded-lg shadow-lg border border-gray-200 p-4 flex items-start gap-3 min-w-[320px] border-l-4 border-l-green-500">
            <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-gray-800">{toast.title}</p>
              <p className="text-xs text-gray-500 mt-0.5">{toast.message}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
