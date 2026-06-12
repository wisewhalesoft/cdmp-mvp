/**
 * CR 優先分派前置步驟 — JS oracle（F102 / AD-E07-30）
 *
 * 在 F101 Stage 3/4 比例分派**之前**插入的 CR 預指派前置處理，實作 legacy SP
 * `SP_INFOT_ASSIGNEXPORTNAMELIST_st2_dept`（第 116–190 行 CR LIVE 段，UTF-16LE 解碼）之
 * 失效清空 + CR 優先指派邏輯，以確定性排序鍵取代 SP 之隱含順序（I-DET-CR-01）。
 *
 * 本模組為**純函式群組**（無 DB、無 NestJS Injectable），同時是 JS executeV2 oracle 與
 * PG SQL 下推（cr-priority-sql.ts）之「黃金預期」來源（兩路徑確定性等價，DoD EQ 群組）。
 *
 * 三步驟（嚴格序 1→2→3，BR-F102-04~09）：
 *   - 步驟 1（逾2年清空）：cr_id 非空且 appl_date < twoYearsAgo（嚴格小於）→ cr_id/cr_nm=NULL、is_cr='N'
 *   - 步驟 2（離職清空）：步驟 1 後剩餘 CR 案，cr_id INNER JOIN ob_emphire，
 *       resign_date 非 NULL 且 < sysDate（嚴格小於）→ 清空；查無 emp_id 不清空（BR-F102-08）
 *   - 步驟 3（CR 優先指派）：步驟 1/2 後剩餘 CR 案，cr_id 在 ob_empl_set（ration>0）有設定
 *       → emplid=cr_id、dept_id/emplid_deptid=deptid_m（多筆取 deptid_m ASC 第一筆，I-DET-CR-01）、is_cr='Y'
 *
 * 清空一律設 NULL（非空字串，AD-E07-30 OQ-1 裁定）：與 SQL `= NULL` 一致，確保 EQ 等價型別不衝突。
 *
 * cr_enabled=false 之閘控（強制 is_cr='N'）由 pipeline 呼叫端處理，不在本模組（保持純函式可測性，
 * AD-E07-30 §5.3）。
 *
 * 確定性（I-DET-CR-01 / I-DET-01）：全程無任何亂數函式（無資料庫 NEWID、無 JS 亂數、無隨機 UUID）；
 * 步驟 3 多筆 deptid_m 命中以 deptid_m ASC 取第一筆。
 */

/** CR 前置步驟案件輸入（Stage 1 已帶入 cr_id/cr_nm/is_cr/appl_date，I-CR-COLSRC-01）。 */
export interface CrCase {
  orgno: string;
  appl_no: string;
  cr_id: string | null;
  cr_nm: string | null;
  /** 來源原值（'Y' | 'N' | '' 等）。 */
  is_cr: string;
  /** 申請日 'YYYY-MM-DD'（null → 步驟 1 不觸發，無可比較日期）。 */
  appl_date: string | null;
}

/** ob_empl_set（list_no 已過濾，ration>0）。 */
export interface CrEmplSet {
  emplid: string;
  deptid_m: string;
  ration: number;
}

/** ob_emphire（resign_date 為 null 表在職）。 */
export interface CrEmphire {
  emp_id: string;
  /** 離職日 'YYYY-MM-DD'；null 表在職。 */
  resign_date: string | null;
}

/** CR 前置步驟結果（per case）。 */
export interface CrAssignment {
  orgno: string;
  appl_no: string;
  cr_id: string | null;
  cr_nm: string | null;
  /** 步驟後結果：'Y'（步驟 3 指派）| 'N'（清空）| 原值（不指派、不清空）。 */
  is_cr: string;
  /** 步驟 3 指派後有值；否則 null。 */
  emplid: string | null;
  /** 步驟 3 指派後有值；否則 null。 */
  dept_id: string | null;
  emplid_deptid: string | null;
}

/**
 * 由 project_workym（YYYYMM）計算 @SYS_DT（名單月第一天）與 twoYearsAgo（往回 2 年同月 1 日）。
 *
 * 以字串算術（非 Date 物件），消除 timezone 干擾（feedback_typeorm_between_timezone）；
 * 兩值皆 'YYYY-MM-DD'，供步驟 1/2 嚴格小於字串比較與 PG `:param::date` 綁定共用。
 *
 * 範例：'202606' → { sysDate:'2026-06-01', twoYearsAgo:'2024-06-01' }
 *       '202612' → { sysDate:'2026-12-01', twoYearsAgo:'2024-12-01' }（跨年邊界）
 */
export function computeCrSysDates(ym: string): {
  sysDate: string;
  twoYearsAgo: string;
} {
  const yyyy = ym.slice(0, 4);
  const mm = ym.slice(4, 6);
  const sysDate = `${yyyy}-${mm}-01`;
  const twoYearsAgo = `${String(parseInt(yyyy, 10) - 2)}-${mm}-01`;
  return { sysDate, twoYearsAgo };
}

/** appl_date / resign_date 已為 'YYYY-MM-DD' 字串時直接比較；Date 物件先正規化。 */
function toYmd(value: string | Date | null): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) {
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, '0');
    const d = String(value.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  // 'YYYY-MM-DD'（或帶時間）→ 取前 10 字元日期部分。
  return value.slice(0, 10);
}

/**
 * CR 優先分派前置步驟（F102，per-list；cr_enabled=true 才呼叫本函式）。
 *
 * @param cases    本 list 工作集案件（Stage 1 已帶入 cr_id/cr_nm/is_cr/appl_date）
 * @param emplSet  ob_empl_set（list_no + ration>0，已過濾）
 * @param emphire  ob_emphire（全量或 cr_id 相關子集）
 * @param sysDate  @SYS_DT = project_workym + '01'（'YYYY-MM-DD'）
 * @returns        per-case CR 指派結果（順序與輸入 cases 一致）
 */
export function applyCrPriority(
  cases: CrCase[],
  emplSet: CrEmplSet[],
  emphire: CrEmphire[],
  sysDate: string,
): CrAssignment[] {
  // twoYearsAgo = sysDate 往回 2 年同月 1 日（'YYYY-MM-DD'）。
  const yyyy = sysDate.slice(0, 4);
  const rest = sysDate.slice(4); // '-MM-DD'
  const twoYearsAgo = `${String(parseInt(yyyy, 10) - 2)}${rest}`;

  // ob_emphire：emp_id → resign_date（'YYYY-MM-DD' | null）。
  const emphireMap = new Map<string, string | null>();
  for (const e of emphire) {
    emphireMap.set(e.emp_id, toYmd(e.resign_date));
  }

  // ob_empl_set：emplid → 多筆 { deptid_m, ration }（ration>0 已過濾；deptid_m ASC 取第一筆）。
  const emplSetByEmplid = new Map<string, CrEmplSet[]>();
  for (const e of emplSet) {
    if (e.ration <= 0) continue;
    const arr = emplSetByEmplid.get(e.emplid);
    if (arr) arr.push(e);
    else emplSetByEmplid.set(e.emplid, [e]);
  }

  const out: CrAssignment[] = [];
  for (const c of cases) {
    const r: CrAssignment = {
      orgno: c.orgno,
      appl_no: c.appl_no,
      cr_id: c.cr_id,
      cr_nm: c.cr_nm,
      is_cr: c.is_cr,
      emplid: null,
      dept_id: null,
      emplid_deptid: null,
    };

    // ----- 步驟 1：逾2年清空（appl_date < twoYearsAgo，嚴格小於）-----
    if (r.cr_id !== null && r.cr_id !== undefined) {
      const apply = toYmd(c.appl_date);
      if (apply !== null && apply < twoYearsAgo) {
        r.cr_id = null;
        r.cr_nm = null;
        r.is_cr = 'N';
      }
    }

    // ----- 步驟 2：離職清空（INNER JOIN ob_emphire，resign_date < sysDate，嚴格小於）-----
    if (r.cr_id !== null && r.cr_id !== undefined) {
      const hasEmp = emphireMap.has(r.cr_id);
      if (hasEmp) {
        const resign = emphireMap.get(r.cr_id) ?? null;
        // resign_date 非 NULL（在職表 NULL，不觸發）且嚴格小於 sysDate → 清空。
        if (resign !== null && resign < sysDate) {
          r.cr_id = null;
          r.cr_nm = null;
          r.is_cr = 'N';
        }
      }
      // hasEmp=false（INNER JOIN 不命中）→ 不清空（BR-F102-08）。
    }

    // ----- 步驟 3：CR 優先指派（INNER JOIN ob_empl_set ration>0，deptid_m ASC 取第一筆）-----
    if (r.cr_id !== null && r.cr_id !== undefined) {
      const matches = emplSetByEmplid.get(r.cr_id);
      if (matches && matches.length > 0) {
        const chosen = matches
          .slice()
          .sort((a, b) =>
            a.deptid_m < b.deptid_m ? -1 : a.deptid_m > b.deptid_m ? 1 : 0,
          )[0]; // I-DET-CR-01：deptid_m ASC 第一筆
        r.emplid = r.cr_id;
        r.dept_id = chosen.deptid_m;
        r.emplid_deptid = chosen.deptid_m;
        r.is_cr = 'Y';
      }
      // 無記錄（或全 ration<=0）→ 維持原值（is_cr 不改，案件進 F101 比例池）。
    }

    out.push(r);
  }
  return out;
}
