---
type: test-design-feature
feature_id: F063
feature_name: 計分警告 Banner（ScoringWarningBanner）
priority: P1
related_spec: /docs/specs/features/F063-scoring-warning-banner.md
last_updated: 2026-05-18
spec_version: "1.0"
---

# F063: 計分警告 Banner — 測試設計

---

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + F061-test.md（warningSummary 資料結構） |
| QA / Tester | 本文件 + F063-scoring-warning-banner.md（原始 spec） |
| CI/CD Owner | `test-index.md` |
| Product Analyst | `risks-and-gaps.md` |

---

## 測試策略概覽

| 項目 | 說明 |
|------|------|
| 主要測試層 | Frontend Unit（React Testing Library） |
| Component 路徑 | `apps/web/src/pages/assignment/_components/scoring-warning-banner.tsx`（待建立） |
| Pattern | 同 rejection-banner.test.tsx（data-testid 驅動） |
| warningSummary 來源 | F061 月名單分派回傳 reportPayload.warningSummary（JSONB 子鍵） |

---

## Test Scenarios

| ID | 場景 | 測試類型 | 規格檔 |
|----|------|---------|--------|
| TS-F063-WB-001 | warningSummary=null → 不渲染 | Frontend Unit | `f063-warning-banner.test.tsx` |
| TS-F063-WB-002 | warningSummary.issueCount=0 → 不渲染 | Frontend Unit | 同上 |
| TS-F063-WB-003 | issueCount>0 → 渲染警告 banner | Frontend Unit | 同上 |
| TS-F063-WB-004 | MISSING_MATCH_TYPE → 顯示中文說明 | Frontend Unit | 同上 |
| TS-F063-WB-005 | EMPTY_SCORE_RANGE → 顯示中文說明 | Frontend Unit | 同上 |
| TS-F063-WB-006 | COMPOSITE_MISSING_BASELINE → 顯示中文說明 | Frontend Unit | 同上 |
| TS-F063-WB-007 | 多個 issue → 全部顯示（不截斷） | Frontend Unit | 同上 |
| TS-F063-WB-008 | 點關閉 → 觸發 onDismiss callback | Frontend Unit | 同上 |
| TS-F063-WB-009 | runStatus=failed → 顯示「稽核失敗」樣式（非一般警告） | Frontend Unit | 同上 |
| TS-F063-WB-010 | issue.columnName 顯示於 banner | Frontend Unit | 同上 |

---

## data-testid 規範

| testId | 說明 |
|--------|------|
| `scoring-warning-banner` | 外層容器 |
| `scoring-warning-issue-list` | issue 清單容器 |
| `scoring-warning-issue-item` | 每個 issue item，含 `data-issue-type` 屬性 |
| `scoring-warning-dismiss` | 關閉按鈕 |

---

## tdd-implementation 指令

1. 建立 `scoring-warning-banner.tsx`：props 為 `warningSummary`, `runStatus`, `onDismiss?`
2. issue.type 對應中文說明映射表（實作時與 PM 確認措辭）
3. runStatus='failed' 使用紅色背景或 data-status='failed'（與一般警告視覺區分）
4. 套用上述 data-testid 規範
