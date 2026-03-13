import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Database, LogOut, Plus, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { clearAuth, getUser } from '@/stores/auth-store';
import { logout } from '@/api/auth';
import { getAccounts, updateAccountStatus } from '@/api/accounts';
import { Button } from '@/components/ui/button';
import { CreateAccountModal } from './create-account-modal';
import { EditAccountModal } from './edit-account-modal';
import { ToggleStatusDialog } from './toggle-status-dialog';
import type { AccountListItem } from '@cdmp/shared';

function formatDate(isoString: string): string {
  return isoString.slice(0, 10);
}

function RoleBadge({ role }: { role: string }) {
  if (role === 'admin') {
    return (
      <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-blue-100 text-blue-700">
        Admin
      </span>
    );
  }
  return (
    <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-700">
      User
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'active') {
    return (
      <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-700">
        啟用中
      </span>
    );
  }
  return (
    <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-red-100 text-red-700">
      已停用
    </span>
  );
}

export function AccountListPage() {
  const navigate = useNavigate();
  const user = getUser();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState<AccountListItem | null>(null);
  const [showToggleDialog, setShowToggleDialog] = useState(false);
  const [toggleTarget, setToggleTarget] = useState<AccountListItem | null>(null);
  const [toggleMode, setToggleMode] = useState<'disable' | 'enable'>('disable');
  const [toggleLoading, setToggleLoading] = useState(false);

  // List state
  const [accounts, setAccounts] = useState<AccountListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);

  // Debounce ref
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Debounce search input
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [search]);

  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getAccounts({
        page,
        limit,
        search: debouncedSearch || undefined,
        role: (roleFilter as 'admin' | 'user') || undefined,
        status: (statusFilter as 'active' | 'disabled') || undefined,
      });
      setAccounts(result.data);
      setTotal(result.total);
    } catch {
      // Error handling — graceful degradation
    } finally {
      setLoading(false);
    }
  }, [page, limit, debouncedSearch, roleFilter, statusFilter]);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  const handleLogout = async () => {
    try {
      await logout();
    } catch {
      // Graceful degradation
    } finally {
      clearAuth();
      navigate('/login');
    }
  };

  const handleCreateSuccess = () => {
    setShowCreateModal(false);
    fetchAccounts();
  };

  const handleEditClick = (account: AccountListItem) => {
    setEditingAccount(account);
    setShowEditModal(true);
  };

  const handleEditSuccess = () => {
    setShowEditModal(false);
    setEditingAccount(null);
    fetchAccounts();
  };

  const handleToggleClick = (account: AccountListItem, mode: 'disable' | 'enable') => {
    setToggleTarget(account);
    setToggleMode(mode);
    setShowToggleDialog(true);
  };

  const handleToggleConfirm = async () => {
    if (!toggleTarget) return;
    setToggleLoading(true);
    try {
      await updateAccountStatus(toggleTarget.id, {
        status: toggleMode === 'disable' ? 'disabled' : 'active',
      });
      setShowToggleDialog(false);
      setToggleTarget(null);
      fetchAccounts();
    } catch {
      // Error handling — graceful degradation
    } finally {
      setToggleLoading(false);
    }
  };

  const handleRoleChange = (value: string) => {
    setRoleFilter(value);
    setPage(1);
  };

  const handleStatusChange = (value: string) => {
    setStatusFilter(value);
    setPage(1);
  };

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <aside className="w-56 bg-white border-r border-gray-200 flex flex-col shrink-0">
        <div className="px-5 py-5 border-b border-gray-200">
          <h1 className="text-xl font-bold text-primary tracking-wide">CDMP</h1>
          <p className="text-xs text-gray-500 mt-0.5">資料治理平台</p>
        </div>
        <nav className="flex-1 py-3">
          <a
            href="#"
            className="flex items-center gap-3 px-5 py-2.5 text-sm text-primary bg-blue-50 border-l-[3px] border-primary font-medium"
          >
            <Users size={20} />
            帳號管理
          </a>
          <a
            href="#"
            className="flex items-center gap-3 px-5 py-2.5 text-sm text-gray-600 hover:bg-gray-50"
          >
            <Database size={20} />
            資料來源
          </a>
        </nav>
      </aside>

      {/* Main Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6 shrink-0">
          <h2 className="text-lg font-semibold text-gray-900">帳號管理</h2>
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
        <main className="flex-1 p-6">
          {/* Toolbar */}
          <div className="flex items-center gap-3 mb-5">
            <Button onClick={() => setShowCreateModal(true)}>
              <span className="flex items-center gap-2">
                <Plus size={16} />
                建立帳號
              </span>
            </Button>
            <div className="relative flex-1 max-w-xs">
              <Search
                size={16}
                className="text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              />
              <input
                type="text"
                placeholder="搜尋姓名或 Email"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>
            <select
              value={roleFilter}
              onChange={(e) => handleRoleChange(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            >
              <option value="">全部角色</option>
              <option value="admin">Admin</option>
              <option value="user">User</option>
            </select>
            <select
              value={statusFilter}
              onChange={(e) => handleStatusChange(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            >
              <option value="">全部狀態</option>
              <option value="active">啟用中</option>
              <option value="disabled">已停用</option>
            </select>
          </div>

          {/* Table Card */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            {loading ? (
              <div className="p-12 text-center text-gray-400">載入中...</div>
            ) : accounts.length === 0 ? (
              <div className="p-12 text-center">
                <p className="text-gray-500 font-medium">找不到帳號</p>
                <p className="text-sm text-gray-400 mt-1">請嘗試調整篩選條件或搜尋關鍵字</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50/60">
                      <th className="text-left px-5 py-3 font-semibold text-gray-600">姓名</th>
                      <th className="text-left px-5 py-3 font-semibold text-gray-600">Email</th>
                      <th className="text-left px-5 py-3 font-semibold text-gray-600">角色</th>
                      <th className="text-left px-5 py-3 font-semibold text-gray-600">狀態</th>
                      <th className="text-left px-5 py-3 font-semibold text-gray-600">建立日期</th>
                      <th className="text-left px-5 py-3 font-semibold text-gray-600">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accounts.map((account) => (
                      <tr
                        key={account.id}
                        className="border-b border-gray-200 hover:bg-gray-50/50"
                      >
                        <td className="px-5 py-3 font-medium text-gray-900">{account.name}</td>
                        <td className="px-5 py-3 text-gray-600">{account.email}</td>
                        <td className="px-5 py-3">
                          <RoleBadge role={account.role} />
                        </td>
                        <td className="px-5 py-3">
                          <StatusBadge status={account.status} />
                        </td>
                        <td className="px-5 py-3 text-gray-500">
                          {formatDate(account.created_at)}
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleEditClick(account)}
                              className="text-xs text-primary hover:text-blue-700 font-medium"
                            >
                              編輯
                            </button>
                            {account.status === 'active' && account.id === user?.id ? (
                              <button
                                disabled
                                className="text-xs text-gray-300 cursor-not-allowed font-medium"
                                title="無法停用自己的帳號"
                              >
                                停用
                              </button>
                            ) : account.status === 'active' ? (
                              <button
                                onClick={() => handleToggleClick(account, 'disable')}
                                className="text-xs text-warning hover:text-amber-600 font-medium"
                              >
                                停用
                              </button>
                            ) : (
                              <button
                                onClick={() => handleToggleClick(account, 'enable')}
                                className="text-xs text-success hover:text-green-600 font-medium"
                              >
                                啟用
                              </button>
                            )}
                            <button className="text-xs text-gray-400 font-medium">變更角色</button>
                            <button className="text-xs text-primary hover:text-blue-700 font-medium">
                              重設密碼
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination */}
            {!loading && total > 0 && (
              <div className="flex items-center justify-between px-5 py-3 border-t border-gray-200">
                <span className="text-sm text-gray-500">
                  共 {total} 筆，第 {page} 頁，共 {totalPages} 頁
                </span>
                <div className="flex items-center gap-2">
                  <button
                    aria-label="上一頁"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                  >
                    <ChevronLeft size={14} />
                    上一頁
                  </button>
                  <button
                    aria-label="下一頁"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                  >
                    下一頁
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Create Account Modal */}
      <CreateAccountModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={handleCreateSuccess}
      />

      {/* Edit Account Modal */}
      <EditAccountModal
        open={showEditModal}
        account={editingAccount}
        onClose={() => { setShowEditModal(false); setEditingAccount(null); }}
        onSuccess={handleEditSuccess}
      />

      {/* Toggle Status Dialog */}
      <ToggleStatusDialog
        open={showToggleDialog}
        mode={toggleMode}
        accountName={toggleTarget?.name ?? ''}
        loading={toggleLoading}
        onConfirm={handleToggleConfirm}
        onCancel={() => { setShowToggleDialog(false); setToggleTarget(null); }}
      />
    </div>
  );
}
