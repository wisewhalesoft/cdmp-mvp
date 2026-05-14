import { Info } from 'lucide-react';

/**
 * F069 樣式對齊（review 差異 #29）：計分卡設定底部操作說明 banner。
 *
 * 對應 prototype 28 line 472-479 — 在所有 Tab 都持續顯示的「計分卡設定操作說明」
 * footer note。
 *
 * 行為差異：原 v1.4 footer 寫在 `ScoringConfigLegacyTabs` 內，只有 Tab 2-4
 * 才顯示；Iter 7 已將 footer 提升到 Shell 層，所有 Tab（含 Tab 1 / Tab 5）皆可見。
 */

export function ScoringConfigFooterNote() {
  return (
    <div
      data-testid="scoring-config-footer-note"
      className="mt-4 flex items-start gap-2 p-3 bg-blue-50/50 border border-blue-100 rounded-lg text-xs text-gray-600"
    >
      <Info size={16} className="text-blue-600 mt-0.5 shrink-0" />
      <div>
        <p className="font-medium text-gray-700 mb-0.5">計分卡設定操作說明</p>
        <p>
          覆寫式編輯（無草稿、無 rollback），歷史追溯依賴月跑 config 快照（F066）。月跑執行中（
          <code>assignment_run.status IN ('pending','running')</code>
          ）所有編輯功能將被鎖定（409 <code>SCORING_VERSION_LOCKED</code>
          ）。複雜計分邏輯由 PostgreSQL function{' '}
          <code>fn_calc_tier_level</code> 實作（AD-E07-3）。CARD_TYPE
          停用為級聯 hard delete，刪除 6 張下游表後不可復原；歷史月跑快照（
          <code>assignment_run_snapshot</code>）保留。
        </p>
      </div>
    </div>
  );
}
