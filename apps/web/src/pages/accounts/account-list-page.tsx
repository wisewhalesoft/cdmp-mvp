import { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Search, ChevronLeft, ChevronRight, HelpCircle } from 'lucide-react';
import { getUser } from '@/stores/auth-store';
import {
  getAccounts,
  updateAccountStatus,
  updateAccountRole,
  updateBusinessRole,
  adminResetPassword,
} from '@/api/accounts';
import { Button } from '@/components/ui/button';
import { AppLayout } from '@/components/layout/app-layout';
import { useToast } from '@/components/ui/toast';
import { RoleBadge } from '@/components/e07/RoleBadge';
import { CreateAccountModal } from './create-account-modal';
import { EditAccountModal } from './edit-account-modal';
import { ToggleStatusDialog } from './toggle-status-dialog';
import { ChangeRoleDialog } from './change-role-dialog';
import { ResetPasswordDialog } from './reset-password-dialog';
import {
  type AccountListItem,
  type BusinessRole,
  type EffectiveIdentity,
  type UserRole,
  deriveEffectiveIdentity,
  getEffectiveIdentityDisplayName,
} from '@cdmp/shared';

function formatDate(isoString: string): string {
  return isoString.slice(0, 10);
}

// F006a / AD-E07 v3.0：4 角色實質身份 → (systemRole, businessRole) 對應
function identityToRoles(identity: EffectiveIdentity): { role: UserRole; businessRole: BusinessRole } {
  switch (identity) {
    case 'admin':
      return { role: 'admin', businessRole: null };
    case 'director':
      return { role: 'user', businessRole: 'director' };
    case 'section_chief':
      return { role: 'user', businessRole: 'section_chief' };
    case 'user':
      return { role: 'user', businessRole: null };
  }
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
  // F006a / AD-E07 v3.0：roleFilter = '' | 'admin' | 'director' | 'section_chief' | 'user'
  const [roleFilter, setRoleFilter] = useState<'' | EffectiveIdentity>('');
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
      // 後端 GET /accounts?role= 只支援 admin/user 兩值（系統角色維度）；
      // director/section_chief/user 之業務角色過濾在前端 client-side 套用。
      const backendRole: 'admin' | 'user' | undefined =
        roleFilter === 'admin' ? 'admin'
        : roleFilter === '' ? undefined
        : 'user';
      const result = await getAccounts({
        page,
        limit,
        search: debouncedSearch || undefined,
        role: backendRole,
        status: (statusFilter as 'active' | 'disabled') || undefined,
      });
      // 客戶端依 business_role 進一步過濾 director/section_chief/user
      let rows = result.data;
      if (roleFilter === 'director') {
        rows = rows.filter((a) => a.business_role === 'director');
      } else if (roleFilter === 'section_chief') {
        rows = rows.filter((a) => a.business_role === 'section_chief');
      } else if (roleFilter === 'user') {
        rows = rows.filter((a) => a.role === 'user' && a.business_role === null);
      }
      setAccounts(rows);
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

  // F006a v1.0 / AD-E07 v3.0：依新身份 → 系統角色 + 業務角色，依差異呼叫對應端點
  const handleRoleConfirm = async (newIdentity: EffectiveIdentity) => {
    if (!roleTarget) return;

    const current = deriveEffectiveIdentity(roleTarget.role, roleTarget.business_role);
    if (current === newIdentity) {
      setShowRoleDialog(false);
      setRoleTarget(null);
      return;
    }

    const target = identityToRoles(newIdentity);
    const roleChanged = target.role !== roleTarget.role;
    const businessRoleChanged = target.businessRole !== roleTarget.business_role;

    setRoleLoading(true);

    // 步驟 1: PATCH /role（系統角色變動時）
    if (roleChanged) {
      try {
        await updateAccountRole(roleTarget.id, { role: target.role });
      } catch (err: unknown) {
        const error = err as { response?: { status?: number; data?: { error?: string; message?: string } } };
        const status = error?.response?.status;
        const code = error?.response?.data?.error;
        let msg = error?.response?.data?.message || '角色變更失敗，請稍後再試';
        if (status === 403) msg = error?.response?.data?.message || '您沒有權限執行此操作。';
        if (status === 422 && code === 'ACCOUNT_LAST_ADMIN') {
          msg = '無法移除最後一位 Admin，系統必須至少保留一個 Admin 帳號。';
        }
        showToast(msg, 'error');
        setRoleLoading(false);
        return;
      }
    }

    // 步驟 2: PATCH /business-role（業務角色變動時，僅 user 適用；admin 帳號 business_role 邏輯上為 null，不需呼叫）
    if (businessRoleChanged && target.role === 'user') {
      try {
        await updateBusinessRole(roleTarget.id, { business_role: target.businessRole });
      } catch (err: unknown) {
        const error = err as { response?: { status?: number; data?: { error?: string; message?: string } } };
        const status = error?.response?.status;
        let msg = error?.response?.data?.message || '業務角色變更失敗，請稍後再試';
        if (status === 403) msg = error?.response?.data?.message || '您沒有權限執行此操作。';
        if (status === 422) msg = error?.response?.data?.message || '業務角色值無效';
        if (status === 409) msg = error?.response?.data?.message || '此帳號狀態無法變更角色';
        showToast(
          `系統角色已更新但業務角色變更失敗：${msg}`,
          'warning',
        );
        setShowRoleDialog(false);
        setRoleTarget(null);
        setRoleLoading(false);
        fetchAccounts();
        return;
      }
    }

    showToast(`角色已變更為 ${getEffectiveIdentityDisplayName(newIdentity)}`, 'success');
    setShowRoleDialog(false);
    setRoleTarget(null);
    setRoleLoading(false);
    fetchAccounts();
  };

  const handleRoleChange = (value: string) => {
    setRoleFilter(value as '' | EffectiveIdentity);
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
                placeholder="搜尋姓名、Email 或員工編號"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>
            <select
              value={roleFilter}
              onChange={(e) => handleRoleChange(e.target.value)}
              aria-label="角色"
              className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            >
              <option value="">全部角色</option>
              <option value="admin">系統管理者</option>
              <option value="director">業務部長</option>
              <option value="section_chief">業務處長</option>
              <option value="user">一般使用者</option>
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
                      {/* F113 / US-179: 員工編號欄（選填，可作為登入帳號） */}
                      <th className="text-left px-5 py-3 font-semibold text-gray-600">員工編號</th>
                      <th className="text-left px-5 py-3 font-semibold text-gray-600">Email</th>
                      <th className="text-left px-5 py-3 font-semibold text-gray-600">
                        <span className="inline-flex items-center gap-1">
                          角色
                          <span
                            title="單一角色維度（系統管理者 / 業務部長 / 業務處長 / 一般使用者）。系統管理者自動具備所有業務權限。"
                            className="cursor-help text-gray-400"
                          >
                            <HelpCircle className="w-3.5 h-3.5" />
                          </span>
                        </span>
                      </th>
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
                        {/* F113 / US-179: 員工編號（monospace；未設定顯示佔位符「—」） */}
                        <td className="px-5 py-3">
                          {account.employee_no ? (
                            <span className="font-mono text-gray-600">{account.employee_no}</span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-gray-600">{account.email}</td>
                        <td className="px-5 py-3">
                          <RoleBadge
                            role={account.role}
                            businessRole={account.business_role}
                          />
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

      {/* Change Role Dialog (F006a / AD-E07 v3.0 4-radio 單維度) */}
      <ChangeRoleDialog
        open={showRoleDialog}
        accountName={roleTarget?.name ?? ''}
        currentIdentity={
          roleTarget
            ? deriveEffectiveIdentity(roleTarget.role, roleTarget.business_role)
            : 'user'
        }
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
