---
last-updated: 2026-06-26
version: v1.0
change-summary: "新增 Stage 0 試算頁「人均每日件數」可行性指標：部門每日件數 ÷ 在職人數；超過門檻時紅色警示。"
---

# US-169：人均每日件數可行性指標（Stage 0 試算頁）

> **Story ID**：US-169
> **Epic**：[E07 — 客戶名單分派](epic-brief.md)
> **模組**：M01 名單定義
> **優先級**：Should Have
> **階段**：Phase 2（Advanced）
> **預估點數**：3
> **Feature**：Stage 0 試算頁業務化重設計

---

## 背景說明

US-167 計算出各部門每日預估件數後，業務部長 / 處長最常問的下一個問題是：「一個電訪員平均一天要打幾通？每天打得完嗎？」這個指標直接回答工作量可行性（feasibility），不需要使用者自行對人數做除法。

本 Story 新增「人均每日件數」（cases per person per day）欄位，以在職人數（ob_emphire，`dept_code` 對應 + `resign_date IS NULL`）為除數。同時支援可設定的「每人每日上限」門檻，超過門檻時以紅色標示，讓部長 / 處長即刻發現需要調整比例設定的部門。

---

## User Story

**As a** 業務部長（director）或業務處長（section_chief）
**I want** 在試算頁的部門每日件數旁，看到「平均每位電訪員當天需打幾通電話」以及是否超過負荷門檻
**So that** 可以直接判斷工作量配置是否可行，不必手動查人數再做除法

---

## 驗收標準

### AC-1：顯示人均每日件數欄位

- **Given** 試算頁已顯示部門每日預估件數（US-167 AC-1 計算完成）
- **When** 頁面呈現部門 × 日期的資料表格
- **Then** 每個部門每個工作日旁邊另顯示「人均每日件數」欄位
- **And** 計算公式：`per_person_daily = round( dept_daily_count[d][D] / active_headcount[D] )`
- **And** `active_headcount[D]` = `ob_emphire` 中 `dept_code = D` 且 `resign_date IS NULL` 的員工人數
- **And** 休息日的「人均每日件數」顯示「—」（與件數欄一致，不做除法）

### AC-2：在職人數為 0 時不 crash，顯示「—」

- **Given** 某部門 `D` 在 `ob_emphire` 中查無任何 `resign_date IS NULL` 的員工（可能因 ETL 尚未同步）
- **When** 計算人均每日件數
- **Then** 該部門的「人均每日件數」欄位顯示「—」（不做除法，不出現 `Infinity` / `NaN`）
- **And** 頁面不 crash，其他部門的數值正常顯示
- **And** 該部門顯示橘色提示：「D 部門在職人數為 0，請確認 ob_emphire 資料是否已同步」

### AC-3：超過負荷門檻時紅色警示

- **Given** 系統設定了「每人每日件數上限」門檻（`threshold`；門檻的預設值與配置方式為架構決策，由 spec-writer / 系統架構師裁定，本 Story 僅規定功能行為）
- **When** 某部門某工作日的 `per_person_daily` 超過 `threshold`
- **Then** 該欄位以紅色背景或紅色文字顯示（視覺上明顯區別於正常值）
- **And** 欄位旁顯示提示文字：「超過每人每日上限 {threshold} 件」
- **And** 未超過門檻時顯示綠色或無特殊顏色（正常狀態）

### AC-4：未設定門檻時不顯示紅色警示（降級顯示）

- **Given** 系統尚未設定「每人每日件數上限」門檻（門檻值為 null / 未配置）
- **When** 頁面顯示人均每日件數
- **Then** 所有人均件數欄位顯示計算值（正常文字，無紅色警示）
- **And** 不因缺少門檻值而 crash 或顯示錯誤

### AC-5：處長 scope 下的在職人數限縮

- **Given** 使用者為業務處長（`businessRole = 'section_chief'`，scope = 'D003'）
- **When** 頁面計算 D003 的人均每日件數
- **Then** `active_headcount['D003']` 僅計算 `dept_code = 'D003'` 且 `resign_date IS NULL` 的員工（與 US-168 scope filter 一致，不包含其他部門的員工）
- **And** 可行性指標與 US-168 scope 邊界一致，不暴露非轄區部門的人數資訊

---

## 測試案例

### TC-169-01：正常計算人均每日件數

- **Given**：D001 部門當日預估件數 = 120，ob_emphire D001 在職人數 = 10
- **When**：頁面呈現人均每日件數
- **Then**：D001 當日「人均每日件數」= 12

### TC-169-02：在職人數為 0 時顯示「—」不 crash

- **Given**：D005 部門在 ob_emphire 無 resign_date IS NULL 的員工記錄
- **When**：計算 D005 人均每日件數
- **Then**：D005「人均每日件數」顯示「—」，橘色提示「在職人數為 0」；頁面其他部門正常顯示

### TC-169-03：超過門檻時紅色警示

- **Given**：門檻設定為每人每日 15 件；D002 某日件數 = 200，在職人數 = 10（per_person = 20 > 15）
- **When**：頁面顯示
- **Then**：D002 該日人均件數欄為紅色，顯示「超過每人每日上限 15 件」

### TC-169-04：休息日人均件數顯示「—」

- **Given**：某日為週末（dept_daily_count = 0）
- **When**：呈現人均件數欄
- **Then**：所有部門的「人均每日件數」顯示「—」，不出現 0 ÷ N = 0 的數值（休息日不派案，無需顯示人均）

### TC-169-05：未設定門檻時顯示正常值不報錯

- **Given**：系統門檻值未設定（null）
- **When**：頁面載入
- **Then**：人均件數正常顯示計算值，無紅色警示；頁面不出現錯誤訊息

---

## 依賴關係

- **Blocked By**：US-167（需要部門每日件數 `dept_daily_count` 作為分子）、US-168（處長 scope filter 決定 AC-5 的可見範圍）
- **Blocks**：無（本 Story 為試算頁最後一層資訊豐富化）

---

## 開放問題

| OQ 編號 | 議題 | 狀態 |
|---------|------|------|
| OQ-169-01 | 「每人每日上限」門檻的預設值為何？可否由業務部長在頁面上動態調整（類似試算用的 slider），或是系統層級的固定設定（環境變數 / DB config）？**本 Story 僅規定顯示行為，門檻來源由 spec-writer / 架構師裁定** | 待 spec-writer 裁定 |
| OQ-169-02 | `active_headcount` 的 dept_code 欄位對應關係：ob_emphire.dept_code 是否直接對應 ob_dept_pct.obdeptid（兩者使用相同的部門代號空間）？若不同，需要 mapping table | 待 spec-writer / 架構師確認 schema |

---

## Definition of Done

- [ ] AC-1 ~ AC-5 全部通過
- [ ] TC-169-01 ~ TC-169-05 全部通過
- [ ] 在職人數為 0 不 crash（TC-169-02）
- [ ] 超過門檻紅色警示（TC-169-03）
- [ ] 未設定門檻不報錯（TC-169-05）
- [ ] `tsc --noEmit -p tsconfig.build.json` 乾淨通過
- [ ] 單元測試覆蓋率 ≥ 80%
- [ ] Code review 通過
- [ ] 文件已更新（F049 spec 新增可行性指標章節）

---

## 相關文件

- **Epic Brief**：[E07 Epic Brief](epic-brief.md)
- **相關 Stories**：US-167（部門每日件數公式，本 Story 的輸入）、US-168（處長 scope，本 Story AC-5 的邊界來源）
- **資料來源**：`ob_emphire`（在職人數查詢：`dept_code = D AND resign_date IS NULL`）
- **Spec**：`docs/specs/features/F049-stage0-daily-estimate.md`（需新增可行性指標章節）
