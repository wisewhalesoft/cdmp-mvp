import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { clearAuth, getBusinessRole, getUser } from '@/stores/auth-store';
import { logout } from '@/api/auth';
import { AppSidebar } from './app-sidebar';
import { SalesManagerBadge } from './sales-manager-badge';

/**
 * F002 v1.2 / AD-E02-4-E：共用 AppLayout
 *
 * 結構：sidebar（共用，依身份過濾）+ header（含 Sales Manager Badge、登出按鈕）+ main slot
 *
 * 對應 prototype: /prototypes/27-list-definition.html 第 41-135 行
 *
 * 使用：所有受保護頁面（套用 ProtectedRoute / AdminRoute / SalesManagerRoute 之頁面）
 * 都應在元件最外層套用 AppLayout，將原本散落的 sidebar 與 header 渲染移除。
 *
 * Header 左側支援兩種模式：
 * - title (string)：簡單頁面標題，渲染為 `<h1>`
 * - headerLeft (ReactNode)：複雜 header 內容（如 breadcrumb），完全取代左側預設渲染
 *   兩者擇一使用；若皆提供，以 headerLeft 為準。
 *
 * Header 右側可額外注入 page-specific actions（例如「新增」按鈕）：
 * - actions (ReactNode)：渲染於 Sales Manager Badge 之前；user name 與登出按鈕始終存在。
 */

export interface AppLayoutProps {
  /** 簡單頁面標題；若提供 headerLeft 則此參數被覆寫。 */
  title?: string;
  /** Header 左側自訂內容（例如 breadcrumb），完全取代預設 `<h1>{title}</h1>` 渲染。 */
  headerLeft?: ReactNode;
  /** Header 右側 page-specific actions（在 Sales Manager Badge 之前渲染）。 */
  actions?: ReactNode;
  children: ReactNode;
}

export function AppLayout({ title, headerLeft, actions, children }: AppLayoutProps) {
  const navigate = useNavigate();
  const user = getUser();
  const role = user?.role ?? 'user';
  const businessRole = getBusinessRole();

  const handleLogout = async () => {
    try {
      await logout();
    } catch {
      // Graceful degradation: clear local session even if API fails
    }
    clearAuth();
    navigate('/login');
  };

  return (
    <div className="flex min-h-screen bg-[#F9FAFB]">
      <AppSidebar role={role} businessRole={businessRole} />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 bg-white border-b border-[#E5E7EB] flex items-center justify-between px-6 shrink-0">
          {headerLeft !== undefined ? (
            headerLeft
          ) : (
            <h1 className="text-base font-semibold text-gray-800">{title}</h1>
          )}
          <div className="flex items-center gap-4">
            {actions}
            <SalesManagerBadge isSalesManager={user?.isSalesManager} />
            {user?.name && (
              <span className="text-sm text-gray-600">{user.name}</span>
            )}
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-500 hover:text-[#EF4444] rounded-lg hover:bg-red-50 transition"
            >
              <LogOut className="w-4 h-4" />
              <span>登出</span>
            </button>
          </div>
        </header>
        <div className="flex-1 flex flex-col min-w-0">{children}</div>
      </div>
    </div>
  );
}
