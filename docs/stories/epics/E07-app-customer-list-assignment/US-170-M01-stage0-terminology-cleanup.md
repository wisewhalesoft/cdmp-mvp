---
last-updated: 2026-06-26
version: v1.0
change-summary: "Stage 0 試算頁術語全面清理：移除所有技術代號、公式框、原始路徑；改用業務語言；移除 base+1/餘數補 工作日類型區分；將『跳過』改為『休息日（不派案）』；calendarSource 下拉改業務標籤；保留功能，清理顯示層。"
---

# US-170：Stage 0 試算頁術語清理與 UI 標籤重整

> **Story ID**：US-170
> **Epic**：[E07 — 客戶名單分派](epic-brief.md)
> **模組**：M01 名單定義
> **優先級**：Must Have
> **階段**：Phase 2（Advanced）
> **預估點數**：3
> **Feature**：Stage 0 試算頁業務化重設計

---

## 背景說明

現行試算頁充斥技術代號，包括：`rest_flg=0`、`base ratio`、`remainder 餘數`、`base+1（餘數補）`、`ratioPerMille`、AD-E07-8 公式框、`ob_assign_set` / `ob_pool_data` / `OBPOOLDATA`、`STAGE0_POOL_WARN_THRESHOLD`、`calendar_date`、原始 API 路徑 `GET /api/v1/...`，以及「Daily estimate 不寫入 ob_assign_set」這類僅對工程師有意義的說明文字。

業務部長 / 處長無需看到這些內容。本 Story 清理所有使用者可見的技術術語，使頁面語言全面業務化。技術行為（千分位 ratio 計算、calendar 資料來源）完全保留，只是不再暴露給使用者。

---

## User Story

**As a** 業務部長 / 業務處長
**I want** 試算頁面的所有標籤、說明文字、警示訊息都以業務語言呈現，不出現工程代號
**So that** 我可以直接閱讀頁面上的資訊，不必請 IT 人員翻譯

---

## 驗收標準

### AC-1：移除技術代號顯示

- **Given** 試算頁在任何模式（彙總或單一名單）下顯示估算結果
- **When** 使用者查看頁面任何可見元素（標籤、標題、說明文字、表格欄位、KPI 卡片、工具提示）
- **Then** 以下技術術語**一律不出現**在使用者可見的文字中：
  - `rest_flg`、`rest_flg=0`
  - `base ratio`、`base`（以 ‰ 表示的千分位底數）
  - `remainder`、`餘數`（1000 mod 工作日 的計算概念）
  - `base+1`、`base+1（餘數補）`
  - `ratioPerMille`
  - `ob_assign_set`、`ob_pool_data`、`OBPOOLDATA`、`ob_pool_data_list`
  - `STAGE0_POOL_WARN_THRESHOLD`
  - `calendar_date`（作為欄位名稱出現時）
  - 任何 `GET /api/v1/...` 格式的 API 路徑
  - AD-E07-8（架構決策代號）

### AC-2：移除 AD-E07-8 演算法說明區塊

- **Given** 試算頁顯示估算說明區
- **When** 使用者查看說明區域
- **Then** 不顯示 AD-E07-8 公式框（即不顯示 `base = FLOOR(1000 / working_days)`、`rem = 1000 mod working_days` 等公式文字）
- **And** 不顯示「每日件數 = round(ratioPerMille / 1000 × total)」公式

### AC-3：移除「不寫入 ob_assign_set / 唯讀試算」技術說明文字

- **Given** 試算頁顯示任何說明文字
- **When** 使用者查看說明文字
- **Then** 不顯示「Daily estimate 不寫入 ob_assign_set」或類似提及 db table / 寫入行為的技術說明
- **And** 若需保留「試算為預覽，不影響正式月名單分派」語意，改以業務語言呈現，例如：「此試算不觸發正式分派，僅供工作量評估參考」

### AC-4：移除 base+1 / 餘數補工作日類型區分

- **Given** 試算頁顯示每日預估件數表格或 bar chart
- **When** 使用者查看每日列或 bar
- **Then** 每日不再區分「工作日（base）」vs「工作日+1（餘數補）」兩種狀態；每個工作日一律顯示其預估件數，不附加「base+1」徽章或特殊顏色標記
- **And** bar chart 的「工作日 base」/「工作日 base+1（餘數補）」圖例**移除**，改為單一「工作日」圖例
- **And** KPI 卡片中的 `base ratio (‰)`、`remainder 餘數` 兩項卡片**移除**（這些指標對業務使用者無意義）

### AC-5：平假日標籤改為業務語言

- **Given** 試算頁顯示每日列的工作日 / 假日標記
- **When** 使用者查看標記
- **Then** 工作日標記顯示「工作日」（移除 `(rest_flg=0)` 後綴）
- **And** 週末 / 國定假日標記顯示「休息日（不派案）」（取代「跳過」、`N (週末·國定假日)` 等舊標籤）
- **And** 兩種標記仍以視覺區別顯示（例如綠色 = 工作日、灰色 = 休息日），顏色編碼邏輯保留

### AC-6：表格欄位名稱改為業務語言

- **Given** 試算頁顯示每日預估明細表格
- **When** 使用者查看表格欄位標題
- **Then** 欄位標題為：「日期」、「星期」、「預估件數」、「累積件數」
- **And** 不使用 `calendar_date`、`ratioPerMille`、`isWorkday`、`skipReason` 作為欄位標題
- **And** 若有「工作日」欄位（顯示工作日 vs 休息日標記），標題為「日別」或等效業務語言

### AC-7：派案日曆下拉選單改為業務語言標籤

- **Given** 試算頁顯示「工作日來源」selector（對應 F049 `calendarSource`）
- **When** 使用者查看下拉選項
- **Then** 三個選項改為以下業務語言標籤（功能行為完全不變）：
  - `weekday`（原標籤）→ 「**派案日曆**（只排上班日）」：僅安排週一至週五的正常上班日，排除週末與國定假日
  - `weekday-only`（原標籤）→「**也排連假日**（週末除外）」：安排週一至週五，含國定假日（連假當天）
  - `all`（原標籤）→ 「**連週末都排**（全月每天）」：整個月每天都安排派案，包含週末與假日
- **And** 選項下方顯示簡短說明文字，幫助使用者理解選擇的影響（例如「選擇包含連假日可評估假日派案情境」）
- **And** 下拉標籤名稱改為「派案日曆」（取代「工作日來源」）

### AC-8：Pool 筆數偏低警示改為業務語言

- **Given** ob_pool_data 共享池筆數低於門檻
- **When** 試算頁顯示橘色警示
- **Then** 警示文字改為業務語言：「系統資料池筆數偏低（目前 N 筆），可能影響估算準確度，請聯繫 IT 確認資料是否已完成更新」
- **And** 不顯示 `OBPOOLDATA`、`STAGE0_POOL_WARN_THRESHOLD`、raw table name 等技術詞彙

---

## 測試案例

### TC-170-01：頁面任意位置掃描不出現技術術語

- **Given**：試算頁完整載入（彙總模式）
- **When**：對頁面 DOM 全文掃描 AC-1 列出的所有技術術語
- **Then**：`rest_flg`、`ratioPerMille`、`ob_assign_set`、`ob_pool_data`、`OBPOOLDATA`、`GET /api/v1/`、`AD-E07-8`、`base+1`、`remainder`、`STAGE0_POOL_WARN_THRESHOLD`、`calendar_date` 均不出現於可見文字

### TC-170-02：移除 KPI 卡片 base ratio / remainder

- **Given**：頁面載入完成
- **When**：查看 KPI 卡片區域
- **Then**：KPI 區域中不出現標題為 `base ratio` / `base (‰)` / `remainder 餘數` / `餘數` 的卡片

### TC-170-03：每日列不出現 base+1 徽章

- **Given**：當月有 20 個工作日，余數 rem = 1000 mod 20 = 0（實際任意月份）
- **When**：查看每日預估表格
- **Then**：每列不出現 `base+1（餘數補）` 徽章；工作日列顯示「工作日」、休息日顯示「休息日（不派案）」

### TC-170-04：派案日曆下拉顯示業務標籤且功能不變

- **Given**：頁面顯示派案日曆下拉
- **When**：使用者展開下拉
- **Then**：選項標籤為「只排上班日」、「也排連假日」、「連週末都排」（或等效業務語言）；切換後估算結果隨之變動（功能行為與原本相同）

### TC-170-05：Pool 偏低警示不含技術術語

- **Given**：ob_pool_data 筆數 < 門檻
- **When**：頁面顯示橘色警示
- **Then**：警示文字不含 `OBPOOLDATA`、`STAGE0_POOL_WARN_THRESHOLD`；包含業務語意的說明

---

## 依賴關係

- **Blocked By**：US-166（彙總視角頁面架構，術語清理依賴新頁面已存在）、US-167（部門公式輸出為本 Story 清理的表格資料來源）
- **Blocks**：無（本 Story 為 UI 清理，不影響其他 Story 的功能邏輯）

---

## Definition of Done

- [ ] AC-1 ~ AC-8 全部通過
- [ ] TC-170-01 DOM 全文掃描不出現 AC-1 技術術語（自動化 regression test）
- [ ] TC-170-02 KPI 卡片移除 base ratio / remainder
- [ ] TC-170-03 每日列無 base+1 徽章
- [ ] TC-170-04 派案日曆業務標籤且功能正常
- [ ] TC-170-05 Pool 警示業務語言
- [ ] `tsc --noEmit -p tsconfig.build.json` 乾淨通過
- [ ] 單元測試覆蓋率 ≥ 80%
- [ ] Code review 通過
- [ ] 文件已更新（F049 spec 更新 §8 UI/UX 術語清理段落）

---

## 相關文件

- **Epic Brief**：[E07 Epic Brief](epic-brief.md)
- **相關 Stories**：US-166（彙總視角，本 Story 清理其 UI 標籤）
- **Spec**：`docs/specs/features/F049-stage0-daily-estimate.md`（§8 UI/UX 需求需同步更新術語清理結果）
- **UI Ground Truth**：`prototypes/30-stage0-estimate.html`（下游 tdd-implementation 須以更新後 prototype 為準；矛盾時停下確認）
