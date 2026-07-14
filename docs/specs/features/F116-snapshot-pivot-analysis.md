---
spec-id: F116
title: 快照詳情 — 樞紐分析頁籤
feature-id: F116
source-story: US-181（待建）
epic: E07 — 客戶名單分派
module: M05 執行歷史 / 快照詳情
priority: P2
version: "1.0"
date: 2026-07-14
status: Draft
---

# F116: 快照詳情 — 樞紐分析頁籤

Priority: P2 | Status: Draft | Last Updated: 2026-07-14

> **目的**：於「客戶名單分派 > 執行歷史 > 快照詳情」（[[F066]]）新增**第 4 個頁籤「樞紐分析」**，以互動式交叉表呈現分派結果的「部門名稱 × 承辦人員 × 名單代號」案件數，對齊「結果摘要」匯出 Excel 之樞紐分析頁（F108 / legacy `reference/202607 分派名單.xlsx` 工作表2）。
>
> **拍板（使用者 2026-07-14）**：
> - 值預設 = **計數（案號數）**，另提供 **佔比（% of parent row）** toggle（對齊 F108 匯出樞紐頁語意）。
> - 員編列同時顯示**姓名**（`ob_emphire.emp_nm`）以利閱讀。
> - 對**所有可進入快照詳情的角色**可見（部長 / 處長；處長套轄區 scope）。

---

## 1. 功能摘要

樞紐分析頁籤將 run 之 `ob_monthly_run_result` 依 **部門名稱（`ob_emphire.dept_name`，承辦人員所屬）→ 員編（+姓名）** 為階層列、**名單代號（`list_no`）** 為欄、**案號計數** 為值，聚合成交叉表；提供部門展開/收合、計數/佔比切換、總計行與列。資料由後端聚合端點提供（GROUP BY），前端僅渲染與換算佔比。

## 2. User Story

**As a** 業務部長 / 業務處長
**I want** 在快照詳情以樞紐交叉表檢視各部門／承辦人員在各名單的分派案件數
**So that** 快速掌握分派分佈，與「結果摘要」匯出的樞紐頁一致，免下載 Excel

## 3. 前置條件

- 使用者已登入且通過 `DirectorOrSectionChiefGuard`。
- 目標 `run_id` 存在且已完成（`ob_monthly_run_result` 有結果列）。

## 4. 驗收標準

### AC-1：樞紐頁籤與交叉表
- **Given** 使用者於快照詳情
- **When** 點「樞紐分析」頁籤
- **Then** 顯示交叉表：列＝部門名稱（可展開為員編）、欄＝名單代號、值＝案號計數；含最右「總計」欄與最下「總計」列。
- **And** 員編列顯示「員編 + 姓名」。

### AC-2：計數 / 佔比 切換
- **Then** 預設顯示**計數**；切至**佔比**時以「% of parent row」呈現：部門列 = 部門/欄總計、員編列 = 員編/所屬部門同欄、總計列 = 100%（0/0 → 空白）。

### AC-3：展開 / 收合
- **Then** 每個部門列可展開/收合其員編列；提供「全部展開 / 全部收合」。

### AC-4：處長轄區 scope
- **Given** `businessRole = 'section_chief'`
- **Then** 聚合僅含處長轄區內 `emplid`（`scopeByCreator`）；不回 403（同 [[F066]] BR-5/BR-6）。無轄區 → 空表（總計 0）。

### AC-5：run 不存在
- **Then** 回 404 `ASSIGNMENT_RUN_NOT_FOUND`。

## 5. API 規格

### 5.1 GET /api/v1/assignment/runs/:runId/pivot

聚合來源：`ob_monthly_run_result r` LEFT JOIN `ob_emphire e ON e.emp_id = r.emplid`，
`GROUP BY e.dept_name, r.emplid, e.emp_nm, r.list_no`（COUNT(*)）。**不 join `ob_pool_data`**（樞紐不需 pool 業務欄）。dept/emplid 為 NULL/空 → 歸組 `(空白)`。

**Response — 200 OK**

```json
{
  "runId": "...",
  "listNos": ["OB202607001", "OB202607002", "..."],
  "depts": [
    {
      "deptName": "中區電銷1",
      "total": 19932,
      "byList": { "OB202607001": 4614, "OB202607002": 3486 },
      "emplids": [
        { "emplid": "20501", "empNm": "王大明", "total": 310, "byList": { "OB202607001": 46 } }
      ]
    }
  ],
  "grandByList": { "OB202607001": 13360 },
  "grandTotal": 76212
}
```

**排序（對齊 F108 I-PIV-DET-01）**：`listNos` 升冪；`depts` 依名稱 localeCompare（`(空白)` 最後）；`emplids` 升冪。

**佔比**：後端只回計數；前端 toggle 換算（部門格 = deptByList/grandByList、員編格 = empByList/deptByList、總計欄 = total/parentTotal）。

**權限**：`DirectorOrSectionChiefGuard`；處長走 `scopeByCreator`（`r.emplid IN (...)`；無轄區 → 空）。

**錯誤**

| HTTP | 錯誤碼 | 說明 |
|---|---|---|
| 401 | AUTH_TOKEN_MISSING | 未登入 |
| 403 | E07_ROLE_NOT_ASSIGNED | 角色非部長/處長 |
| 404 | ASSIGNMENT_RUN_NOT_FOUND | run 不存在 |

## 6. 商業規則

| 規則 | 說明 |
|---|---|
| BR-1 | 部門＝承辦人員所屬 `ob_emphire.dept_name`（與 F108 匯出樞紐頁一致，非案件分處 `ob_pool_data.dept_name`） |
| BR-2 | dept/emplid 為空 → 歸組「(空白)」，排序置末 |
| BR-3 | 佔比為前端換算；後端僅回計數（單一數據源、避免重算漂移） |
| BR-4 | 處長 scope 同 F066：縮小集合、不回 403 |

## 7. UI/UX 需求

- 對應 prototype：`prototypes/35-snapshot-detail.html`（第 4 頁籤「樞紐分析」）。
- 交叉表：sticky 首欄（列標籤）+ sticky 表頭；名單代號欄多 → 水平捲動（不使頁面本體橫捲）；總計行/列強調。
- 工具列：標題 + 值說明（計數 - 案號 / 佔比 - 案號）+ 全部展開/收合 + 計數/佔比 segmented toggle + 對應匯出樞紐頁註記。
- 員編列：員編（灰色小 mono）+ 姓名（主要）。
- 三態：載入 / 空（無結果）/ 錯誤。

## 8. 相依性

- **Blocked By**：[[F066]]（快照詳情頁）、F108（匯出樞紐頁語意來源）。
- **Related**：F063 / F064。

## 9. 交叉參考

- 快照詳情頁：[F066](F066-view-run-snapshot-detail.md)
- 匯出樞紐頁實作（語意來源）：`apps/api/src/modules/assignment/services/assignment-run-report.service.ts`（`accumulatePivot` / `writePivotSheet`）
- 結果表：`apps/api/src/database/entities/ob-monthly-run-result.entity.ts`
- Legacy 參照：`reference/202607 分派名單.xlsx`（工作表2 樞紐）
