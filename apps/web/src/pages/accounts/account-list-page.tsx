import { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Search, ChevronLeft, ChevronRight, ShieldCheck } from 'lucide-react';
import { getUser } from '@/stores/auth-store';
import {
  getAccounts,
  updateAccountStatus,
  updateAccountRole,
  updateAccountSalesManagerFlag,
  adminResetPassword,
} from '@/api/accounts';
import { Button } from '@/components/ui/button';
import { AppLayout } from '@/components/layout/app-layout';
import { useToast } from '@/components/ui/toast';
import { CreateAccountModal } from './create-account-modal';
import { EditAccountModal } from './edit-account-modal';
import { ToggleStatusDialog } from './toggle-status-dialog';
import { ChangeRoleDialog } from './change-role-dialog';
import { ResetPasswordDialog } from './reset-password-dialog';
import { type AccountListItem, type UserRole, getRoleDisplayName } from '@cdmp/shared';

function formatDate(isoString: string): string {
  return isoString.slice(0, 10);
}

const ROLE_BADGE_STYLES: Record<string, string> = {
  admin: 'bg-blue-100 text-blue-700',
  user: 'bg-gray-100 text-gray-700',
};

function RoleBadge({ role }: { role: string }) {
  const styles = ROLE_BADGE_STYLES[role] ?? 'bg-gray-100 text-gray-700';
  return (
    <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${styles}`}>
      {getRoleDisplayName(role as UserRole)}
    </span>
  );
}

// F008 v3.2 / TS-F008-SM-FE-013~017:
// 列表頁 Sales Manager chip — 僅當 role=user 且 is_sales_manager=true 時顯示
// className 嚴格對齊 prototype 07 line 299-302
function SalesManagerChip({ accountId }: { accountId: string }) {
  return (
    <span
      data-testid={`sales-manager-chip-${accountId}`}
      title="此 User 已啟用業務主管權限，可存取 E07 客戶名單分派與 E06 Customer 360"
      className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-amber-50 text-warning rounded-md border border-amber-200"
    >
      <ShieldCheck className="w-3.5 h-3.5" />
      Sales Manager
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
  const user = getUser();
  const { showToast } = useToast();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState<AccountListItem | null>(null);
  const [showToggleDialog, setShowToggleDialog] = useState(false);
  const [toggleTarget, setToggleTarget] = useState<AccountListItem | null>(null);
  const [toggleMode, setToggleMode] = useState<'disable' | 'enable'>('disable');
  const [toggleLoading, setToggleLoading] = useState(false);
  const [showRoleDialog, setShowRoleDialog] = useState(false);
  const [roleTarget, setRoleTarget] = useState<AccountListItem | null>(null);
  const [roleLoading, setRoleLoading] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [resetTarget, setResetTarget] = useState<AccountListItem | null>(null);
  const [resetLoading, setResetLoading] = useState(false);

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
        role: (roleFilter as UserRole) || undefined,
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

  const handleRoleClick = (account: AccountListItem) => {
    setRoleTarget(account);
    setShowRoleDialog(true);
  };

  // F008 v3.2 BR-12 / AC-11 / TS-F008-SM-INT-001~007:
  // 合併 UX：依差異依序呼叫 PATCH /role 與 PATCH /sales-manager-flag
  const handleRoleConfirm = async (newRole: UserRole, newIsSalesManager: boolean) => {
    if (!roleTarget) return;

    const currentRole = roleTarget.role;
    const currentIsSm = roleTarget.is_sales_manager === true;
    const roleChanged = newRole !== currentRole;
    const newRoleIsUser = newRole === 'user';
    // 旗標變動：僅當新 role=user 時才比對；其他情境視為無 flag 變動
    const flagChanged = newRoleIsUser && newIsSalesManager !== currentIsSm;

    setRoleLoading(true);

    let roleSuccess = false;
    let roleErrorMessage: string | null = null;
    let flagAttempted = false;
    let flagSuccess = false;
    let flagErrorMessage: string | null = null;

    // 第一步：PATCH /role（若 role 有變動）
    if (roleChanged) {
      try {
        await updateAccountRole(roleTarget.id, { role: newRole });
        roleSuccess = true;
      } catch (err: unknown) {
        // role 端點失敗 → 中止，不呼叫 flag
        const error = err as { response?: { data?: { error?: string; message?: string } } };
        roleErrorMessage =
          error?.response?.data?.message || '角色變更失敗，請稍後再試';
        // ACCOUNT_LAST_ADMIN 走特殊訊息（spec 已定義訊息文字）
        showToast(roleErrorMessage, 'error');
        setRoleLoading(false);
        return;
      }
    }

    // 第二步：PATCH /sales-manager-flag（僅當 newRole=user 且 flag 有變更）
    // 情境 B 變形：升 admin 時跳過 flag 呼叫（避免 ACCOUNT_FLAG_NOT_APPLICABLE）
    if (newRoleIsUser && flagChanged) {
      flagAttempted = true;
      try {
        await updateAccountSalesManagerFlag(roleTarget.id, {
          isSalesManager: newIsSalesManager,
        });
        flagSuccess = true;
      } catch (err: unknown) {
        const error = err as { response?: { data?: { error?: string; message?: string } } };
        flagErrorMessage =
          error?.response?.data?.message || '業務主管權限調整失敗';
      }
    }

    // 訊息組合 — 部分成功時警示
    if (roleSuccess && flagAttempted && !flagSuccess) {
      // 情境 E：role 成功但 flag 失敗 → 不 rollback role
      showToast(
        `角色已變更為 ${getRoleDisplayName(newRole)}，但業務主管權限調整失敗，請稍後重試`,
        'warning',
      );
    } else if (roleSuccess || flagSuccess) {
      // 全成功的情況
      let msg = '';
      if (roleSuccess) {
        msg = `角色已變更為 ${getRoleDisplayName(newRole)}`;
        if (newRoleIsUser && flagAttempted && flagSuccess) {
          msg += `，業務主管權限${newIsSalesManager ? '已啟用' : '已停用'}`;
        }
      } else if (flagSuccess) {
        // 情境 C / D：僅 flag 變更
        msg = `業務主管權限${newIsSalesManager ? '已啟用' : '已停用'}`;
      }
      showToast(msg, 'success');
    } else if (flagAttempted && !flagSuccess && !roleChanged) {
      // 僅 flag 操作但失敗
      showToast(flagErrorMessage || '業務主管權限調整失敗', 'error');
    }

    // 不論成功或部分成功，皆關閉 dialog 並重新載入列表
    setShowRoleDialog(false);
    setRoleTarget(null);
    setRoleLoading(false);
    fetchAccounts();
  };

  const handleRoleChange = (value: string) => {
    setRoleFilter(value);
    setPage(1);
  };

  const handleStatusChange = (value: string) => {
    setStatusFilter(value);
    setPage(1);
  };

  const handleResetClick = (account: AccountListItem) => {
    setResetTarget(account);
    setShowResetDialog(true);
  };

  const handleResetConfirm = async (newPassword: string) => {
    if (!resetTarget) return;
    setResetLoading(true);
    try {
      await adminResetPassword(resetTarget.id, { newPassword });
      setShowResetDialog(false);
      setResetTarget(null);
      fetchAccounts();
    } catch {
      // Error handling — graceful degradation
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <AppLayout title="帳號管理">
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
              <option value="admin">管理者（Admin）</option>
              <option value="user">使用者（User）</option>
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
                          <div className="flex items-center gap-2 flex-wrap">
                            <RoleBadge role={account.role} />
                            {account.role === 'user' && account.is_sales_manager === true && (
                              <SalesManagerChip accountId={account.id} />
                            )}
                          </div>
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
                            <button
                              onClick={() => handleRoleClick(account)}
                              className="text-xs text-primary hover:text-blue-700 font-medium"
                            >
                              變更角色
                            </button>
                            {account.id === user?.id ? (
                              <button
                                disabled
                                className="text-xs text-gray-300 cursor-not-allowed font-medium"
                                title="請透過個人設定變更您自己的密碼"
                              >
                                重設密碼
                              </button>
                            ) : (
                              <button
                                onClick={() => handleResetClick(account)}
                                className="text-xs text-primary hover:text-blue-700 font-medium"
                              >
                                重設密碼
                              </button>
                            )}
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

      {/* Change Role Dialog (F008 v3.2 合併 UX) */}
      <ChangeRoleDialog
        open={showRoleDialog}
        accountName={roleTarget?.name ?? ''}
        currentRole={roleTarget?.role ?? 'user'}
        currentIsSalesManager={roleTarget?.is_sales_manager === true}
        loading={roleLoading}
        onConfirm={handleRoleConfirm}
        onCancel={() => { setShowRoleDialog(false); setRoleTarget(null); }}
      />

      {/* Reset Password Dialog (F010) */}
      <ResetPasswordDialog
        open={showResetDialog}
        accountName={resetTarget?.name ?? ''}
        loading={resetLoading}
        onConfirm={handleResetConfirm}
        onCancel={() => { setShowResetDialog(false); setResetTarget(null); }}
      />
    </AppLayout>
  );
}
