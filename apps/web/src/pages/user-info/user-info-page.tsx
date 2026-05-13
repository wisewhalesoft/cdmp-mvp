import { Mail, User as UserIcon, ShieldCheck, BadgeCheck } from 'lucide-react';
import { getUser } from '@/stores/auth-store';
import { AppLayout } from '@/components/layout/app-layout';
import { getRoleDisplayName } from '@cdmp/shared';

/**
 * F002 v1.2 / AD-E02-4-C：/user-info 改版為 Profile 頁
 *
 * 取代原本「目前尚無可用功能」的訊息頁。
 * 套用共用 AppLayout，sidebar 與 header 自動依身份渲染（含登出按鈕）。
 * 顯示 Profile 資訊：姓名、Email、角色、is_sales_manager 旗標。
 *
 * 路由 Guard：ProtectedRoute（不再限定 role=user），任何已登入身份皆可存取。
 */

export function UserInfoPage() {
  const user = getUser();
  const isSalesManager = user?.isSalesManager === true;

  return (
    <AppLayout title="個人資訊">
      <div className="p-6">
        <div className="max-w-2xl bg-white rounded-lg border border-[#E5E7EB] shadow-sm">
          <div className="px-6 py-5 border-b border-[#E5E7EB]">
            <h2 className="text-base font-semibold text-gray-800">帳號資料</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              此處顯示您目前登入帳號的基本資訊。
            </p>
          </div>
          <dl className="divide-y divide-[#E5E7EB]">
            <ProfileRow
              icon={<UserIcon className="w-4 h-4 text-gray-400" />}
              label="姓名"
              value={user?.name ?? '—'}
            />
            <ProfileRow
              icon={<Mail className="w-4 h-4 text-gray-400" />}
              label="Email"
              value={user?.email ?? '—'}
            />
            <ProfileRow
              icon={<BadgeCheck className="w-4 h-4 text-gray-400" />}
              label="角色"
              value={user?.role ? getRoleDisplayName(user.role) : '—'}
            />
            <ProfileRow
              icon={<ShieldCheck className="w-4 h-4 text-gray-400" />}
              label="業務主管旗標"
              value={isSalesManager ? '是' : '否'}
            />
          </dl>
        </div>
      </div>
    </AppLayout>
  );
}

function ProfileRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center px-6 py-4">
      <dt className="flex items-center gap-2 w-40 text-sm text-gray-500">
        {icon}
        {label}
      </dt>
      <dd className="flex-1 text-sm text-gray-800">{value}</dd>
    </div>
  );
}
