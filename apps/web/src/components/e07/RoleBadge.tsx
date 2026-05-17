import { Crown, Briefcase, UserCog, User } from 'lucide-react';
import {
  type BusinessRole,
  type EffectiveIdentity,
  type UserRole,
  deriveEffectiveIdentity,
} from '@cdmp/shared';

// Prototype 07-account-list.html line 22-30：4 角色 badge 配色
// admin          → 系統管理者 #DBEAFE / #1D4ED8 crown    (blue-100 / blue-700)
// director       → 業務部長   #EDE9FE / #6D28D9 briefcase(violet-100 / violet-700)
// section_chief  → 業務處長   #CFFAFE / #0E7490 user-cog (cyan-100 / cyan-700)
// user           → 一般使用者 #F3F4F6 / #374151 user     (gray-100 / gray-700)
const STYLE: Record<EffectiveIdentity, string> = {
  admin: 'bg-blue-100 text-blue-700',
  director: 'bg-violet-100 text-violet-700',
  section_chief: 'bg-cyan-100 text-cyan-700',
  user: 'bg-gray-100 text-gray-700',
};

const ICON: Record<EffectiveIdentity, typeof Crown> = {
  admin: Crown,
  director: Briefcase,
  section_chief: UserCog,
  user: User,
};

const LABEL: Record<EffectiveIdentity, string> = {
  admin: '系統管理者',
  director: '業務部長',
  section_chief: '業務處長',
  user: '一般使用者',
};

export interface RoleBadgeProps {
  identity?: EffectiveIdentity;
  role?: UserRole;
  businessRole?: BusinessRole;
  className?: string;
}

export function RoleBadge({ identity, role, businessRole, className }: RoleBadgeProps) {
  const eff =
    identity ?? (role ? deriveEffectiveIdentity(role, businessRole) : 'user');
  const Icon = ICON[eff];
  return (
    <span
      data-testid={`role-badge-${eff}`}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full ${STYLE[eff]} ${className ?? ''}`}
    >
      <Icon className="w-3 h-3" />
      {LABEL[eff]}
    </span>
  );
}
