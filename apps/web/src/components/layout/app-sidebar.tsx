import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  Users,
  Database,
  ArrowDownToLine,
  Workflow,
  Contact,
  ListChecks,
  ChevronRight,
  Tags,
  SlidersHorizontal,
  Percent,
  ClipboardList,
  Calculator,
  PlayCircle,
  Activity,
  FileBarChart,
  History,
  Camera,
  GitCompare,
  type LucideIcon,
} from 'lucide-react';
import type { UserRole } from '@cdmp/shared';

/**
 * F002 v1.2 / AD-E02-4-E：共用 Sidebar 元件
 *
 * 對應 prototype: /prototypes/27-list-definition.html 第 41-117 行
 *
 * 宣告式 menu 設定 + 純函式過濾邏輯：
 * - `requires: 'authenticated'` → 任何登入身份顯示
 * - `requires: 'admin'`         → role === 'admin'
 * - `requires: 'sales_manager'` → role === 'admin' OR isSalesManager === true（嚴格比對）
 *
 * 不可見項目完全不渲染 DOM（非 CSS hidden / disabled）— AC-6 安全考量。
 */

export type MenuRequires = 'authenticated' | 'admin' | 'sales_manager';

export interface MenuItem {
  to: string;
  label: string;
  icon: LucideIcon;
  requires: MenuRequires;
}

export interface MenuGroup {
  label: string;
  icon: LucideIcon;
  requires: MenuRequires;
  items: MenuItem[];
  defaultOpen?: boolean;
}

export interface MenuSection {
  label: string;
  requires?: MenuRequires;
  items?: MenuItem[];
  groups: MenuGroup[];
}

/**
 * Sidebar Menu 設定（依 prototype/27-list-definition.html 對齊）
 *
 * 結構：
 * - 資料治理（admin only）：帳號管理、資料來源、資料擷取、ETL Pipeline
 * - 應用模組：
 *   - Customer 360（authenticated）
 *   - 客戶名單分派（sales_manager，可折疊群組 — E07 子項 stub 路由）
 */
export const MENU_SECTIONS: readonly MenuSection[] = [
  {
    label: '資料治理',
    requires: 'admin',
    items: [
      { to: '/', label: '帳號管理', icon: Users, requires: 'admin' },
      { to: '/datasources', label: '資料來源', icon: Database, requires: 'admin' },
      {
        to: '/extraction-tasks',
        label: '資料擷取',
        icon: ArrowDownToLine,
        requires: 'admin',
      },
      {
        to: '/etl-pipelines',
        label: 'ETL Pipeline',
        icon: Workflow,
        requires: 'admin',
      },
    ],
    groups: [],
  },
  {
    label: '應用模組',
    items: [
      {
        to: '/c360/customers',
        label: 'Customer 360',
        icon: Contact,
        requires: 'authenticated',
      },
    ],
    groups: [
      {
        label: '客戶名單分派',
        icon: ListChecks,
        requires: 'sales_manager',
        defaultOpen: true,
        items: [
          {
            to: '/assignment/base-codes',
            label: '代碼維護',
            icon: Tags,
            requires: 'sales_manager',
          },
          {
            to: '/assignment/scoring',
            label: '計分卡設定',
            icon: SlidersHorizontal,
            requires: 'sales_manager',
          },
          {
            to: '/assignment/ratios',
            label: '比例設定',
            icon: Percent,
            requires: 'sales_manager',
          },
          {
            to: '/assignment/list-definitions',
            label: '名單定義',
            icon: ClipboardList,
            requires: 'sales_manager',
          },
          {
            to: '/assignment/estimate',
            label: 'Stage 0 試算',
            icon: Calculator,
            requires: 'sales_manager',
          },
          {
            to: '/assignment/run',
            label: '觸發月跑',
            icon: PlayCircle,
            requires: 'sales_manager',
          },
          {
            to: '/assignment/run-progress',
            label: '執行進度',
            icon: Activity,
            requires: 'sales_manager',
          },
          {
            to: '/assignment/run-summary',
            label: '結果摘要',
            icon: FileBarChart,
            requires: 'sales_manager',
          },
          {
            to: '/assignment/history',
            label: '執行歷史',
            icon: History,
            requires: 'sales_manager',
          },
          {
            to: '/assignment/snapshots',
            label: '快照詳情',
            icon: Camera,
            requires: 'sales_manager',
          },
          {
            to: '/assignment/compare',
            label: '結果比對',
            icon: GitCompare,
            requires: 'sales_manager',
          },
        ],
      },
    ],
  },
] as const;

/**
 * Pure function：判斷 requires 條件是否符合當前身份。
 * 嚴格 === true 比對 isSalesManager。
 */
function matchesRequires(
  requires: MenuRequires,
  role: UserRole,
  isSalesManager: boolean,
): boolean {
  if (requires === 'authenticated') return true;
  if (requires === 'admin') return role === 'admin';
  if (requires === 'sales_manager') {
    return role === 'admin' || isSalesManager === true;
  }
  return false;
}

/**
 * Pure function：依身份過濾 MENU_SECTIONS，回傳可見 sections。
 * 不可見項目完全不出現在結果中（DOM 端因此完全不渲染）。
 */
export function getVisibleMenuItems(
  role: UserRole,
  isSalesManager: boolean,
): MenuSection[] {
  const result: MenuSection[] = [];
  for (const section of MENU_SECTIONS) {
    const items =
      section.items?.filter((item) =>
        matchesRequires(item.requires, role, isSalesManager),
      ) ?? [];
    const groups: MenuGroup[] = section.groups
      .filter((group) => matchesRequires(group.requires, role, isSalesManager))
      .map((group) => ({
        label: group.label,
        icon: group.icon,
        requires: group.requires,
        defaultOpen: group.defaultOpen,
        items: group.items.filter((item) =>
          matchesRequires(item.requires, role, isSalesManager),
        ),
      }))
      .filter((group) => group.items.length > 0);

    if (items.length === 0 && groups.length === 0) continue;
    result.push({
      label: section.label,
      requires: section.requires,
      items,
      groups,
    });
  }
  return result;
}

export interface AppSidebarProps {
  role: UserRole;
  isSalesManager: boolean;
}

export function AppSidebar({ role, isSalesManager }: AppSidebarProps) {
  const sections = getVisibleMenuItems(role, isSalesManager);

  return (
    <aside className="w-56 bg-white border-r border-[#E5E7EB] flex flex-col shrink-0 overflow-y-auto">
      <div className="px-5 py-4 border-b border-[#E5E7EB]">
        <div className="text-xl font-bold text-[#2563EB]">CDMP</div>
        <div className="text-xs text-gray-500 mt-0.5">資料治理平台</div>
      </div>
      <nav className="flex-1 py-3">
        {sections.map((section, idx) => (
          <SidebarSection
            key={section.label}
            section={section}
            showDivider={idx > 0}
          />
        ))}
      </nav>
    </aside>
  );
}

function SidebarSection({
  section,
  showDivider,
}: {
  section: MenuSection;
  showDivider: boolean;
}) {
  return (
    <>
      {showDivider && (
        <div className="mx-5 my-3 border-t border-[#E5E7EB]" aria-hidden />
      )}
      <div className="px-5 py-1 text-[0.7rem] font-semibold text-gray-400 uppercase tracking-wider">
        {section.label}
      </div>
      {section.items?.map((item) => (
        <SidebarItem key={item.to} item={item} />
      ))}
      {section.groups.map((group) => (
        <SidebarGroup key={group.label} group={group} />
      ))}
    </>
  );
}

function SidebarItem({ item }: { item: MenuItem }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      className={({ isActive }) =>
        [
          'flex items-center gap-3 px-5 py-2.5 text-sm transition',
          isActive
            ? 'font-medium text-[#2563EB] bg-blue-50 border-r-2 border-[#2563EB]'
            : 'text-gray-600 hover:bg-gray-50',
        ].join(' ')
      }
    >
      <Icon className="w-4 h-4" />
      {item.label}
    </NavLink>
  );
}

function SidebarGroup({ group }: { group: MenuGroup }) {
  const location = useLocation();
  // 預設展開狀態：群組 defaultOpen 或 當前路由屬於此群組
  const hasActiveChild = group.items.some((it) =>
    location.pathname.startsWith(it.to),
  );
  const [open, setOpen] = useState<boolean>(
    Boolean(group.defaultOpen) || hasActiveChild,
  );
  const Icon = group.icon;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 px-5 py-2.5 text-sm text-gray-600 hover:bg-gray-50 transition"
      >
        <span className="flex items-center gap-3">
          <Icon className="w-4 h-4" />
          {group.label}
        </span>
        <ChevronRight
          className={[
            'w-4 h-4 transition-transform duration-200',
            open ? 'rotate-90' : '',
          ].join(' ')}
        />
      </button>
      {open && (
        <div className="overflow-hidden">
          {group.items.map((item) => (
            <SidebarSubItem key={item.to} item={item} />
          ))}
        </div>
      )}
    </>
  );
}

function SidebarSubItem({ item }: { item: MenuItem }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      className={({ isActive }) =>
        [
          'flex items-center gap-3 px-5 py-2 pl-12 text-sm transition',
          isActive
            ? 'font-medium text-[#2563EB] bg-blue-50 border-r-2 border-[#2563EB]'
            : 'text-gray-600 hover:bg-gray-50',
        ].join(' ')
      }
    >
      <Icon className="w-4 h-4" />
      {item.label}
    </NavLink>
  );
}
