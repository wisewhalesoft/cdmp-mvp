/**
 * OB Emphire 測試資料 fixture（F082 v1.3 §11 / E07 重構批次 5）
 *
 * 提供 builder + 預設資料集，覆蓋處長轄區、全員離職、跨部門等 ETL 與業務測試場景。
 *
 * 設計原則（CLAUDE.md「ETL／data processing」段落）：fixture 為記憶體小資料集，
 * 僅供測試；真實 ETL 須採批次／串流策略，本 fixture 不模擬 production 規模。
 */

import type { ObEmphire } from '@/database/entities/ob-emphire.entity';

export interface BuildEmphireOptions {
  emp_id?: string;
  emp_nm?: string;
  id_no?: string | null;
  dept_code?: string | null;
  dept_name?: string | null;
  title_code?: string | null;
  title_name?: string | null;
  jfun_id?: string | null;
  jfun_nm?: string | null;
  hire_date?: Date | null;
  resign_date?: Date | null; // null = active，有值 = 離職
  email?: string | null;
  is_auth?: string | null;
}

let counter = 1000;

/**
 * 建立單筆 ObEmphire 測試資料。未指定 emp_id 時自動遞增。
 */
export function buildEmphire(opts: BuildEmphireOptions = {}): ObEmphire {
  const id = opts.emp_id ?? `E${String(counter++).padStart(5, '0')}`;
  return {
    emp_id: id,
    emp_nm: opts.emp_nm ?? `員工_${id}`,
    id_no: opts.id_no ?? `A${id.replace(/\D/g, '').slice(-9).padStart(9, '0')}`,
    dept_code: opts.dept_code ?? 'D001',
    dept_name: opts.dept_name ?? '預設部門',
    title_code: opts.title_code ?? '01',
    title_name: opts.title_name ?? '專員',
    jfun_id: opts.jfun_id ?? null,
    jfun_nm: opts.jfun_nm ?? null,
    hire_date: opts.hire_date ?? new Date('2020-01-01'),
    resign_date: opts.resign_date ?? null,
    email: opts.email ?? `${id.toLowerCase()}@cdmp.test`,
    is_auth: opts.is_auth ?? 'Y',
  };
}

/**
 * 部門 D001：3 active + 1 離職（測試「離職員工不計入比例校驗分母」場景）
 */
export function buildDeptD001ActiveAndResigned(): ObEmphire[] {
  return [
    buildEmphire({ emp_id: 'D001E001', dept_code: 'D001', dept_name: '北區業務一部' }),
    buildEmphire({ emp_id: 'D001E002', dept_code: 'D001', dept_name: '北區業務一部' }),
    buildEmphire({ emp_id: 'D001E003', dept_code: 'D001', dept_name: '北區業務一部' }),
    buildEmphire({
      emp_id: 'D001E099',
      dept_code: 'D001',
      dept_name: '北區業務一部',
      resign_date: new Date('2025-12-31'),
    }),
  ];
}

/**
 * 部門 D002：全員離職（測試 PersonnelRatioValidationService 短路放行邊界）
 */
export function buildDeptD002AllResigned(): ObEmphire[] {
  return [
    buildEmphire({
      emp_id: 'D002E001',
      dept_code: 'D002',
      dept_name: '南區業務二部',
      resign_date: new Date('2025-06-30'),
    }),
    buildEmphire({
      emp_id: 'D002E002',
      dept_code: 'D002',
      dept_name: '南區業務二部',
      resign_date: new Date('2025-09-30'),
    }),
  ];
}

/**
 * 部門 D003：2 active（測試處長轄區隔離 —— 處長 X 管 D001+D003，不可看到 D002 業務員）
 */
export function buildDeptD003Active(): ObEmphire[] {
  return [
    buildEmphire({ emp_id: 'D003E001', dept_code: 'D003', dept_name: '中區業務三部' }),
    buildEmphire({ emp_id: 'D003E002', dept_code: 'D003', dept_name: '中區業務三部' }),
  ];
}

/**
 * 完整資料集：所有上述部門合併（一鍵 seed）。
 */
export function buildFullEmphireDataset(): ObEmphire[] {
  return [
    ...buildDeptD001ActiveAndResigned(),
    ...buildDeptD002AllResigned(),
    ...buildDeptD003Active(),
  ];
}

/** 重置 counter（測試之間隔離用） */
export function resetEmphireCounter(): void {
  counter = 1000;
}
