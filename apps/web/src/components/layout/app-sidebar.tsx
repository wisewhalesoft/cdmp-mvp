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
  Filter,
  SlidersHorizontal,
  ClipboardList,
  Calculator,
  PlayCircle,
  History,
  ClipboardCheck,
  LayoutDashboard,
  type LucideIcon,
} from 'lucide-react';
import type { BusinessRole, UserRole } from '@cdmp/shared';

/**
 * F002 v2.0 / AD-E07 v3.0：共用 Sidebar 元件（4-角色 RBAC）
 *
 * 對應 prototype: /prototypes/27-list-definition.html 第 41-117 行
 *
 * 宣告式 menu 設定 + 純函式過濾邏輯：
 * - `requires: 'authenticated'`              → 任何登入身份顯示
 * - `requires: 'admin'`                      → role === 'admin'
 * - `requires: 'admin_or_general_user'`      → admin OR 一般使用者（businessRole NOT IN
 *                                              ('director','section_chief')）— F002 v2.1.0 / US-177 / F111：
 *                                              Customer 360 對業務角色隱藏
 * - `requires: 'director_only'`              → admin OR director（M02 / M03a/c / M04 觸發 / M03d Rollback）
 * - `requires: 'director_or_section_chief'`  → admin OR director OR section_chief（E07 大部分）
 * - `requires: 'sales_manager'`              → ⚠️ DEPRECATED — 視為 director_or_section_chief（過渡期向下相容）
 *
 * 不可見項目完全不渲染 DOM（非 CSS hidden / disabled）— AC-6 安全考量。
 */

export type MenuRequires =
  | 'authenticated'
  | 'admin'
  | 'admin_or_general_user'
  | 'director_only'
  | 'director_or_section_chief'
  | 'sales_manager'; // DEPRECATED

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
        // F002 v2.1.0 / US-177 / F111：Customer 360 僅 admin + 一般使用者可見；
        // 業務角色（director / section_chief）不顯示（sidebar 端 RBAC，AC-6）
        to: '/c360/customers',
        label: 'Customer 360',
        icon: Contact,
        requires: 'admin_or_general_user',
      },
    ],
    groups: [
      {
        label: '客戶名單分派',
        icon: ListChecks,
        requires: 'director_or_section_chief',
        defaultOpen: true,
        items: [
          // F111 / US-177 / BR-13 / AC-17：「分派總覽」為群組首項（#1），原「篩選欄位」降為 #2
          // 對齊 prototype 38-assignment-overview.html L87（sidebar #1 分派總覽 · active）
          {
            to: '/assignment/overview',
            label: '分派總覽',
            icon: LayoutDashboard,
            requires: 'director_or_section_chief',
          },
          // F050 v2.1 / J4：「代碼維護」rename「篩選欄位」+ icon Tags→Filter
          // 對齊 prototype 37-base-code.html L60（單一 sidebar entry，37a/37b 合併為 2-Tab）
          // 路由 /assignment/field-base?tab=fields|options（既有 base-codes / whitelist / whitelist/options 三條 route 已刪）
          {
            to: '/assignment/field-base',
            label: '篩選欄位',
            icon: Filter,
            requires: 'director_or_section_chief',
          },
          // M02 計分卡：director only（F002 §4.6 M02 對 section_chief 整頁封鎖）
          {
            to: '/assignment/scoring',
            label: '計分卡設定',
            icon: SlidersHorizontal,
            requires: 'director_only',
          },
          // M01 名單定義：director + section_chief
          // M03 比例設定（部門/個別/簽核/準備完成）已併入名單定義頁的 row actions（FE-4 inline 元件），不再有獨立 sidebar 入口
          {
            to: '/assignment/list-definitions',
            label: '名單定義',
            icon: ClipboardList,
            requires: 'director_or_section_chief',
          },
          // M03d 準備完成摘要：director + section_chief（觀察可月名單分派前置）
          // 對齊 prototype 29d-ready-summary.html L65（label「準備完成摘要」+ icon clipboard-check）
          {
            to: '/assignment/ready-summary',
            label: '準備完成摘要',
            icon: ClipboardCheck,
            requires: 'director_or_section_chief',
          },
          // M03 Stage 0 試算：F049 v2.0 / US-168 放寬至 director + section_chief（處長唯讀）
          {
            to: '/assignment/estimate',
            label: 'Stage 0 試算',
            icon: Calculator,
            requires: 'director_or_section_chief',
          },
          // M04 觸發月名單分派：director only
          {
            to: '/assignment/run',
            label: '觸發月名單分派',
            icon: PlayCircle,
            requires: 'director_only',
          },
          // M05 執行歷史：director + section_chief
          // run 詳情頁（執行進度/結果摘要/快照詳情/結果比對）不再有獨立 sidebar 入口，
          // 一律由「執行歷史」點選某筆 run 帶 ?runId=（或 ?runA=&runB=）進入。
          {
            to: '/assignment/history',
            label: '執行歷史',
            icon: History,
            requires: 'director_or_section_chief',
          },
        ],
      },
    ],
  },
] as const;

/**
 * Pure function：判斷 requires 條件是否符合當前身份。
 * F002 v2.0 / AD-E07 v3.0：admin 自動為所有 director / section_chief 之超集。
 */
function matchesRequires(
  requires: MenuRequires,
  role: UserRole,
  businessRole: BusinessRole,
): boolean {
  if (requires === 'authenticated') return true;
  if (requires === 'admin') return role === 'admin';
  if (requires === 'admin_or_general_user') {
    // F002 v2.1.0 / US-177 / F111：admin 或 一般使用者（businessRole 非 director / section_chief）
    return (
      role === 'admin' ||
      (businessRole !== 'director' && businessRole !== 'section_chief')
    );
  }
  if (requires === 'director_only') {
    return role === 'admin' || businessRole === 'director';
  }
  if (requires === 'director_or_section_chief' || requires === 'sales_manager') {
    return (
      role === 'admin' ||
      businessRole === 'director' ||
      businessRole === 'section_chief'
    );
  }
  return false;
}

/**
 * Pure function：依身份過濾 MENU_SECTIONS，回傳可見 sections。
 * 不可見項目完全不出現在結果中（DOM 端因此完全不渲染）。
 */
export function getVisibleMenuItems(
  role: UserRole,
  businessRole: BusinessRole,
): MenuSection[] {
  const result: MenuSection[] = [];
  for (const section of MENU_SECTIONS) {
    const items =
      section.items?.filter((item) =>
        matchesRequires(item.requires, role, businessRole),
      ) ?? [];
    const groups: MenuGroup[] = section.groups
      .filter((group) => matchesRequires(group.requires, role, businessRole))
      .map((group) => ({
        label: group.label,
        icon: group.icon,
        requires: group.requires,
        defaultOpen: group.defaultOpen,
        items: group.items.filter((item) =>
          matchesRequires(item.requires, role, businessRole),
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
  businessRole: BusinessRole;
}

export function AppSidebar({ role, businessRole }: AppSidebarProps) {
  const sections = getVisibleMenuItems(role, businessRole);

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
