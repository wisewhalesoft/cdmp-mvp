---
spec-id: F120
title: Stage 0 試算頁「名單基礎預估數量總覽」區塊（按產品類別分組小計）
feature-id: F120
source-story: US-184
epic: E07
module: M01 名單定義（Stage 0 試算頁）
priority: P1
version: "1.3"
date: 2026-08-20
status: Draft
---

# F120: Stage 0 試算頁「名單基礎預估數量總覽」區塊（按產品類別分組小計）

Priority: P1 | Status: Draft | Last Updated: 2026-08-20

> **v1.3（2026-08-20 / ui-ux-designer 六項定案編碼進 AC — 使其可被 test-generator 斷言）**：prototype `30-stage0-estimate.html` 已完成（設計報告見 [`ui-ux-design-overview.md` 附錄 D](../../ui-ux-design-overview.md)）。其定案原本**只存在於 prototype 與設計報告**，而 test-generator 僅讀 spec ＋ prototype，故本版將其編碼為 AC 條文。**新增之條文皆為既有 AC 之細化，AC / BR 總數不變（14 / 14）**，演算法、契約 shape、授權特例、術語規範均未變動。
> 1. **[AC-LIST-04] ★顯示端不做去重**（最高誤修風險）：`GROUP-RESOLVE` 步驟 6b 之去重**僅屬分組判定**；顯示須為 `formatConditionSummary()` 之逐字輸出，故 `values = ['01','01']` 畫面上即為「產品類別：汽車、汽車」。**看似瑕疵但為刻意**——去重即與名單詳情不逐字相同、違反 TC-184-12。已明文禁止下游為畫面美觀而在顯示端去重／排序／合併（承 D-Q2，spec-writer 同意）。
> 2. **[AC-LIST-08] ★`0%` 與「—」兩情境對照**：「不得顯示 `0%`」**僅**適用於**分母（總計）為 0**；分子 0、分母 > 0 時 `0%` 是**正確且必須**顯示之值（該組全數未能估算但當月其他組仍有估算值）。已改為對照表，避免下游讀成自我矛盾而誤修（承 D-Q3）。§5.5 公式本即同時滿足兩種情境，**不需**額外分支。
> 3. **[AC-LIST-04] OQ-F120-U1 ① 三個參數定案**：多筆條件**不串接成句、每筆各自一個標籤**（AND 語意不可被「、」讀成 OR）＋底部「且」關係說明句；截斷＝**前 2 筆 ＋「＋N 項」**（沿用名單定義列表既有慣例，全站單一截斷語彙）；展開＝**就地展開之真正 `<button>`**、焦點回到觸發按鈕，**明文禁止 hover / tooltip / 浮層**（各附失效理由）。
> 4. **[AC-LIST-11] ★三個觸點皆為必要**：①標題徽章「全公司口徑」②表格正上方說明條（第一行逐字）③**總計列後綴「（全公司口徑）」**。**只做一處或兩處視為未通過**——③ 最關鍵，主管常直接跳至總計，此時說明條已捲出畫面。觸發條件為 `role === 'section_chief'`，**與有無轄區無關**（無轄區降級場景亦須完整呈現）。
> 5. **[AC-LIST-08] OQ-F120-U2 定案**：單一名單鑽探**保留佔比欄位、所有格顯示「—」、欄標題下加灰字副標**；明文寫出**不得顯示 `100%`**（同義反覆且會被誤讀為「佔全月總量 100%」）與**不得抽掉欄位**（破壞表頭一致性、增加版面分支）之理由。
> 6. **[AC-LIST-08] 明確允許「分組列即小計列」**：三項數字得直接置於分組標題列，**不要求**獨立小計列；並反向明示**不得**為照字面做出獨立小計列——那會在**收合**分組時把小計一併藏掉，反違反本 AC 目的（承 ui-ux D-3，team lead 採納）。
> 7. **§13.2 OQ-F120-U1 / U2 / U3 全數關閉**，並新增 **§13.2.1 prototype 測試掛點表**（`list-overview-*` 系列 `data-testid` ↔ AC 對照），供 test-generator 直接定位。
> 8. **連帶**：[F049 v2.2](F049-stage0-daily-estimate.md) 記錄處長唯讀 banner 文案變更（「**部門相關區塊**僅顯示您轄區部門…」）——原文案在本區塊存在後已成假敘述且與 AC-LIST-11 正面矛盾。
>
> **v1.2（2026-08-20 / 欄位命名最終裁決 ＋ 嚴格相等豁免條件定案）**：兩項收斂，**AC / BR 總數不變（14 / 14）**，演算法、契約 shape、授權特例、術語規範均未變動。
> 1. **欄位命名最終裁決（team lead）＝ [F049](F049-stage0-daily-estimate.md) 之月層級欄位名為 `orgMonthTotal`**（本輪草擬過程中曾短暫採用之其他候選名稱**全數作廢**）。理由：①`prototypes/30-stage0-estimate.html:517` 本即為 `orgMonthTotal`（prototype 為 UI ground truth，見 §12 G-1 之查證）②前端既有變數 `stage0-estimate-page.tsx:227` 即同名③與同一回應內既有之 `days[].orgTotal` 同族，避免同一個數字出現第三種叫法。本檔所有引用已同步。
> 2. **跨區塊嚴格相等之邊界條件已定案**（[AD-E07-51](../implementation-log/AD-E07-51-f120-list-estimate-overview.md) v1.2 §4.5.1 / `I-LISTOVW-STRICT-EQUALITY-BOUNDARY-01`，關閉 OQ-F120-A5）：**AC-LIST-09 改以「充分條件 + 測試層指示 + 生產殘留風險」三段撰寫**——**充分條件＝`excluded(dept-estimate) === excluded(list-estimate-overview)`**（兩端因無估算值而被排除之名單編號集合相同）⟹ 嚴格相等（`unestimatedListCount = 0` 僅為其**特例**，兩者**非等價**）；**測試層指示＝TC-184-07 於測試套件中無條件斷言嚴格相等**，**不得**加 `unestimatedListCount` 分支——測試環境下兩端排除集合恆相等（分歧唯一成因需真實 DB 負載下之網路時序競爭），加分支反而放棄「排除集合相同且非空 → 縮減後仍相等」之驗證力道（含 AC-LIST-10 部分降級測試本身）；**生產環境**之 timeout 分歧窗口列為**已知殘留風險**（非靜默錯誤、非測試豁免分支），根因處置為提高 F088 物化覆蓋率而非讀取端加快取。另新增「**兩組關係不得混淆**」對照表（**跨端點・月層級 vs 月層級**＝嚴格相等；**同端點內・月層級 vs 逐日捨入值之和**＝**不得斷言相等**），並確認 `orgMonthTotal` 型別為 `number`（非 nullable、所有角色皆回傳）故**處長角色下亦可斷言**。`I-F120-03` / §11 TC-184-07 同步。
>
> **v1.1（2026-08-20 / OQ-F120-B1 已裁決：跨區塊一致性收緊為嚴格相等）**：使用者 / team lead 就 §12 G-1 拍板——**採首選主張，[F049](F049-stage0-daily-estimate.md) 月層級「本月全名單總量」改為 `Σ_L list_total[L]` 精確和**（已落地為 [F049 v2.1](F049-stage0-daily-estimate.md) §16.5 / AC-DEPT-3 / BR-17）。本版據此收緊三處：**AC-LIST-09**（移除容差寫法，改「數值嚴格相等」，並明列「不得誤推為 Σ 各日顯示值」）、**`I-F120-03`**（由「同源」擴為「同源＋顯示值嚴格相等」）、**§11 TC-184-07**（斷言形式改嚴格相等）。§12 G-1 標為 ✅ 已裁決並保留原分析作為溯源；§13.3 OQ-F120-B1 關閉，**本 feature 對 team lead 已無殘留待裁項目**。**AC / BR 總數不變（14 / 14）**，演算法、契約 shape、授權特例、術語規範均未變動。
> - **實作路徑已定案**（[AD-E07-51](../implementation-log/AD-E07-51-f120-list-estimate-overview.md) §4.5 / §4.3，team lead 已核准）：F049 側以新欄位 **`orgMonthTotal`**（欄位名固定）承載，值來自 `Stage0EstimateService.resolveListTotals(ym, listNo?)` 之 Map reduce；本區塊之 `computeListEstimateOverview` 與 `computeDeptEstimate` **共同呼叫**該方法（`I-LISTOVW-SHARED-SOURCE-01`），故 `I-F120-03` **依建構成立**。
> - **⚠️ 嚴格相等留有豁免伏筆**：AC-LIST-09 寫為「**正常情況**嚴格相等」，並明確指向 [AD-E07-51](../implementation-log/AD-E07-51-f120-list-estimate-overview.md) **§8** 待補之豁免條件（兩端點各自 fallback dry-run 而其中一次逾時之情境）；**未**寫成無條件嚴格相等，以免下游測試出現間歇性紅燈。追蹤項＝新增之 **OQ-F120-A5**（§13.1）。
> - **§13.1 OQ-F120-A1~A4 全數關閉**：已由 AD-E07-51 §4 裁定（獨立端點 `GET /assignment/stage0/list-estimate-overview`／後端計算＋純函式 `resolveListGroup()`／`resolveListTotals` 共用／不新增快取層），本檔已記錄裁決結果供溯源。
>
> **v1.0（2026-08-20 / 依已定案之 US-184 v1.1 建立）**：於 [F049 v2.0](F049-stage0-daily-estimate.md) Stage 0 試算頁（`/assignment/estimate`）**新增第三個區塊**「名單基礎預估數量總覽」，與既有「部門負載總覽」「部門每日分派明細」並列。本區塊以**名單**為單位（非部門），逐筆呈現名單編號／名單名稱／篩選條件／預估數量，並依產品類別分組小計（汽車 → 機車 → 一般商品 → 多重產品類別 → 未分類）。
>
> **本 feature 不改動 F049 既有兩區塊之任何行為**（公式、捨入、缺口、人均、處長 scope 隔離全數原樣保留），僅在同一頁面、同一名單集合、同一數值底座（L1 `list_total[L]`）之上新增一種呈現角度。**遵守 [F049 §22.1 I-RUN-EST-01](F049-stage0-daily-estimate.md)**：不得分叉或修改底層 calendar / ratio / per-list dry-run 邏輯。
>
> **三項已定案之人類裁決（2026-08-20，US-184 v1.1）已完整落規格，不再列為待確認**：①分組歸屬（多值 → 「多重產品類別」單一組、文字運算子與未設定 → 「未分類」，互斥且完備）②業務處長比照 [F049 §17 BR-12](F049-stage0-daily-estimate.md) **全量可見**（不依轄區限縮）＋**必要之語意標示**③分組小計須顯示佔比（分母＝預估數量總計）。
>
> **不新增錯誤碼**（沿用既有 `STAGE0_LIST_ESTIMATE_PARTIAL` warning 與 `STAGE0_ESTIMATE_TIMEOUT`）、**無 migration**（不新增任何欄位或資料表）、**唯讀**（不寫入任何分派紀錄）。
>
> **端點拓樸（新增獨立端點 vs 擴充既有 `dept-estimate`）交 system-architect**（承接 US-184 OQ-184-05，見 §13 OQ-F120-A1）；本檔僅定義契約 shape、資料來源映射、判定演算法與不變量。
>
> **刻意未動（邊界）**：`architecture-spec.md` / `data-model.md` / AD（system-architect）；`prototypes/30-stage0-estimate.html`（ui-ux-designer）；`apps/**` code / test（tdd-implementation / test-generator）；`error-handling.md`（本輪確認**無**新錯誤碼需求，見 §8）。

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + [F049](F049-stage0-daily-estimate.md) §14~§22 + `data-model.md`（`ob_list_definition` / `pooldata_field_option`） |
| QA / Tester | 本文件（§4 / §10 / §11） + [`error-handling.md#assignment-run-warnings`](../error-handling.md#assignment-run-warnings) |
| UI/UX Designer | 本文件（§9 / §12 / §13） + [F049 §19](F049-stage0-daily-estimate.md) 術語清理 + `prototypes/30-stage0-estimate.html` |
| Architect | 本文件（§6 / §13） + [F049 §23](F049-stage0-daily-estimate.md) + `architecture-spec.md` |

---

## 對應 User Story

- [US-184](../../stories/epics/E07-app-customer-list-assignment/US-184-M01-stage0-list-estimate-overview.md) v1.1（已定案；AC-LIST-01~14 / TC-184-01~16 為最終業務契約，本 feature **未修改** US-184）

---

## 1. 功能摘要與範圍

### 1.1 摘要

於 Stage 0 試算頁新增唯讀區塊「**名單基礎預估數量總覽**」。該區塊列出當月**全部啟用名單**（與同頁其他區塊完全相同之名單集合），每筆顯示：名單編號、名單名稱、篩選條件、預估數量；名單依「產品類別」分為五組並顯示各組名單數、預估數量小計與佔比，最後以總計列收斂。

目的：讓業務部長 / Admin 在拆解到部門負載之前，先掌握「本月跑哪幾份名單、量體如何分佈在各產品類別之間」，快速辨識漏設、誤設或量體異常之名單。

### 1.2 與 F049 之關係（硬性約束）

| 項目 | 約束 |
|---|---|
| 頁面位置 | [F049 v2.0](F049-stage0-daily-estimate.md) 之 Stage 0 試算頁（`/assignment/estimate`）**第三個區塊**；既有「部門負載總覽」「部門每日分派明細」**不得**被改動、合併或重排其內部表格結構 |
| 名單集合 | 與 F049 §15 之 L2 聚合層**完全相同**：當月 `project_workym = :ym` 且 `status = 'active'` 之名單；不因 `stage`（draft/dept_ratio/personnel_ratio/approval/ready）排除 |
| 顯示模式 | 沿用 F049 AC-AGG-1 / AC-AGG-2 之「全名單彙總 / 單一名單鑽探」；本區塊隨同一個名單篩選器連動，**不另設一套篩選器** |
| 數值底座 | 預估數量取自 F049 §14.2 之 **L1 `list_total[L]`**（優先 `stage0_estimate_count` 物化值，缺值時 fallback 完整 Stage 1 dry-run COUNT）；**禁止**另開一套 per-list 估算邏輯 |
| I-RUN-EST-01 | 本 feature 僅在 L1 之上做「分組 + 加總 + 佔比」之**加法**，**不得**分叉或修改 `computeWorkingDayRatios` / `executeStage1Chain` / `estimateListCount` 之任何行為（[F049 §22.1](F049-stage0-daily-estimate.md)） |
| 唯讀 | 沿用 [F049 BR-1](F049-stage0-daily-estimate.md) / AC-AGG-5：不寫入 `ob_pool_data_list`、`assignment_run`、`assignment_run_snapshot`、`ob_monthly_run_result` 或任何分派紀錄 |
| 日曆維度 | 本區塊為**月層級名單總量**，**不**涉及每日投影（`dpm[d]`）、不涉及部門比例（`ration[L][D]`）、不涉及人均可行性 |

### 1.3 不在本 feature 範圍

- 匯出本區塊內容（Excel / CSV）
- 由本區塊鑽探至案件明細層級
- 於本區塊編輯名單定義或篩選條件（維持唯讀，編輯走既有「編輯草稿名單」入口）
- `pooldata_field_option` 之產品類別代碼維護（沿用 [F075](F075-manage-pooldata-field-whitelist.md) / [F076](F076-manage-categorical-field-values.md)）
- 修改 F049 既有兩區塊之公式、捨入、缺口、人均或處長 scope 隔離行為

---

## 2. 使用者故事

**As a** 業務部長（Director）或 Admin，在觸發月名單分派前檢視 Stage 0 試算頁
**I want** 在既有兩個部門維度區塊之外，看到一份以名單為單位、按產品類別分組小計的總覽表
**So that** 可先確認本月名單組成與量體分佈，快速抓出漏設、誤設或量體異常之名單，不必逐一切換名單篩選器核對

---

## 3. 前置條件

- 使用者已登入並持有效 JWT，`businessRole` 為 `director` / `section_chief`，或 `role = 'admin'`
- 當月（試算作業月份）存在 ≥ 1 筆 `status = 'active'` 之名單（否則走 AC-LIST-12 空狀態）
- `pooldata_field_option`（`column_name = 'prod_kind'`）已 seed 產品類別可選值（現況 3 筆：`01` / `02` / `03`）
- F049 v2.0 Part B 已落地（本區塊寄生於其頁面與 L1 資料來源之上）

---

## 4. 驗收標準

> AC 編號**一對一沿用 US-184 之 AC-LIST-01~14**；本 spec 之細化以 `AC-LIST-06a` / `AC-LIST-06b` 形式呈現，不重新編號。

### AC-LIST-01：新增「名單基礎預估數量總覽」區塊

- **Given** 業務部長 / Admin 於 `/assignment/estimate` 檢視 Stage 0 試算頁，且當月有 ≥ 1 筆啟用名單
- **When** 頁面載入完成
- **Then** 頁面在既有「部門負載總覽」「部門每日分派明細」之外，新增第三個獨立區塊，區塊標題為「**名單基礎預估數量總覽**」
- **And** 本區塊為獨立表格結構，**不得**混入既有兩區塊之表格（不得新增欄位到部門矩陣、不得把名單列插入部門列）
- **And** 預設呈現於既有兩區塊之後、頁尾提示之前；**確切視覺排序**由 ui-ux-designer 於 prototype 定案（見 §13 OQ-F120-U1）

### AC-LIST-02：資料範圍與既有兩區塊一致（同一名單集合、隨篩選器連動）

- **Given** 試算頁目前之顯示模式（全名單彙總 / 單一名單鑽探）與試算作業月份
- **When** 本區塊渲染
- **Then** 本區塊之名單集合與同頁「部門負載總覽」「部門每日分派明細」**完全一致**：當月 `project_workym = :ym` 且 `status = 'active'` 之名單，不因 `stage` 排除（同 [F049 §15](F049-stage0-daily-estimate.md) L2 名單集合）
- **And** 使用者切換既有「名單篩選」下拉時，本區塊同步縮限（單一名單模式下僅顯示該 1 筆名單）
- **And** 使用者切換試算作業月份時，本區塊隨之重新計算（比照 [F049 AC-AGG-4](F049-stage0-daily-estimate.md)）
- **And** 本區塊**不得**引入自己的名單篩選控制項或自己的月份選擇器

### AC-LIST-03：每筆名單顯示四項資訊

- **Given** 本區塊已渲染名單集合
- **When** 使用者檢視任一名單列
- **Then** 每列至少顯示四項：**名單編號**、**名單名稱**、**篩選條件**（見 AC-LIST-04）、**預估數量**
- **And** 「預估數量」之數值來源與同頁其他區塊之 L1 名單總量口徑**必須為同一份資料**（§5.1 之 `list_total[L]`；優先物化值、缺值 fallback 完整 Stage 1 dry-run），**不得**另開一套估算邏輯
- **And** 預估數量以千分位格式顯示整數；無估算值時依 AC-LIST-10 顯示「—」

### AC-LIST-04：篩選條件欄位重用既有唯一格式化來源

- **Given** 某名單有一或多筆篩選條件
- **When** 本區塊渲染該名單之「篩選條件」欄位
- **Then** **每一筆條件**之描述字串須由既有全站唯一格式化函式 `formatConditionSummary()`（`apps/web/src/pages/assignment/_utils/condition-summary.ts`）產生，並以 `toSummaryDecoder(useConditionDecoder(...))` 供給解碼器；**禁止**在本區塊另拼字串（維持 [F119 BR-10](F119-categorical-text-match-operators.md) 之「單一格式化來源」不變式）
- **And** 一份名單通常含多筆條件（AND 語意），欄位須能呈現**全部**條件（而非僅產品類別那一筆）
- **And**（**★顯示端不做去重；刻意行為，不得「修正」**）：`GROUP-RESOLVE` 之步驟 6b 會對重複可選值去重，但**該去重僅屬分組判定**；「篩選條件」欄位之顯示**必須**是 `formatConditionSummary()` 之**逐字輸出**，**不得**在顯示端另做去重。故 `values = ['01','01']` 於畫面上即呈現為「產品類別：汽車、汽車」（prototype 示範名單 `OB202606003`）。
  **理由**：一旦顯示端去重，同一名單於本區塊與名單詳情 Drawer 之文字即不再逐字元相同，直接違反本 AC 之單一格式化來源與 TC-184-12。
  **下游明示**：此呈現**看似瑕疵但為刻意設計**，**不得**為畫面美觀而在顯示端去重、排序或合併重複值；若判定結果與顯示不一致令人困惑，正解是在**資料建立端**（[F050](F050-create-list-definition.md) 條件建構子）避免寫入重複值，而非在讀取端修飾
- **And**（**多筆條件之呈現形態；定案，OQ-F120-U1 ①**）：多筆條件**不得**以任何分隔字元串接成單一句子，**每一筆條件各自為一個獨立標籤（chip）**。
  **理由**：一份名單之多筆條件為 **AND**（需同時成立），以「、」或「，」串接會被讀成「或」。
  **And** 區塊底部須有一句說明，明確指出「同一名單的多個篩選條件為『且』的關係（需同時成立）」或等義文案
- **And**（**截斷門檻；定案，OQ-F120-U1 ①**）：預設顯示**前 2 筆**條件，其餘以「**＋N 項**」表示（沿用 `prototypes/27-list-definition.html` 名單定義列表卡片之既有慣例，維持全站**單一截斷語彙**）
- **And**（**展開互動；定案，OQ-F120-U1 ①**）：「＋N 項」控制項**必須**為真正的 `<button>`，點擊後**就地展開該列**顯示全部條件；展開／收合後焦點須**回到觸發之同一顆按鈕**。
  **明確禁止**下列三種替代作法（各有其失效情境）：①**hover**——鍵盤與觸控使用者到不了，且本 AC 要求「能呈現全部條件」，hover 不算能呈現②**tooltip**——內容無法選取複製、對螢幕閱讀器不友善③**popover / 浮層**——表格容器帶 `overflow-x-auto`，浮層會被裁切
- **And** 單一標籤文字過長時得於該標籤內截斷並以 `title` 保全完整語意（此為標籤層之視覺處理，不影響上述「前 2 筆 ＋N 項」之條件筆數截斷規則）
- **And** 條件為空（`condition_payload IS NULL`、`conditions = []`、或僅含系統固定條件而無使用者條件）時，顯示「（未設定篩選條件）」或等義文案，**不得**顯示為空白
- **And**（**可測基準之澄清，見 §12 G-4**）：TC-184-12 之「逐字元相同」比較對象為**單一條件之描述字串**與名單詳情 Drawer 對同一條件之字串；**不**包含各頁自行決定之串接符號、截斷或「+N」摘要（名單定義列表 Kanban 卡片本即只取前 2 筆＋`+N`，整格比較必然不同）

### AC-LIST-05：以產品類別分組，分組標籤重用既有 decode 機制

- **Given** 名單集合中每筆名單依 AC-LIST-06 歸入某分組
- **When** 本區塊渲染分組標題
- **Then** **單一產品類別**之分組標題文字須透過既有白名單 decode 機制取得（前端 `useConditionDecoder().decodeValue('prod_kind', code)`，或後端等義查詢 `pooldata_field_option WHERE column_name = 'prod_kind'`），**不得**在本區塊硬編碼「汽車」「機車」「一般商品」等中文字串
- **And** 白名單查無該代碼時，沿用既有 decode fallback：顯示**原始代碼**（不空白、不臆測翻譯）
- **And** 「**多重產品類別**」與「**未分類**」兩組為系統合成分組、無對應代碼，其標題為固定業務文案，**不適用**本 AC 之 decode 要求
- **And** 理由：日後業務新增第 4 種產品類別代碼時，分組標題須自動反映白名單異動，不需改本區塊程式碼

### AC-LIST-06：分組歸屬規則（定案）

> **本規則為業務主管已裁決之最終行為（US-184 v1.1 / OQ-184-01），非建議、非待確認。** 下游 agent 不得逕自解讀為仍待確認；日後若業務要求改變（例如多值名單重複計入每個符合類別），須另立 Story 並同步變更 AC-LIST-09 之不變量描述。

- **Given** 名單之篩選條件中「產品類別」條件項（若存在）
- **When** 本區塊決定該名單歸入哪個分組
- **Then** 依 **§5.2 分組判定演算法（GROUP-RESOLVE）** 判定，結果恰為下列五類之一：
  - 產品類別條件為**可選值清單（`in`）且去重後恰為單一代碼** → 歸入該代碼對應之分組（汽車 / 機車 / 一般商品 / 或其他已登錄代碼）
  - 產品類別條件為**可選值清單（`in`）且去重後含兩個以上代碼** → 歸入「**多重產品類別**」組；**不得**同時計入個別類別分組
  - 產品類別條件使用**任一文字運算子**（包含 / 不包含 / 完全等於，[F119](F119-categorical-text-match-operators.md)）→ 歸入「**未分類**」組
  - 名單**完全未設定**產品類別條件 → 歸入「**未分類**」組
- **And** 「多重產品類別」與「未分類」為**兩個不同分組**，不得合併顯示（業務須能區分「有意跨類別」與「根本沒設類別」）
- **And** 判定依據**必須**為篩選條件本身（`condition_payload.conditions`），**不得**讀取 `ob_list_definition.prod_kind` 衍生欄位（該欄位無法區分「文字運算子」與「未設定」，兩者皆為空字串；理由見 §5.4 與 §12 G-3）

#### AC-LIST-06a：互斥且完備（計數不變量，可測）

- **Given** 本區塊已完成分組
- **Then** **每一筆進入本區塊顯示之名單**（**含**依 AC-LIST-10 無估算值之名單），在同一時刻**恰好**屬於五個分組中的**一個**——不得同時出現於兩個分組，也不得不屬於任何分組
- **And** 跨所有分組之名單編號集合聯集，等於本區塊名單集合之全集，且無重複（`I-F120-01`，見 §10）
- **And** 分組判定**與估算成敗完全無關**（僅依篩選條件），故無估算值之名單同樣有明確歸屬；US-184 AC-LIST-06 之「逾時名單另計」係指其**不計入件數小計**（AC-LIST-09），**非**不歸屬分組（見 §12 G-6）

#### AC-LIST-06b：判定之決定性

- **Given** 同一份篩選條件內容
- **When** 於任意時間、任意執行路徑（後端解析或顯示層解析）判定分組
- **Then** 結果必須相同；運算子之預設值解讀**一律**經單一 fallback 落點（缺漏 ≡ `in`，[F119 BR-11](F119-categorical-text-match-operators.md)），**禁止**在本區塊自行撰寫 `operator ?? 'in'`
- **And** 代碼比對不做大小寫 / 全半形折疊（沿用 [F119 BR-8](F119-categorical-text-match-operators.md)）

### AC-LIST-07：組間與組內排序

- **Given** 分組已依 AC-LIST-06 決定
- **When** 頁面渲染分組順序
- **Then** 組間順序固定為：**汽車 → 機車 → 一般商品 → 多重產品類別 → 未分類**
- **And** 單一代碼分組之相對順序依 §5.3 之 `display_order ASC, option_value ASC`（與既有可選值清單排序規則同源；**注意**：現行 seed 三筆 `display_order` 皆為 0，次鍵 `option_value` 為決定 01/02/03 順序之關鍵，見 §12 G-2）
- **And** 白名單查無之孤兒代碼分組排在所有已登錄代碼分組之後、「多重產品類別」之前，彼此依代碼遞增
- **And** 每個分組內之名單列依**名單編號遞增**排序（與既有名單定義列表排序慣例一致）
- **And** 顯示層**不得**重排後端回傳之分組順序（分組陣列順序即為顯示順序，見 §6.1）

### AC-LIST-08：分組小計內容（含佔比，定案）

- **Given** 每個分組內已列出所屬名單
- **When** 使用者檢視分組小計
- **Then** 每個分組顯示三項：(1) 該組**名單數**（筆）、(2) 該組**預估數量小計**（件；Σ 該組內**有估算值**名單之預估數量）、(3) 該組**佔總計之百分比**
- **And**（**顯示形態；定案，明確允許**）：上述三項**得直接置於分組標題列**之對應欄位，**不要求**另立一條獨立小計列。
  **理由**：若小計另立一列置於名單列之後，分組**收合**時小計會一併被藏起（或必須另做例外處理）；置於分組標題列則收合時三項數字**恆可見**。
  **下游明示**：**不得**為照本 AC 字面而做出獨立小計列——那會在收合情境把小計藏掉，反而違反本 AC 之目的。分組是否可摺疊、預設展開與否、是否提供「全部收合／全部展開」屬版面決策（prototype 已定案為可摺疊、預設全展開、附一鍵切換），本 AC 不另約束
- **And**（**佔比計算定義，定案**）：
  - 分母 = AC-LIST-09 之「預估數量總計」（已依 AC-LIST-10 排除無估算值名單）
  - 分子 = 該組預估數量小計（同樣已排除無估算值名單）
  - 顯示格式 = **四捨五入至整數**百分比（`Math.round(subtotal / total × 100)`，半數進位），不顯示小數位
  - **總計為 0** 時（含當月全部名單皆無估算值之情形）：所有分組佔比一律顯示「**—**」，**不得**顯示 `0%` / `NaN` / `Infinity`
- **And**（**★「不得顯示 `0%`」之前提；兩種情境對照，避免被讀成自我矛盾**）：上一條之「不得顯示 `0%`」**僅**適用於**分母（總計）為 0** 之情境。分子為 0 而分母非 0 時，`0%` 是**正確且必須**顯示之值：

  | 情境 | 分子（該組小計） | 分母（預估數量總計） | 佔比顯示 |
  |---|---|---|---|
  | 該組名單全數無估算值，**但當月其他組仍有估算值** | `0` | **> 0** | **`0%`**（正確；另以琥珀徽章標示「本組合計未涵蓋 N 張未能估算的名單」，AC-LIST-10） |
  | **當月全部名單皆無估算值** | `0` | `0` | **「—」**（禁 `0%` / `NaN` / `Infinity`） |

  **下游明示**：見到「某組佔比為 `0%`」時**不得**逕自判為違反本 AC——須先確認分母；只有**分母為 0 卻顯示 `0%`** 才是缺陷。§5.5 之公式 `total > 0 ? Math.round(subtotal / total × 100) : null` 已同時滿足兩種情境，**不需**任何額外分支
  - 各組百分比四捨五入後加總**可能不等於 100%**，此為**預期行為**，**不強制湊整**（不採最大餘數法、不由任一組吸收誤差）；QA / 使用者回報「百分比加總非 100%」**非缺陷**
- **And** **空分組**（該組名單數 = 0）**不顯示**（比照既有頁面「整期 0 件部門隱藏」慣例）；隱藏判定依**名單數**，**不**依小計金額（見 AC-LIST-10 與 §12 G-6）
- **And**（**單一名單鑽探模式之佔比呈現；定案，OQ-F120-U2**）：**保留佔比欄位**（欄數不變），**所有佔比格顯示「—」**，並於佔比**欄標題下方**加一行灰字副標說明（意即「單一名單檢視不計算佔比」或等義），區塊底部說明句同步替換為單一名單模式之說明。
  **明確不得採用之兩個替代作法與理由**：
  - **不得顯示 `100%`**：單一名單模式下佔比恆為 100%，屬同義反覆而非資訊；更嚴重的是會被讀成「這張名單佔全月總量的 100%」——一個明確錯誤的結論
  - **不得抽掉佔比欄**：欄數隨顯示模式變動會使表頭在兩種模式下不一致，破壞欄位位置之一致性，並讓下游實作與測試多出一種版面分支
  **And** 「—」為本頁既有之「不適用 / 無法計算」記號（人均、缺口皆用之），與總計為 0 時之佔比降級共用同一符號，使用者不需學第二種記號

### AC-LIST-09：總計列與跨區塊一致性不變量

- **Given** 各分組小計已計算完成
- **When** 使用者檢視本區塊底部總計列
- **Then** 顯示「**名單總數**」（Σ 各分組名單數，**含**無估算值名單）與「**預估數量總計**」（Σ 各分組預估數量小計，**不含**無估算值名單）
- **And**（**組內不變量，必須成立**）：「各分組預估數量小計加總」**恰好等於**「預估數量總計」，不多不少（`I-F120-02`）；此不變量成立之前提為 AC-LIST-06a 之互斥且完備規則
- **And**（**跨區塊一致性不變量；v1.2 定案，嚴格相等**）：於**全名單彙總模式**下，本區塊之「預估數量總計」（`totalEstimatedCount`）與同頁「部門負載總覽」之「本月全名單總量」（[F049 v2.1](F049-stage0-daily-estimate.md) 回應欄位 **`orgMonthTotal`**，供 KPI 卡片與部門負載總覽表尾合計列兩處使用）**數值嚴格相等**（`I-F120-03`；權威來源＝[AD-E07-51](../implementation-log/AD-E07-51-f120-list-estimate-overview.md) v1.2 §4.5.1 之 `I-LISTOVW-STRICT-EQUALITY-BOUNDARY-01`）
- **And**（**充分條件之精確表述**）：定義 `excluded(response)` 為該回應中**因無估算值而被排除**之名單編號集合——部門矩陣端由 `warnings[]` 之 `STAGE0_LIST_ESTIMATE_PARTIAL` 取得，本區塊端等價於 `estimateUnavailable === true` 之名單編號集合（兩者同源自 `resolveListTotals` 之同一組 warnings）。則：

  ```
  excluded(dept-estimate) === excluded(list-estimate-overview)  ⟹  orgMonthTotal === totalEstimatedCount
  ```

  理由：兩端排除之名單集合相同時，兩端 `listTotals` 之**定義域與各元素值必然相同**（per-list dry-run COUNT 為確定性 SQL），Σ 後依算術嚴格相等。
  **注意**：`unestimatedListCount = 0`（無任何名單被排除）僅是本充分條件之**一個特例**，**不得**把兩者寫成等價——排除集合相同但**皆非空**時（例如刻意建構之 AC-LIST-10 部分降級情境），**縮減後之總和仍嚴格相等**
- **And**（**★測試層指示；test-generator 直接照此撰寫**）：TC-184-07 於測試套件中**無條件斷言嚴格相等**（形如 `expect(deptEstimate.orgMonthTotal).toBe(listOverview.totalEstimatedCount)`），**不得**寫成依 `unestimatedListCount` 或任何降級旗標分支之條件式斷言。
  理由：`excluded(A) ≠ excluded(B)` 之**唯一**成因，是兩個獨立 HTTP 請求對同一 fallback 查詢因**真實 DB 負載**而產生之 timeout 結果分歧，需要真實網路時序競爭；任何測試——無論直接 seed `stage0_estimate_count` 使 fallback 不觸發，或以 mock 讓特定名單確定性失敗——在**同一測試行程內**對兩次呼叫套用**同一組 fixture / mock**，兩端排除集合**恆相等**。
  **加分支反而放棄驗證力道**：條件式斷言會連帶跳過「兩側排除集合相同且非空 → 縮減後仍相等」這一大類情境（**含 AC-LIST-10 部分降級測試本身**）
- **And**（**生產環境之殘留風險，非測試豁免**）：生產環境確實存在「同一名單於一端完成、另一端逾時」之窄窗口（兩端點各自起算 `raceTimeout()`），此時兩側精確和短暫不一致。此列為**已知殘留風險**：**非靜默錯誤**（兩端皆有既有標示——本區塊為 `estimateUnavailable` 之名單列與 `unestimatedListCount`，F049 端為 `warnings[]` 之 `STAGE0_LIST_ESTIMATE_PARTIAL`），故**不寫成測試豁免分支**，亦不得據此判為缺陷。邊界定義見 `I-LISTOVW-STRICT-EQUALITY-BOUNDARY-01`。若日後生產觀察顯示此窗口 material，根因處置為**提高 [F088](F088-ready-stage-summary.md) 物化覆蓋率**，**不**在讀取端加同步或快取（維持 AD-E07-51 §4.4 / `I-LISTOVW-NO-NEW-CACHE-01` 之裁定）
- **And**（**成立方式**）：兩者為同一算式 `Σ_L list_total[L]`（整數精確和），且**取自同一個** `Stage0EstimateService.resolveListTotals(ym, listNo?)`（AD-E07-51 §4.3 / `I-LISTOVW-SHARED-SOURCE-01`），故相等性**依建構成立**，非靠測試維持
- **And**（**依據**）：[F049 v2.1 §16.5 / AC-DEPT-3 / BR-17](F049-stage0-daily-estimate.md) 已依 2026-08-20 之裁決，將月層級「全名單總量」由「各工作日顯示值之和」修正為精確和，並以後端欄位 `orgMonthTotal`（型別 `number`）承載（原落差分析見 §12 G-1，狀態＝已裁決）
- **And**（**★兩組關係不得混淆；下游斷言之唯一依據**）：

  | 關係 | 斷言 |
  |---|---|
  | **跨端點・月層級 vs 月層級**（本區塊 `totalEstimatedCount` vs F049 `orgMonthTotal`） | **嚴格相等**（測試套件中無條件斷言，見上方測試層指示） |
  | **同端點內・月層級 vs 逐日捨入值之和**（F049 `orgMonthTotal` vs `Σ_d days[].orgTotal`；等價地，本區塊總計 vs `Σ_d days[].orgTotal`） | **不得斷言相等**——F049 每日顯示值仍為逐日 `Math.round`，殘差 ≤ 工作日數 × 0.5（[F049 §16.5.4](F049-stage0-daily-estimate.md)），屬預期行為 |

- **And**（**角色範圍**）：[F049 v2.1 §16.5.5](F049-stage0-daily-estimate.md) 已定 `orgMonthTotal` 型別為 `number`（非 nullable）、**所有角色**皆回傳全公司口徑之名單層總量（比照 F049 BR-12），故上述嚴格相等**於處長角色下同樣可斷言**。處長之**顯示**面維持不變（F049 端 KPI 改顯示「轄區本月件數」、表尾合計列不渲染；本區塊則完整顯示並帶 AC-LIST-11 之語意標示）
- **And** 單一名單鑽探模式下，「預估數量總計」等於該筆名單自身之預估數量（該名單無估算值時為 0，佔比全數顯示「—」）

### AC-LIST-10：名單無估算值之呈現（沿用既有 warning 機制）

- **Given** 某名單之預估數量未能取得（後端已依既有邏輯將其排除於 `listTotals` 之外，並於回應之 `warnings[]` 追加一則 `STAGE0_LIST_ESTIMATE_PARTIAL`）
- **When** 本區塊渲染該名單所屬列
- **Then** 該名單**仍列於**所屬分組之清單中（讓使用者知道「這份名單存在、但這次沒能估出量」），其「預估數量」欄顯示「**—**」（**不得**顯示 0 或空白），並帶有與同頁既有逾時提示一致之視覺標記（沿用 [F119 AC-13 / BR-13](F119-categorical-text-match-operators.md) 已建立之呈現慣例）
- **And** 該名單**不**計入所屬分組之預估數量小計、**不**計入總計、**不**影響佔比分母（與部門區塊排除該名單之邏輯一致，維持跨區塊總量對得上）
- **And** 該名單**仍**計入所屬分組之**名單數**與總計列之「名單總數」（AC-LIST-09）
- **And** 若某分組因此變成「組內名單全數無估算值、小計為 0」，該分組**仍需顯示**（隱藏判定依名單數，見 AC-LIST-08），並在分組層級標示「本組合計未涵蓋未能估算之名單」或等義提示
- **And**（**★三個層級皆須標示；ui-ux D-9 定案，v1.3 補入**）：降級標示須出現於**三個**層級——①**名單列**（「—」＋「未能估算」徽章）②**分組列**（「本組合計未涵蓋 N 張未能估算的名單」）③**區塊層級**（區塊標題與**總計數字**旁之「不完整」徽章，沿用同頁 KPI 卡既有之「不完整」徽章樣式）。
  **③ 不得省略之理由**（與 [AC-LIST-11](#ac-list-11) 觸點 ③ 同一風險）：使用者常直接看**總計**，此時名單列與分組列之標示可能已捲出畫面或位於收合之分組內；**總計正是最容易被當成完整值誤讀的數字**。
  **And** 三個層級**必須沿用同頁既有之逾時語彙**（琥珀 ＋ `hourglass`），**不得**新增第二套顏色 / 圖示（尤其**不得**借用本頁紅色＝人均超載、`alert-triangle`＝資料池偏低之既有語意）。
  **And** 逐筆名單之後端原文訊息仍**只**由頁首既有 warning 呈現管道承載（[F119 AC-13 / BR-13](F119-categorical-text-match-operators.md)），本區塊三層標示僅做「這一列 / 這一組 / 這個總計受影響」之就地指認，**不重複列出**訊息清單
- **And**（**觸發條件之精確定義，見 §12 G-5**）：判定基準為「該名單不存在於 `listTotals`（無估算值）」，**而非**「是否為逾時」——後端既有 `catch` 涵蓋逾時以外之失敗原因；使用者可見文案沿用既有訊息，不因本 feature 改動

### AC-LIST-11：權限與 scope（定案）

> **本規則為業務主管已裁決之最終行為（US-184 v1.1 / OQ-184-02）。**

- **Given** 目前登入角色為業務處長（`section_chief`，唯讀）
- **When** 該角色檢視 Stage 0 試算頁
- **Then** 處長可見本區塊**完整內容**：全部當月啟用名單清單、其篩選條件、其預估數量、分組小計與總計，**不**依處長轄區部門限縮名單集合（比照 [F049 §17 BR-12](F049-stage0-daily-estimate.md) 之先例——名單層總量端點已對處長開放）
- **And**（**誤讀防呆，必要條件；★三個觸點皆為必要，定案 OQ-F120-U1 ②**）：本區塊在處長角色下**必須**同時呈現下列**三處**語意標示——**只做其中一處或兩處視為未通過本 AC**：

  | # | 觸點 | 內容 | 為何不可省略 |
  |---|---|---|---|
  | ① | **區塊標題右側徽章** | 「**全公司口徑**」（prototype hook：`data-testid="list-overview-org-scope-badge"`） | 使用者掃視標題即知本區塊口徑與上方部門區塊不同 |
  | ② | **區塊內、表格正上方之說明條** | **第一行逐字**為「**本區塊為全公司名單層總量，非您所屬轄區之分派量**」（prototype hook：`data-testid="list-overview-chief-notice"`）；建議第二行點名與部門區塊之口徑對比（措辭由 prototype 為準） | 校正訊息須貼著資料本身；置於頁首會要求使用者自行比對兩段話，因果鏈過長 |
  | ③ | **總計列後綴「（全公司口徑）」** | 總計列之「總計」標籤後綴（prototype hook：`data-testid="list-overview-total-row"`） | **本項最關鍵**：主管常直接跳至頁面最下方看總計，此時說明條已捲出畫面，而**總計正是最容易被誤讀為自身轄區工作量的數字** |

- **And**（**觸發條件；定案**）：三個觸點之觸發條件為 **`role === 'section_chief'`**，**與該處長有無可辨識之轄區無關**——即 `getScopeDeptCode()` 回 `null` 之降級情境下，本區塊仍**照常完整呈現**（§6.3）且三個觸點**仍須完整出現**
- **And** 確切文案（除觸點 ② 第一行為逐字要求外）、色彩與版面以 `prototypes/30-stage0-estimate.html` 為 ground truth
- **And** 若處長角色下本區塊未帶上述**全部三個**語意標示即渲染完整內容，**視為未通過本 AC**，不得以「反正資料正確」或「已標示過一次」為由略過
- **And**（**實作陷阱，顯著標註**）：本區塊之名單集合**不得**套用 dept scope filter——此與同一頁面之部門矩陣**行為相反**（後者對處長強制限縮至其 `obdeptid` 列）。實作時若沿用部門矩陣之 scope 過濾樣板，即違反本 AC（見 §6.3）
- **And** 部長（`director`）/ Admin 之可見內容與處長相同（全公司口徑），差異僅在**不需**顯示上述處長專屬語意標示

### AC-LIST-12：當月無啟用名單之空狀態

- **Given** 當月無任何 `status = 'active'` 之名單
- **When** 頁面載入
- **Then** 本區塊顯示與同頁既有空狀態一致之提示文案（比照 [F049 AC-AGG-3](F049-stage0-daily-estimate.md)：「本月尚無啟用名單，請先於名單定義頁建立並啟用名單」），**不渲染**任何分組標題、名單列、小計列或總計列

### AC-LIST-13：試算僅為預覽，不寫入任何分派資料

- **Given** 本區塊顯示計算結果
- **When** 計算完成
- **Then** 系統**不**寫入 `ob_pool_data_list`、`assignment_run`、`assignment_run_snapshot`、`ob_monthly_run_result` 或任何分派紀錄（沿用 [F049 BR-1 / AC-AGG-5](F049-stage0-daily-estimate.md)）
- **And** 本區塊亦**不**回寫 `ob_list_definition.stage0_estimate_count`（該欄位之寫入時機屬 [F088](F088-ready-stage-summary.md) 既有流程，本 feature 純讀取）

### AC-LIST-14：術語清理，不得出現技術詞

- **Given** 本區塊任意使用者可見文字（區塊標題、欄位標題、分組標題、小計 / 總計標籤、提示訊息、tooltip、空狀態文案）
- **When** 全文掃描
- **Then** 不得出現 [F049 §19.1](F049-stage0-daily-estimate.md) 之技術詞黑名單，亦不得出現 §9.1 之本區塊追加黑名單
- **And** 名單編號**值本身**（如 `OB202608001`）為業務資料，**不受**黑名單約束；受約束者為欄位名 / 資料表名 / 內部代號等技術字串

---

### 4.1 US-184 AC ↔ F120 章節對照（可追溯性）

| US-184 AC | F120 落點 |
|---|---|
| AC-LIST-01 | §4 AC-LIST-01；§1.2（頁面關係）；§13 OQ-F120-U1（視覺排序） |
| AC-LIST-02 | §4 AC-LIST-02；§5.1（名單集合來源）；§6.2（query 參數） |
| AC-LIST-03 | §4 AC-LIST-03；§5.1 欄位映射表；§6.1 `groups[].lists[]` |
| AC-LIST-04 | §4 AC-LIST-04；§5.1（`conditions`）；§6.1（原樣回傳）；BR-4 |
| AC-LIST-05 | §4 AC-LIST-05；§5.3 標籤解碼；BR-5 |
| AC-LIST-06 / 06a / 06b | §4 AC-LIST-06；§5.2 GROUP-RESOLVE；§5.4；BR-1 / BR-2 / BR-3；`I-F120-01` |
| AC-LIST-07 | §4 AC-LIST-07；§5.3 GROUP-ORDER；BR-6 |
| AC-LIST-08 | §4 AC-LIST-08；§5.5 佔比公式；BR-8 / BR-9 |
| AC-LIST-09 | §4 AC-LIST-09；§10 `I-F120-02` / `I-F120-03`；§12 G-1 |
| AC-LIST-10 | §4 AC-LIST-10；§8 warning 契約；BR-7；§12 G-5 / G-6 |
| AC-LIST-11 | §4 AC-LIST-11；§6.3 授權（**無 dept scope filter** 特例）；BR-10 |
| AC-LIST-12 | §4 AC-LIST-12；BR-11 |
| AC-LIST-13 | §4 AC-LIST-13；BR-12 |
| AC-LIST-14 | §4 AC-LIST-14；§9 術語遵循 |

---

## 5. 資料來源與欄位映射

### 5.1 欄位映射表

> 已對 dev 程式碼與 schema 逐項查證（2026-08-20）。

| 使用者可見欄位 | 來源 | 型別 | null 語意 / 備註 |
|---|---|---|---|
| 名單編號 | `ob_list_definition.list_no` | `varchar(11)`，PK，NOT NULL | 恆有值；亦為組內排序鍵 |
| 名單名稱 | `ob_list_definition.list_nm` | `nvarchar(45)`，NOT NULL | 恆有值 |
| 篩選條件 | `ob_list_definition.condition_payload.conditions[]` | JSON 陣列（`ObListDefinitionConditionItem[]`） | `condition_payload` 為 nullable：舊名單為 `NULL`；`conditions = []` 或僅含系統固定條件時視為「未設定篩選條件」（AC-LIST-04） |
| 預估數量 | `list_total[L]`：優先 `ob_list_definition.stage0_estimate_count`；為 `NULL` 時 fallback 完整 Stage 1 dry-run（`estimateListCount`） | `int`，nullable | fallback 失敗（逾時或其他錯誤）→ 該名單**不進入** `listTotals` → 顯示「—」並發 `STAGE0_LIST_ESTIMATE_PARTIAL`（AC-LIST-10） |
| 分組 | **`condition_payload.conditions[columnName = 'prod_kind']`**（§5.2 演算法） | 衍生值，非落表欄位 | **禁止**改讀 `ob_list_definition.prod_kind`（§5.4） |
| 分組標籤（單一代碼組） | `pooldata_field_option WHERE column_name = 'prod_kind'` 之 `option_label` | `varchar(100)` | 查無代碼 → fallback 顯示原始代碼 |
| 分組順序（單一代碼組） | 同上之 `display_order`（次鍵 `option_value`） | `int`，NOT NULL，default 0 | 現行 seed 三筆皆為 0，次鍵為關鍵（§12 G-2） |

**名單集合查詢條件**：`project_workym = :ym AND status = 'active'`；單一名單鑽探模式再以 `list_no = :listNo` 縮限。與 F049 部門矩陣所用之名單集合查詢**完全相同**。

**已查證之現況事實（供下游複核）**

| 事實 | 佐證位置 |
|---|---|
| `stage0_estimate_count` 優先、缺值 fallback `estimateListCount`、失敗即發 `STAGE0_LIST_ESTIMATE_PARTIAL` 並排除該名單 | `apps/api/src/modules/assignment-list/stage0-estimate.service.ts`（`computeDeptEstimate` 之 L1 / L2 段） |
| fallback 之逾時門檻取自 `STAGE0_DEPT_ESTIMATE_TIMEOUT_MS`，預設 30,000 ms（與單一名單端點之 10 秒 `STAGE0_ESTIMATE_TIMEOUT` **不同**） | 同上（`resolveDeptTimeoutMs`） |
| `prod_kind` 為 `condition_payload` 衍生之 backward-compat 欄位；categorical 多值以 `$$` 串接；文字運算子與未設定皆衍生為空字串 | `apps/api/src/modules/assignment-list/assignment-list.service.ts`（`deriveBackwardCompatColumns`） |
| `condition_payload.conditions[]` 之 categorical 項支援 optional `operator`（`in` / `contains` / `not_contains` / `equals`，缺漏 ≡ `in`）與 `keyword` | `apps/api/src/database/entities/ob-list-definition.entity.ts`（`ObListDefinitionConditionItem`）；[F119 §5.1](F119-categorical-text-match-operators.md) |
| 可選值查詢既有排序為 `display_order ASC, option_value ASC` | `apps/api/src/modules/pooldata-field/services/pooldata-field-option.service.ts`（`listOptions`） |
| `prod_kind` 白名單 seed 為 `01` / `02` / `03`，三筆 `display_order` 皆為 `0`、`is_active = true` | `apps/api/src/database/seeds/data/pooldata-field-option.json` |
| 部門矩陣對處長回傳 `orgTotal` / `deptAssignedTotal` / `gap` 皆為 `null`，前端 KPI 改顯示「轄區本月件數」 | `stage0-estimate.service.ts`（處長分支）；`apps/web/src/pages/assignment/stage0-estimate-page.tsx`（KPI 區） |

### 5.2 分組判定演算法 `GROUP-RESOLVE`（權威定義）

> 輸入：單一名單之 `condition_payload`。輸出：`groupKey`（恰為一值）。此函式為**全函式**（total function）：任何輸入皆回傳且僅回傳一個 `groupKey`，此即 `I-F120-01` 互斥且完備之依據。

```
GROUP-RESOLVE(payload) -> groupKey

1. 若 payload 為 null/undefined，或 payload.conditions 非陣列，或長度為 0
     → 回傳 UNCLASSIFIED

2. 取 conditions 中所有 columnName === 'prod_kind' 之項目
   2a. 若不存在                                  → 回傳 UNCLASSIFIED
   2b. 若存在多筆（防禦；寫入端驗證應已攔截）      → 取最後一筆（last-wins，
                                                    鏡射 deriveBackwardCompatColumns 之既有防禦）
   令該項為 cond

3. 若 cond.fieldType !== 'categorical'（防禦；prod_kind 為 categorical 欄位）
     → 回傳 UNCLASSIFIED

4. operator := resolveCategoricalOperator(cond.operator)   // 缺漏 ≡ 'in'（F119 BR-11 單一落點）

5. 若 operator ∈ { 'contains', 'not_contains', 'equals' }
     → 回傳 UNCLASSIFIED                                    // 不查資料即無法歸屬固定代碼

6. // operator === 'in'
   6a. 若 cond.values 非陣列                                → 回傳 UNCLASSIFIED
   6b. codes := 去重後之 cond.values（保持首次出現順序；不做大小寫 / 全半形折疊）
   6c. 若 codes.length === 0                                → 回傳 UNCLASSIFIED
   6d. 若 codes.length === 1                                → 回傳 codes[0]   // 單一代碼組
   6e. 若 codes.length >= 2                                 → 回傳 MULTI
```

**保留字**：`MULTI` 與 `UNCLASSIFIED` 為合成分組鍵，不得與任何產品類別代碼碰撞（`prod_kind` 代碼為 `varchar(64)` 之數字碼；如日後出現同名代碼，須改用結構化 `groupType` 欄位區分——契約已預留，見 §6.1）。

**決定性**：本演算法不讀取任何 `condition_payload` 以外之資料，不依賴時間、不依賴估算結果、不依賴白名單當下狀態（白名單僅影響**標籤**與**排序**，不影響**歸屬**）。因此同一 payload 在後端或顯示層計算結果必然相同（AC-LIST-06b）。

### 5.3 分組順序與標籤 `GROUP-ORDER`

顯示順序為以下四段之串接：

1. **已登錄之單一代碼組**：依 `pooldata_field_option`（`column_name = 'prod_kind'`）之 `display_order ASC`，同值時以 `option_value ASC` 為次鍵。現行資料下即得 `01`（汽車）→ `02`（機車）→ `03`（一般商品），符合 AC-LIST-07。
   - **含 `is_active = false` 之代碼**：仍視為已登錄（[F076 BR-4](F076-manage-categorical-field-values.md)「停用不回溯既有名單條件」），照常參與排序與標籤解碼。
2. **孤兒代碼組**（名單引用之代碼不存在於 `pooldata_field_option`）：排於已登錄代碼組之後，彼此依代碼字串遞增；標籤 fallback 為原始代碼。
3. **「多重產品類別」組**（`MULTI`）。
4. **「未分類」組**（`UNCLASSIFIED`）。

**組內排序**：名單編號（`list_no`）遞增。

**標籤來源**：單一代碼組 → `option_label`（decode 機制，AC-LIST-05）；`MULTI` → 「多重產品類別」；`UNCLASSIFIED` → 「未分類」。

### 5.4 為何不可讀 `ob_list_definition.prod_kind`（關鍵決策點）

| 名單實際設定 | `prod_kind` 衍生結果 | 可否還原原意 |
|---|---|---|
| `in` 單一代碼 `['01']` | `"01"` | ✅ 可 |
| `in` 多值 `['01','02']` | `"01$$02"` | ✅ 可（含 `$$` 即多值） |
| 文字運算子（`contains` / `not_contains` / `equals`） | `""`（空字串） | ❌ **不可** |
| 完全未設定 `prod_kind` 條件 | `""`（空字串） | ❌ **不可** |

後兩者在衍生欄位上**表面結果完全相同**，而 AC-LIST-06 要求兩者雖同歸「未分類」，其**判定路徑**必須可被測試分別驗證（TC-184-05 之兩個情境），且日後若業務要求把「文字運算子」另立一組，讀衍生欄位將無法支援。故**分組判定之唯一權威來源為 `condition_payload`**（`I-F120-04`）。

### 5.5 小計、總計與佔比公式

設本區塊名單集合為 `S`，`listTotals` 為 §5.1 之有估算值名單映射，`G` 為分組集合：

```
estimated(L)          := listTotals.has(L)                       // 是否有估算值
count(L)              := listTotals.get(L)                       // 整數件數

listCount[g]          := |{ L ∈ S : GROUP-RESOLVE(L) = g }|      // 含無估算值名單
estimatedListCount[g] := |{ L ∈ S : GROUP-RESOLVE(L) = g ∧ estimated(L) }|
subtotal[g]           := Σ { count(L) : L ∈ S, GROUP-RESOLVE(L) = g, estimated(L) }

totalListCount        := Σ_{g ∈ G} listCount[g]          = |S|
totalEstimatedCount   := Σ_{g ∈ G} subtotal[g]
unestimatedListCount  := totalListCount − Σ_{g} estimatedListCount[g]

percent[g]            := totalEstimatedCount > 0
                           ? Math.round( subtotal[g] / totalEstimatedCount × 100 )
                           : null                                 // null → 顯示「—」
```

**顯示過濾**：`listCount[g] = 0` 之分組不輸出 / 不顯示（AC-LIST-08）。
**捨入**：`Math.round`（半數進位），與 [F049 §16.3](F049-stage0-daily-estimate.md) 之捨入語意一致。`subtotal` / `total` 為整數相加，**無**捨入誤差。

---

## 6. API 契約

> **端點拓樸（新增獨立端點 vs 擴充既有 `GET /api/v1/assignment/stage0/dept-estimate`）為 system-architect 之決策**（承接 US-184 OQ-184-05 → §13 OQ-F120-A1）。本節僅定義**契約 shape、欄位語意、null 語意、query 參數、授權與不變量**，無論落在哪個端點皆須成立。

### 6.1 Response 契約（概念性 shape）

```jsonc
{
  "ym": "202608",
  "mode": "aggregated",             // "aggregated"（全名單彙總）| "single-list"（單一名單鑽探）
  "listNo": null,                   // single-list 模式時為選定名單編號，否則 null

  "scope": {
    "role": "section_chief",        // "director" | "section_chief" | "admin"
    "deptCode": "XVE1",             // 處長之轄區代碼；其他角色為 null
    "listOverviewScoped": false     // ★恆為 false：本區塊不套 dept scope filter（AC-LIST-11 / §6.3）
  },

  "totalListCount": 12,             // int；Σ 各組名單數（含無估算值名單）
  "totalEstimatedCount": 28500,     // int；Σ 各組預估數量小計（排除無估算值名單）；無資料時 0
  "unestimatedListCount": 1,        // int；無估算值之名單數

  "groups": [                       // ★陣列順序即為顯示順序（§5.3）；顯示層不得重排
    {
      "groupKey": "01",             // string；產品類別代碼 | "MULTI" | "UNCLASSIFIED"
      "groupType": "code",          // "code" | "multi" | "unclassified"（結構化判別，勿以 groupKey 字串比對）
      "optionValue": "01",          // string | null；groupType="code" 時為代碼，否則 null
      "displayOrder": 0,            // int | null；groupType="code" 且代碼已登錄時取自白名單，否則 null
      "listCount": 5,               // int；含無估算值名單
      "estimatedListCount": 4,      // int；有估算值之名單數
      "subtotalCount": 12000,       // int；Σ 有估算值名單之預估數量
      "percent": 42,                // int | null；null ⇔ totalEstimatedCount = 0（顯示「—」）
      "lists": [                    // ★陣列順序即為組內顯示順序（listNo ASC）
        {
          "listNo": "OB202608001",  // string
          "listNm": "汽車滿期名單",  // string
          "conditions": [           // ObListDefinitionConditionItem[]；原樣透傳，供顯示層格式化
            { "columnName": "prod_kind", "fieldType": "categorical", "operator": "in", "values": ["01"] }
          ],
          "estimatedCount": 3200,   // int | null；null ⇔ 無估算值（顯示「—」）
          "estimateUnavailable": false  // boolean；true ⇔ estimatedCount === null
        }
      ]
    }
  ],

  "warnings": [                     // 沿用既有結構性警告通道（F049 BR-16）
    { "code": "STAGE0_LIST_ESTIMATE_PARTIAL", "listNo": "OB202608005",
      "message": "名單 OB202608005 估算逾時，已從本次合計排除。" }
  ]
}
```

**欄位語意表**

| 欄位 | 型別 | 語意 / null 語意 |
|---|---|---|
| `ym` / `mode` / `listNo` | string / enum / string\|null | 回顯本次計算之參數；語意與 [F049 §14.3](F049-stage0-daily-estimate.md) 相同 |
| `scope.listOverviewScoped` | boolean | **恆 `false`**。設此欄位之目的為讓契約**顯式**記錄「本區塊不套 dept scope」，避免實作者沿用部門矩陣樣板時靜默套用（§6.3） |
| `totalListCount` | int | 含無估算值名單；`I-F120-02` 之計數側 |
| `totalEstimatedCount` | int | 排除無估算值名單；佔比分母；空集合時為 `0`（非 `null`） |
| `groups[]` | array | 已排序；空分組**不出現**於陣列 |
| `groups[].groupType` | enum | 下游判別分組類型之**唯一**依據；**禁止**以 `groupKey === "MULTI"` 之字串比對取代 |
| `groups[].optionValue` | string\|null | 供顯示層 decode 標籤（AC-LIST-05） |
| `groups[].displayOrder` | int\|null | 孤兒代碼 / 合成分組為 `null` |
| `groups[].percent` | int\|null | `null` ⇔ `totalEstimatedCount = 0`；**禁止**以 `0` 代替 |
| `groups[].lists[].conditions` | array | **原樣**之條件陣列（含 `operator` / `keyword` / `dataSource` 等 optional key），不得由後端預先格式化為字串（否則違反 [F119 BR-10](F119-categorical-text-match-operators.md) 單一格式化來源）；無篩選條件時為 `[]`（**非** `null`） |
| `groups[].lists[].estimatedCount` | int\|null | `null` ⇔ 無估算值 |
| `groups[].lists[].estimateUnavailable` | boolean | 冗餘旗標（與 `estimatedCount === null` 等價），供顯示層免於 null 判斷分歧 |
| `warnings[]` | array | 沿用既有 `{ code, listNo?, deptCode?, message? }` 結構（§8） |

**契約不變量**（無論端點如何拓樸皆須成立，見 §10）：`I-F120-01`、`I-F120-02`、`I-F120-03`、`I-F120-04`、`I-F120-05`。

### 6.2 Query 參數（須與既有 Stage 0 端點一致）

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `ym` | string（YYYYMM） | 否 | 目前作業年月（`SystemService.getCurrentWorkYm()`） | 試算作業月份；決定名單集合 |
| `listNo` | string | 否 | 無（= 全名單彙總） | 提供時進入單一名單鑽探模式（`mode = "single-list"`），名單集合縮為該筆 |
| `calendarSource` | enum（`weekday` / `weekday-only` / `all`） | 否 | `weekday` | **接受但對本區塊之輸出無影響**（本區塊為月層級名單總量，不做每日投影）；保留以維持與同頁其他區塊之參數一致性 |
| `startDate` / `endDate` | string（YYYY-MM-DD） | 否 | `ym` 整月 | 同上：接受但不影響本區塊輸出（名單集合由 `ym` 決定，非由日期範圍） |

> **[ASSUMPTION] A-1**：`calendarSource` / `startDate` / `endDate` 對本區塊為 no-op 之設計，源於本區塊不含日曆維度（§1.2）。若架構師選擇「擴充既有 `dept-estimate`」之拓樸，這三個參數本就存在、無須變更；若選擇「新增獨立端點」，仍應接受這三個參數以維持前端一次性參數傳遞之一致性。**單一名單鑽探行為**（`listNo`）則為實質參數，兩種拓樸下皆必須生效。

### 6.3 授權（★本 feature 之特例，實作者務必留意）

| 項目 | 規範 |
|---|---|
| Guard | `DirectorOrSectionChiefGuard`（class 級基準閘；**不得**以 method 級 `@RequireDirector()` 收緊，否則處長無法檢視，違反 AC-LIST-11） |
| 可存取角色 | `businessRole = 'director'`、`businessRole = 'section_chief'`、`role = 'admin'` |
| **dept scope filter** | **★不套用。** 本區塊之名單集合對所有上述角色一律為「當月全部啟用名單」，**不**依 `getScopeDeptCode()` 之轄區限縮，**不**過濾 `ob_dept_pct.obdeptid` |
| 與部門矩陣之差異 | 同一頁面之部門矩陣**必須**對處長套 dept scope filter（[F049 AC-SCOPE-2 / BR-13](F049-stage0-daily-estimate.md)：其他部門列完全不存在於 response）。**兩者行為相反**，共用 service 時**不得**沿用同一段過濾邏輯 |
| `getScopeDeptCode()` 回 `null` 之處長 | 本區塊**照常回傳完整內容**（不降級、不空結果）；`SCOPE_UNRESOLVED` warning 僅影響部門矩陣區塊，與本區塊無關 |
| UI 語意標示 | 處長角色下必須渲染 AC-LIST-11 之語意標示；此為 AC 之必要條件而非加分項 |
| 唯讀 | 本區塊不提供任何寫入操作（AC-LIST-13 / BR-12） |

> **實作陷阱（顯著標註）**：若本區塊之資料由 `computeDeptEstimate` 同一 service method 產生，該 method 現行對處長已在 `deptPctRows` 上套 scope filter——但**名單集合（`lists`）本就未被 scope 過濾**。實作時只需確保「不要為本區塊新增額外過濾」，**不需**、也**不得**新增任何 scope 判斷分支於名單集合之取得路徑。

### 6.4 運算歸屬（分組計算落在後端或顯示層）

- **契約要求**：`groups[]` 之結構、順序、小計、佔比為**回應契約的一部分**，其值須可在 API 層被斷言（TC-184-13 / TC-184-14 / TC-184-15 需可在後端測試層驗證，不得只能於 DOM 驗證）。
- **[ASSUMPTION] A-2（建議預設，交架構師確認）**：`GROUP-RESOLVE` 與小計 / 佔比於**後端**計算並回傳上述 shape；顯示層僅負責標籤 decode（AC-LIST-05）、條件字串格式化（AC-LIST-04）與版面。理由：①避免在顯示層重複實作 `resolveCategoricalOperator` fallback（違反 [F119 BR-11](F119-categorical-text-match-operators.md) 單一落點）②佔比 / 小計可於 API 層直接斷言③與同頁部門矩陣「數值由後端算、顯示層只呈現」之既有分工一致。
- 若架構師改採顯示層計算，本 spec 之演算法（§5.2 / §5.3 / §5.5）與不變量（§10）**不變**，但須另行說明 TC-184-13~15 之可測落點（§13 OQ-F120-A2）。

---

## 7. 業務規則

| 規則編號 | 說明 |
|---|---|
| BR-1 | **分組判定之唯一權威來源為 `condition_payload`**：一律以 `conditions[columnName = 'prod_kind']` 依 §5.2 `GROUP-RESOLVE` 判定；**禁止**讀取 `ob_list_definition.prod_kind` backward-compat 衍生欄位作為分組依據（`I-F120-04`；理由見 §5.4） |
| BR-2 | **互斥且完備**：每一筆進入本區塊之名單（含無估算值者）恰好屬於一個分組。`GROUP-RESOLVE` 為全函式，此性質**依建構成立**，非靠測試維持（`I-F120-01`） |
| BR-3 | **運算子解讀單一落點**：`operator` 缺漏 ≡ `in` 之 fallback 一律沿用 [F119 BR-11](F119-categorical-text-match-operators.md) 之既有唯一落點；本區塊**禁止**自行撰寫 `cond.operator ?? 'in'`。代碼比對不做大小寫 / 全半形折疊（[F119 BR-8](F119-categorical-text-match-operators.md)） |
| BR-4 | **條件描述單一格式化來源**：篩選條件欄位之每一筆條件字串須由 `formatConditionSummary()` 產生（[F119 BR-10](F119-categorical-text-match-operators.md)）；本區塊**禁止**另拼字串，後端**禁止**回傳預先格式化之條件字串 |
| BR-5 | **分組標籤白名單驅動**：單一代碼分組之標題取自 `pooldata_field_option`（decode 機制），查無代碼時 fallback 顯示原始代碼；**禁止**硬編碼「汽車」「機車」「一般商品」。「多重產品類別」「未分類」為合成分組之固定業務文案，不適用本規則 |
| BR-6 | **分組順序固定**：汽車 → 機車 → 一般商品（依 `display_order ASC, option_value ASC`）→ 孤兒代碼組（代碼 ASC）→ 多重產品類別 → 未分類；組內依名單編號 ASC。顯示層不得重排 |
| BR-7 | **無估算值名單之三分處置**：①**仍列**於所屬分組清單（預估數量顯示「—」＋逾時視覺標記）②**不計入**分組小計、總計與佔比分母③**仍計入**分組名單數與名單總數。判定基準為「不存在於 `listTotals`」而非「是否逾時」（§12 G-5） |
| BR-8 | **佔比定義**：`percent[g] = Math.round(subtotal[g] / totalEstimatedCount × 100)`；`totalEstimatedCount = 0` → `null` → 顯示「—」（**禁** `0%` / `NaN` / `Infinity`）。各組四捨五入後加總可能不等於 100%，**不強制湊整**，非缺陷 |
| BR-9 | **空分組隱藏依名單數**：`listCount[g] = 0` 之分組不輸出 / 不顯示；`listCount[g] > 0` 但 `subtotalCount[g] = 0`（全數無估算值）之分組**仍須顯示**，並在分組層級標示合計未涵蓋之名單 |
| BR-10 | **本區塊不套 dept scope filter**：處長 / 部長 / Admin 一律見全公司名單集合；處長角色**必須**帶「本區塊為全公司名單層總量、非您所屬轄區之分派量」之語意標示。與同頁部門矩陣之處長隔離行為**相反**（§6.3） |
| BR-11 | **空狀態**：當月無啟用名單時，本區塊僅顯示空狀態文案（沿用 [F049 AC-AGG-3](F049-stage0-daily-estimate.md) 之文案），不渲染分組 / 名單列 / 小計 / 總計 |
| BR-12 | **唯讀**：本區塊不寫入任何分派紀錄，亦不回寫 `stage0_estimate_count`（沿用 [F049 BR-1](F049-stage0-daily-estimate.md)） |
| BR-13 | **不分叉底層**：預估數量一律取自既有 L1 `list_total[L]`；**禁止**為本區塊新增任何 per-list 篩選 / COUNT 邏輯（[F049 §22.1 I-RUN-EST-01](F049-stage0-daily-estimate.md)） |
| BR-14 | **不新增錯誤碼**：沿用既有 `STAGE0_LIST_ESTIMATE_PARTIAL`（warning）與 `STAGE0_ESTIMATE_TIMEOUT`（500，單一名單端點）；本 feature **不**變更 `error-handling.md`（§8） |

---

## 8. 錯誤處理

> **審查結論：本 feature 不需要任何新錯誤碼、不需要修改 [`error-handling.md`](../error-handling.md)。**

### 8.1 沿用之既有碼

| 碼 | 類型 | 沿用方式 |
|---|---|---|
| `STAGE0_LIST_ESTIMATE_PARTIAL` | Warning（回應 body 之 `warnings[]`，非 HTTP 錯誤） | **完全沿用**既有觸發邏輯、payload 結構 `{ code, listNo, message }` 與文案（已登錄於 [`error-handling.md#assignment-run-warnings`](../error-handling.md#assignment-run-warnings) v1.20）。本區塊之新增責任僅為：依 AC-LIST-10 於**名單列層級**呈現「—」＋逾時標記，並可辨識是哪一筆名單。與 [F119 AC-13 / BR-13](F119-categorical-text-match-operators.md)「不得靜默丟棄」之要求一致 |
| `STAGE0_ESTIMATE_TIMEOUT` | HTTP 500 | 單一名單試算端點（`GET /assignment/list-definitions/:listNo/estimate`）之整體失敗碼。**本區塊不產生此碼**（本區塊之逐名單估算失敗一律降級為上述 warning）。此區別已載於 error-handling.md，本 feature 不變更 |
| `AUTH_TOKEN_MISSING`（401） | HTTP | 未登入，沿用既有 Guard 行為 |
| `E07_REQUIRES_DIRECTOR_OR_SECTION_CHIEF`（403） | HTTP | 角色不符（一般業務員等）時由 `DirectorOrSectionChiefGuard` 攔截，沿用既有行為 |

### 8.2 非錯誤之降級情境

| 情境 | 系統回應 |
|---|---|
| 當月無啟用名單 | 200；`groups = []`、`totalListCount = 0`、`totalEstimatedCount = 0`；顯示空狀態（AC-LIST-12） |
| 全部名單皆無估算值 | 200；分組照常顯示（名單數 > 0）、所有 `subtotalCount = 0`、`totalEstimatedCount = 0`、所有 `percent = null`（顯示「—」）；`warnings[]` 含每筆名單之 `STAGE0_LIST_ESTIMATE_PARTIAL`（AC-LIST-08 / AC-LIST-10 / TC-184-15） |
| 處長 `getScopeDeptCode()` 回 `null` | 200；本區塊**完整內容照常回傳**（不受影響）；`SCOPE_UNRESOLVED` warning 僅對應部門矩陣區塊（§6.3） |
| 名單引用之產品類別代碼不在白名單 | 200；歸入該代碼之獨立分組，標籤 fallback 為原始代碼，排序見 §5.3 第 2 段（不報錯、不歸「未分類」） |
| 舊名單 `condition_payload IS NULL` | 200；歸「未分類」組，篩選條件欄顯示「（未設定篩選條件）」（**不**回退讀 backward-compat 欄位，BR-1） |

---

## 9. 術語遵循（顯示層契約）

### 9.1 使用者可見文字黑名單（本區塊追加，疊加於 [F049 §19.1](F049-stage0-daily-estimate.md)）

下列字串**一律不得**出現於本區塊之任何使用者可見文字（區塊標題、欄位標題、分組標題、小計 / 總計標籤、提示訊息、tooltip、空狀態、逾時提示）：

| 類別 | 移除字串 |
|---|---|
| 資料表 / 欄位名 | `ob_list_definition`、`pooldata_field_option`、`condition_payload`、`prod_kind`、`list_no`、`list_nm`、`stage0_estimate_count`、`stage0_estimated_at` |
| 內部代號 / 旗標 | `MULTI`、`UNCLASSIFIED`、`groupKey`、`groupType`、`estimateUnavailable`、`listTotals`、`STAGE0_LIST_ESTIMATE_PARTIAL`、`STAGE0_DEPT_ESTIMATE_TIMEOUT_MS` |
| 條件運算子技術詞 | `IN`、`in`、`contains`、`not_contains`、`equals`、`operator`、`keyword`、`fieldType`、`categorical` |
| 序列化格式 | `$$`（多值分隔符）、`JSON` / `JSONB` |
| 其他 | [F049 §19.1](F049-stage0-daily-estimate.md) 既有黑名單全數繼承（`rest_flg`、`ratioPerMille`、`base+1`、`ob_pool_data`、`AD-E07-*`、任何 `GET /api/v1/...` 路徑字串等） |

> **不受約束者**：名單編號之**值**（如 `OB202608001`）、名單名稱之**值**、產品類別標籤之**值**（`option_label`，如「汽車」）——這些是業務資料而非技術詞。

### 9.2 允許用語（意圖；最終逐字文案由 ui-ux-designer 定案）

| 概念 | 允許用語 |
|---|---|
| 區塊標題 | 「名單基礎預估數量總覽」（已核可，不得改名） |
| 欄位標題 | 「名單編號」／「名單名稱」／「篩選條件」／「預估數量」 |
| 分組標題（單一代碼） | 白名單 `option_label`（如「汽車」「機車」「一般商品」）——由 decode 取得，非硬編碼 |
| 分組標題（合成組） | 「多重產品類別」／「未分類」（已核可之固定順序與名稱） |
| 分組小計 | 「名單數」／「預估數量小計」／「佔比」 |
| 總計列 | 「名單總數」／「預估數量總計」 |
| 無估算值 | 「—」＋沿用同頁既有逾時語彙（如「未能估算」／「本次未納入合計」）；**不得**寫成「逾時」以外之技術描述，亦不得顯示 0 |
| 分組層級提示 | 「本組合計未涵蓋未能估算之名單」或等義 |
| 處長語意標示 | 「本區塊為全公司名單層總量，非您所屬轄區之分派量」或等義（AC-LIST-11） |
| 空狀態 | 「本月尚無啟用名單，請先於名單定義頁建立並啟用名單」（沿用 [F049 AC-AGG-3](F049-stage0-daily-estimate.md)） |
| 未設定條件 | 「（未設定篩選條件）」 |

**AC-TERM-F120-1**：本區塊 DOM 全文掃描，§9.1 黑名單字串均不出現（延續 [F049 AC-TERM-1](F049-stage0-daily-estimate.md) 之 regression 機制）。

---

## 10. 不變量與邊界案例

### 10.1 不變量

| 編號 | 不變量 | 成立方式 |
|---|---|---|
| `I-F120-01` | **分組互斥且完備**：本區塊之每一筆名單（含無估算值者）恰好出現於一個分組；跨分組之名單編號聯集 = 名單集合全集，無重複、無遺漏 | `GROUP-RESOLVE` 為全函式（§5.2），**依建構成立** |
| `I-F120-02` | **Σ 分組小計 = 總計**：`Σ_g subtotalCount[g] = totalEstimatedCount`，且 `Σ_g listCount[g] = totalListCount`（兩式皆嚴格相等，無捨入誤差——皆為整數相加） | 依 `I-F120-01` ＋ §5.5 定義成立 |
| `I-F120-03` | **跨區塊同源且顯示值嚴格相等（v1.2 定案）**：本區塊之 `totalEstimatedCount` 與同頁部門區塊之 [F049](F049-stage0-daily-estimate.md) `orgMonthTotal` ①**恆**取自同一個 `resolveListTotals(ym, listNo?)`（不得各自查詢 / 各自估算）②**數值嚴格相等**。**充分條件**：`excluded(dept-estimate) === excluded(list-estimate-overview)`（兩端因無估算值而被排除之名單編號集合相同）⟹ 嚴格相等；此條件在**測試環境恆成立**（同一行程、同一組 fixture / mock），故測試套件中**無條件斷言**，**不得**加 `unestimatedListCount` 分支（見 AC-LIST-09 測試層指示）。注意 `unestimatedListCount = 0` 僅為該充分條件之**特例**，兩者非等價 | ①由 §1.2 數值底座約束 ＋ AD-E07-51 §4.3 共用方法 ＋ `I-LISTOVW-SHARED-SOURCE-01` **依建構**保證；②由 [F049 v2.1 BR-17 / AC-DEPT-3](F049-stage0-daily-estimate.md)（月層級改精確和、以 `orgMonthTotal` 承載）＋ AD-E07-51 v1.2 §4.5.1 `I-LISTOVW-STRICT-EQUALITY-BOUNDARY-01` 保證。**適用所有角色**（`orgMonthTotal` 為 `number`、非 nullable，處長亦可斷言）。**明確排除**：不延伸至「Σ 各日顯示值」（殘差 ≤ 工作日數 × 0.5）。**生產環境**之 timeout 分歧窗口為已知殘留風險（非靜默錯誤、非測試豁免分支），根因處置為提高 F088 物化覆蓋率 |
| `I-F120-04` | **分組來源唯一**：分組判定僅讀 `condition_payload`，不讀 `prod_kind` 衍生欄位 | BR-1；可以 grep 反向斷言（本區塊程式碼不得出現對 `prod_kind` entity 欄位之讀取） |
| `I-F120-05` | **本區塊無 dept scope**：任一角色（含處長）取得之名單集合恆等於「當月全部啟用名單」（單一名單模式除外） | BR-10 / §6.3；可以「同月同參數下，處長與部長之 `totalListCount` / `groups[].lists[].listNo` 集合完全相同」斷言 |

### 10.2 邊界案例矩陣

| 案例 | 預期行為 | 對應 |
|---|---|---|
| 當月 0 筆啟用名單 | 空狀態文案；`groups = []`；不渲染表格 | AC-LIST-12 / BR-11 |
| 名單無 `condition_payload`（舊名單） | 歸「未分類」；條件欄顯示「（未設定篩選條件）」 | AC-LIST-04 / AC-LIST-06 |
| 名單有條件但無產品類別條件 | 歸「未分類」；條件欄完整顯示其他條件 | AC-LIST-06 |
| 產品類別條件 `in ['01']` | 歸「汽車」組 | TC-184-03 |
| 產品類別條件 `in ['01','01']`（重複值） | 去重後為單一代碼 → 歸「汽車」組（**非**「多重產品類別」） | §5.2 步驟 6b |
| 產品類別條件 `in ['01','02']` | 僅歸「多重產品類別」組一次 | TC-184-04 |
| 產品類別條件 `in []`（空可選值） | 歸「未分類」組（不 crash、不視為多值） | §5.2 步驟 6c |
| 產品類別條件為 `contains` / `not_contains` / `equals` | 歸「未分類」組 | TC-184-05 |
| 產品類別條件之 `operator` key 缺漏 | 視為 `in`，依 `values` 判定 | AC-LIST-06b / [F119 AC-17](F119-categorical-text-match-operators.md) |
| 名單引用未登錄之產品類別代碼 | 自成一組；標籤 = 原始代碼；排序於已登錄代碼之後 | §5.3 |
| 名單引用已停用（`is_active = false`）之代碼 | 照常視為已登錄代碼組（標籤、排序不變） | §5.3 / [F076 BR-4](F076-manage-categorical-field-values.md) |
| 某分組全數名單無估算值 | 分組**仍顯示**；小計 0；佔比「—」或 0%（依總計是否為 0）；帶分組層級提示 | AC-LIST-10 / BR-9 |
| 全部名單無估算值 | `totalEstimatedCount = 0`；所有分組佔比顯示「—」 | TC-184-15 / BR-8 |
| 單一名單鑽探且該名單無估算值 | 總計 = 0；佔比「—」；名單列顯示「—」＋逾時標記 | AC-LIST-09 / AC-LIST-10 |
| 處長 `getScopeDeptCode()` = null | 本區塊完整回傳（不降級）；仍須帶語意標示 | §6.3 / AC-LIST-11 |
| 處長與部長同參數比較 | 本區塊內容完全相同（僅語意標示之有無不同） | `I-F120-05` / TC-184-16 |
| 佔比四捨五入後加總 = 99% 或 101% | **預期行為**，不修正、非缺陷 | AC-LIST-08 / BR-8 |

---

## 11. 測試覆蓋對照（US-184 TC ↔ F120）

| TC | 驗證標的 | F120 落點 |
|---|---|---|
| TC-184-01 | 區塊存在且位於既有兩區塊之後 | AC-LIST-01 |
| TC-184-02 | 名單篩選器連動縮限 | AC-LIST-02 / §6.2 `listNo` |
| TC-184-03 | 單一代碼歸屬 | §5.2 步驟 6d |
| TC-184-04 | 多值歸「多重產品類別」且不重複計入 | §5.2 步驟 6e / `I-F120-01` |
| TC-184-05 | 文字運算子與未設定皆歸「未分類」 | §5.2 步驟 5 / 步驟 2a |
| TC-184-06 | 分組標題來自白名單 decode（改 label 後畫面同步） | AC-LIST-05 / BR-5 |
| TC-184-07 | 跨區塊總量一致性 | `I-F120-03`；**斷言形式＝無條件嚴格相等**：`expect(deptEstimate.orgMonthTotal).toBe(listOverview.totalEstimatedCount)`。**不得**寫成依 `unestimatedListCount` 或任何降級旗標之分支式斷言——測試環境下兩端排除集合恆相等（同一行程、同一組 fixture / mock），加分支會連帶跳過「排除集合相同且非空 → 縮減後仍相等」之情境（含 AC-LIST-10 部分降級測試本身）。**另一條紅線**：**不得**改寫為「`Σ_d days[].orgTotal`」之比較（該關係恆不相等，殘差 ≤ 工作日數 × 0.5）。詳見 AC-LIST-09 測試層指示 |
| TC-184-08 | 無估算值名單顯示「—」且不計入小計 / 總計 | AC-LIST-10 / BR-7 |
| TC-184-09 | 空分組不顯示 | BR-9（依名單數判定） |
| TC-184-10 | 空狀態 | AC-LIST-12 / BR-11 |
| TC-184-11 | 不寫入任何分派紀錄 | AC-LIST-13 / BR-12 |
| TC-184-12 | 條件字串與名單詳情 Drawer 逐字元相同 | AC-LIST-04（**比較對象為單一條件字串**，見 §12 G-4） |
| TC-184-13 | 分組互斥完備 | `I-F120-01` / §5.2 |
| TC-184-14 | 佔比計算正確 | BR-8 / §5.5 |
| TC-184-15 | 總計為 0 時佔比降級為「—」 | BR-8 / §8.2 |
| TC-184-16 | 處長全量可見且帶語意標示 | AC-LIST-11 / `I-F120-05` / BR-10 |

**建議追加之回歸測試（本 spec 提出，非 US-184 字面要求）**

| 編號 | 標的 |
|---|---|
| TC-F120-A | `values` 重複值去重後仍為單一代碼 → 歸單一類別組（非多重） |
| TC-F120-B | `operator` key 缺漏之舊 payload 與顯式 `operator: 'in'` 之分組結果相同 |
| TC-F120-C | 名單引用未登錄代碼 → 自成一組、標籤 fallback 為代碼、排序於已登錄代碼之後 |
| TC-F120-D | 處長與部長以同一 `ym` 呼叫，本區塊 `listNo` 集合與 `totalEstimatedCount` 完全相同（`I-F120-05`） |
| TC-F120-E | grep 反向斷言：本區塊之分組程式碼未讀取 `prod_kind` entity 欄位（`I-F120-04`） |

---

## 12. spec / schema 落差與修正主張

> 專案規矩：發現 spec 與現有 schema／實作落差時，先寫清楚並提出修正主張，不留給實作者踩。以下 6 項均為本輪查證所得。

### G-1 ✅ **已裁決（2026-08-20，使用者 / team lead：採首選主張）**：F049 KPI「本月全名單總量」為每日捨入值之和，與名單總量之精確和不必然相等

> **裁決結果**：**採納首選——修正 F049 之 KPI 算式為 `Σ_L list_total[L]` 精確和。**
> 已落地於 [F049 v2.1](F049-stage0-daily-estimate.md)：新增 §16.5（月層級彙總定義）、AC-DEPT-3、BR-17；§14.3 契約新增 `orgMonthTotal`；受影響之既有實作與測試落點列於 [F049 §24](F049-stage0-daily-estimate.md)（僅定位、未改 code）。
> **對本 spec 之影響**：AC-LIST-09 之跨區塊斷言與 `I-F120-03` 已收緊為**嚴格相等**；§11 TC-184-07 之斷言形式同步改為嚴格相等；OQ-F120-B1 關閉（§13.3）。
> **併同查證之補充事實**：`prototypes/30-stage0-estimate.html:517` 之 `orgMonthTotal = lists.reduce((s, l) => s + l.total, 0)` **本即為精確和**——現行 React 實作與 prototype 脫節，本次修正同時回復 prototype fidelity，非新增行為。
> 以下分析內容原樣保留作為溯源。

- **現況**：`stage0-estimate-page.tsx` 之 `orgMonthTotal = Σ_{工作日 d} days[d].orgTotal`，而 `days[d].orgTotal = Math.round( Σ_L list_total[L] × dpm[d] / 1000 )`（後端 `computeDeptEstimate`）。
- **數學事實**：`Σ_d ( Σ_L list_total[L] × dpm[d]/1000 ) = Σ_L list_total[L]`（因 `Σ_d dpm[d] = 1000`，**實數層精確相等**）；但**逐日先捨入再相加**會產生殘差，上界為 `工作日數 × 0.5`（20 個工作日約 ±10 件）。舉例：總量 28,501、20 個工作日均分 → 每日 `1425.05 → 1425`，`× 20 = 28,500 ≠ 28,501`。
- **衝擊**：US-184 AC-LIST-09 / TC-184-07 之字面要求「兩者數值相等」在一般情形下**不成立**。若下游照字面寫嚴格相等斷言，將產生間歇性紅燈並被誤判為 F120 缺陷。
- **主張（建議採納，需 team lead ／ architect 拍板）**：
  1. **首選**——修正 F049 之 KPI 算式：「本月全名單總量」改由 `Σ_L list_total[L]`（精確整數和）取得，而非 `Σ_d round(orgTotal[d])`。理由：該 KPI 之語意本就是「本月名單總量」而非「各日顯示值之和」；每日捨入是**呈現層需要**，不應污染月層級 KPI。改動極小、方向與 [F049 §16.3](F049-stage0-daily-estimate.md) 既有「不做尾差調整」之精神不衝突（後者針對**部門格**，非月 KPI）。採納後 TC-184-07 可寫嚴格相等。
  2. **備選（⚠️ 已作廢，僅供溯源）**——維持 F049 不動，將 TC-184-07 之斷言改為容差式：`|F120 總計 − F049 KPI| ≤ ceil(工作日數 / 2)`，並於兩區塊之 tooltip 說明差異來源。
- **本 spec 之處置（v1.2 更新）**：裁決採 (1) 首選，AC-LIST-09 / `I-F120-03` / §11 TC-184-07 均已改為**嚴格相等**，且依 [AD-E07-51](../implementation-log/AD-E07-51-f120-list-estimate-overview.md) v1.2 §4.5.1 明訂**測試套件中無條件斷言**（充分條件＝兩端排除集合相同，測試環境恆成立）；OQ-F120-B1 與 OQ-F120-A5 均已關閉。**上方 (2) 之「容差」備選方案自本次裁決起作廢**，僅保留為歷史分析；v1.0 原文之「拍板前一律容差斷言」亦同。

### G-2：`pooldata_field_option` 之 `prod_kind` 三筆 `display_order` 皆為 0

- **現況**：seed（`pooldata-field-option.json`）中 `01` / `02` / `03` 之 `display_order` 全為 `0`。
- **衝擊**：US-184 AC-LIST-07 之「依 `pooldata_field_option` 既有登錄順序 `01`/`02`/`03`」若僅以 `display_order` 排序，結果**非決定性**（同值），可能得到任意順序。
- **主張（本 spec 已採納，不需另行拍板）**：排序鍵定為 `display_order ASC, option_value ASC`——與既有 `PooldataFieldOptionService.listOptions()` 之排序**完全相同**，故非新規則而是與既有行為對齊。現行資料下即得 01 → 02 → 03，符合 AC-LIST-07。已寫入 §5.3 / BR-6。
- **附帶提醒**：若業務日後透過 F076 reorder 端點調整順序，本區塊之分組順序會**隨之改變**——此為 AC-LIST-05「白名單驅動」之預期後果，非缺陷。

### G-3：`ob_list_definition.prod_kind` 無法區分「文字運算子」與「未設定」

- **現況**：`deriveBackwardCompatColumns()` 之條件為 `cond.fieldType === 'categorical' && Array.isArray(cond.values)`；F119 文字運算子之條件僅帶 `keyword` 而無 `values`，故衍生結果與「完全未設定」同為空字串 `''`。
- **衝擊**：任何以 `prod_kind` 欄位為分組依據之實作，將無法滿足 AC-LIST-06 之四分支判定，亦無法支援日後把「文字運算子」另立一組之需求。
- **主張（本 spec 已採納）**：分組判定之唯一權威來源為 `condition_payload`（BR-1 / `I-F120-04`），並建議下游以 grep 反向斷言確保本區塊未讀該欄位（TC-F120-E）。
- **附帶**：本 spec **不主張**修改 `deriveBackwardCompatColumns()` 之行為——該函式服務的是 legacy 讀取端之向後相容，為其加上文字運算子衍生反而會產生誤導性的假值。

### G-4：TC-184-12「逐字元相同」之比較對象需限定為單一條件字串

- **現況**：`formatConditionSummary()` 產出的是**單一條件**之描述字串；名單詳情 Drawer 逐條渲染成 `<li>`，而名單定義列表 Kanban 卡片只取**前 2 筆**條件並以 `+N` 摘要（`list-definition-page.tsx`）。
- **衝擊**：若把 TC-184-12 解讀為「整格文字與 Kanban 卡片逐字元相同」，因截斷策略不同必然失敗，且會逼迫本區塊複製 Kanban 之截斷邏輯（與 AC-LIST-04「須完整呈現全部條件」直接矛盾）。
- **主張（本 spec 已採納）**：AC-LIST-04 明訂比較對象為**單一條件之描述字串**與**名單詳情 Drawer** 對同一條件之字串；串接符號、截斷與展開屬版面決策（交 ui-ux-designer）。已寫入 AC-LIST-04 末段。

### G-5：`STAGE0_LIST_ESTIMATE_PARTIAL` 之實際觸發範圍寬於「逾時」

- **現況**：`computeDeptEstimate` 之 fallback 迴圈為 `try { raceTimeout(estimateListCount(...)) } catch { push STAGE0_LIST_ESTIMATE_PARTIAL }`——`catch` 捕捉**所有**例外（含 `ASSIGNMENT_LIST_NOT_FOUND`、查詢錯誤、`STAGE0_ESTIMATE_TIMEOUT` 內部拋出等），非僅逾時。而 [`error-handling.md`](../error-handling.md) 之登錄文案為「估算逾時」。
- **衝擊**：若 F120 把 AC-LIST-10 之判定寫成「逾時的名單」，非逾時原因造成的無估算值名單將**無法可靠地**被歸入該分支，可能被誤顯示為 0（正是專案既有教訓所禁）。
- **主張（本 spec 已採納）**：AC-LIST-10 / BR-7 之判定基準改述為「**該名單不存在於 `listTotals`（無估算值）**」，涵蓋所有原因；使用者可見文案**沿用既有訊息不改**（避免文案churn 且逾時確為主因）。若日後要精確區分原因，屬 error-handling 之專責 pass（見 [`open-questions.md`](../open-questions.md) OQ-F119-05 併同發現），非本 feature 範疇。
- **另註（既有登錄落差，本輪不回填）**：同一端點之 `SCOPE_UNRESOLVED` / `DEPT_HEADCOUNT_ZERO` / `CALENDAR_EMPTY` 與 `poolWarning = 'POOL_COUNT_LOW'` 仍未登錄於 error-handling.md（v1.20 banner 已自承）。F120 不依賴這些碼，故本輪維持不動。

### G-6：US-184 內部之潛在矛盾——「逾時名單不受互斥完備約束」vs「逾時名單仍列於清單」vs「空分組隱藏」

- **矛盾點**：AC-LIST-06 括號稱「估算逾時名單依 AC-LIST-10 另計，不受本不變量約束」；但 AC-LIST-10 要求逾時名單**仍列於清單**——既然要顯示，就必然落在某個分組，否則無處可放；同時 AC-LIST-08 稱「空分組不顯示」，而 AC-LIST-10 又要求「組內全數逾時（小計 0）之分組仍需顯示」，若隱藏判定看小計即互相打架。
- **主張（本 spec 已採納，消除矛盾且不改變任何業務結果）**：
  1. **分組歸屬涵蓋全部名單**（含無估算值者）——分組僅依條件判定，與估算成敗無關（AC-LIST-06a / `I-F120-01`）。US-184 之「另計」解讀為「**不計入件數小計**」，而非「不歸屬分組」。
  2. **兩個獨立計數**：`listCount`（含無估算值）用於分組名單數、名單總數與**空分組隱藏判定**；`subtotalCount` / `totalEstimatedCount`（排除無估算值）用於件數小計、總計與**佔比分母**。
  3. **空分組隱藏依 `listCount = 0`**，故「組內全數無估算值」之分組（`listCount > 0`、`subtotal = 0`）自然仍顯示，AC-LIST-08 與 AC-LIST-10 同時成立。
- **與佔比分母之一致性**：分母 = `totalEstimatedCount`（排除無估算值），與各組分子 `subtotalCount` **口徑相同**，故 `Σ percent` 之偏差僅來自四捨五入（BR-8 已明訂為預期行為），不會來自口徑不一致。

---

## 13. 未決問題

> 本 feature 之業務層問題已由 2026-08-20 之三項裁決全數關閉（AC-LIST-06 / AC-LIST-11 / AC-LIST-08）。以下為交付其他 agent 之項目與一項需拍板之斷言形式。

### 13.1 交 system-architect

> **✅ OQ-F120-A1~A4 已於 2026-08-20 由 [AD-E07-51](../implementation-log/AD-E07-51-f120-list-estimate-overview.md) §4 全數裁定**（`architecture-spec.md` §5.21 同步）。以下保留原題目與 spec-writer 建議預設，並記錄裁決結果，供溯源與下游對照。

| ID | 議題 | spec-writer 建議預設 | 裁決結果（AD-E07-51） |
|----|------|---------------------|----------------------|
| **OQ-F120-A1** | **端點拓樸**（承接 US-184 OQ-184-05）：新增獨立唯讀端點，或擴充既有 `dept-estimate`？ | 新增獨立端點——授權語意與部門矩陣相反，混入同一回應為安全邊界最易出錯之形態；但 `listTotals` 須共用 | ✅ **採建議**：新增 `GET /api/v1/assignment/stage0/list-estimate-overview`（§4.1）。併同查證：既有 `computeDeptEstimate` 之 `lists` / `listTotals` 建立邏輯**本就未套** scope 過濾（scope 僅施於其後之 `deptPctRows`），與本區塊無 scope 語意天然對齊 |
| **OQ-F120-A2** | **運算歸屬**：後端計算並回傳 §6.1 shape，或顯示層計算？ | 後端計算（避免顯示層重複實作 operator fallback、使 TC-184-13~15 可於 API 層斷言） | ✅ **採建議**：後端 `computeListEstimateOverview()`；新增**純函式** `resolveListGroup()`（`stage0-list-group-resolve.ts`）**匯入**既有 `resolveCategoricalOperator()`，不新建第三個 fallback 落點（`I-LISTOVW-OPERATOR-SINGLE-SOURCE-01` / `I-LISTOVW-PURE-GROUP-RESOLVE-01`，§4.2） |
| **OQ-F120-A3** | **`listTotals` 共用機制**：如何保證兩區塊取自同一份 `listTotals`（`I-F120-03`）？ | 抽出單一 method 供兩區塊呼叫 | ✅ **採建議**：抽出 `Stage0EstimateService.resolveListTotals(ym, listNo?)` 私有方法，由 `computeDeptEstimate` 與 `computeListEstimateOverview` 共同呼叫（同一 class、同一段程式碼）→ **`I-F120-03` 依建構成立**，非靠測試維持（`I-LISTOVW-SHARED-SOURCE-01`，§4.3） |
| **OQ-F120-A4** | **效能**：兩端點可能各觸發一次 fallback dry-run（重複成本），是否需快取層？ | 不另引入快取層，沿用既有 30s 降級語意 | ✅ **採建議**：不新增快取層（`I-LISTOVW-NO-NEW-CACHE-01`，§4.4）；論證重複成本為有界之固定倍率、非隨資料量增長之無界成本 |

**本 spec 之連帶更新（v1.1）**：§6.1 之契約 shape 與 §6.4 之 [ASSUMPTION] A-2 已由上述裁決確認為定案方向；欄位命名與端點路徑以 AD-E07-51 §6 為權威（若與本檔 §6.1 有出入，以 AD 為準並回報 spec-writer 同步）。

#### 已定案（原追蹤項）

| ID | 議題 | 裁決結果 |
|----|------|---------|
| **OQ-F120-A5** | **AC-LIST-09 跨區塊嚴格相等之邊界條件**：兩端點各自執行 fallback dry-run 而其中一次逾時時，兩側精確和可能不一致，需定義邊界與測試層處置 | ✅ **已定案（2026-08-20，[AD-E07-51](../implementation-log/AD-E07-51-f120-list-estimate-overview.md) v1.2 §4.5.1，不變式 `I-LISTOVW-STRICT-EQUALITY-BOUNDARY-01`）**：**充分條件＝`excluded(dept-estimate) === excluded(list-estimate-overview)`**（兩端因無估算值而被排除之名單編號集合相同）⟹ 嚴格相等；**該條件於測試環境恆成立**（分歧之唯一成因為兩個獨立 HTTP 請求對同一 fallback 查詢因真實 DB 負載產生之 timeout 分歧，需真實網路時序競爭；同一測試行程內兩次呼叫套用同一組 fixture / mock，排除集合恆相等，**含刻意建構之 AC-LIST-10 部分降級情境**——此時縮減後之總和仍嚴格相等），故**測試套件中無條件斷言嚴格相等**、**不得**加 `unestimatedListCount` 分支（加分支反而放棄驗證力道）。生產環境之 timeout 分歧窗口列為**已知殘留風險**（非靜默錯誤，兩端皆有既有 warning 標示），根因處置為提高 [F088](F088-ready-stage-summary.md) 物化覆蓋率，**不**在讀取端加同步 / 快取（維持 AD §4.4）。已寫入本檔 **AC-LIST-09**（充分條件 + 測試層指示 + 生產殘留風險 + 兩組關係表）、`I-F120-03`、§11 TC-184-07 |

### 13.2 交 ui-ux-designer — ✅ U1 / U2 / U3 全數定案（2026-08-20）

> prototype `prototypes/30-stage0-estimate.html` 已完成（1072 → 1633 行），設計報告見 [`ui-ux-design-overview.md` 附錄 D](../../ui-ux-design-overview.md)。三項定案**已編碼進 AC**（見末欄），故 test-generator 可直接斷言，不需再讀設計報告。

| ID | 議題 | 承接自 | 定案結果與落入之 AC |
|----|------|--------|-------------------|
| **OQ-F120-U1** | ①條件欄多筆條件串接／截斷／展開互動 ②處長語意標示文案與位置 ③區塊視覺排序與可摺疊 | US-184 OQ-184-03 | ✅ ①**每筆條件各自一個標籤、不串接**＋底部「且」關係說明句；截斷＝**前 2 筆 ＋「＋N 項」**；展開＝**就地展開之真正 `<button>`**（禁 hover / tooltip / 浮層），焦點回到觸發按鈕 → **[AC-LIST-04](#ac-list-04)**　②**三個觸點**（標題徽章／表格上方說明條／**總計列後綴**）→ **[AC-LIST-11](#ac-list-11)**　③維持既有兩區塊之後、頁尾提示之前（AC-LIST-01 原定位置不動）；**可摺疊、預設全展開、附「全部收合／全部展開」** → 屬版面決策，AC-LIST-08 已明確允許分組列即小計列 |
| **OQ-F120-U2** | 單一名單鑽探模式下佔比欄位之呈現 | US-184 AC-LIST-08 末段 | ✅ **保留欄位、所有格顯示「—」、欄標題下加灰字副標**；明訂**不得顯示 `100%`**（同義反覆且會被誤讀為「佔全月總量 100%」）與**不得抽掉欄位**（破壞表頭一致性、增加版面分支）→ **[AC-LIST-08](#ac-list-08)** |
| **OQ-F120-U3** | 無估算值之視覺標記須與 [F119 AC-13](F119-categorical-text-match-operators.md) 收斂為同一套語彙 | 本 spec 新增 | ✅ **完全沿用本頁既有逾時語彙**（琥珀 `amber` ＋ `hourglass`），不新增顏色或圖示；三個層級（列／分組／區塊）皆為就地指認，逐筆名單與後端原文訊息仍**只**由頁首既有 warning banner 承載，不重複列出 → **[AC-LIST-10](#ac-list-10)** 之「與同頁既有逾時提示一致之視覺標記」即此定案 |

#### 13.2.1 prototype 測試掛點（供 test-generator 定位；以 prototype 為準）

| 掛點 | 對應 AC |
|---|---|
| `list-overview-group-row` / `-group-label` / `-group-listcount` / `-group-subtotal` / `-group-percent` | AC-LIST-05 / 07 / 08（分組列即小計列） |
| `list-overview-group` / `-group-body` / `-group-toggle` / `-toggle-all` | AC-LIST-07 分組結構；摺疊為版面決策 |
| `list-overview-list-row`（帶 `data-list-no`） / `-list-count` | AC-LIST-03 / 06a（互斥完備可由 `data-list-no` 集合驗證） |
| `list-overview-cond-toggle` / `-no-condition` | AC-LIST-04（「＋N 項」按鈕／「（未設定篩選條件）」） |
| `list-overview-total-row` / `-total-listcount` / `-total-estimated`（含 `data-total-estimated`） | AC-LIST-09（跨區塊嚴格相等可由 `data-total-estimated` 取值） |
| `list-overview-org-scope-badge` / `-chief-notice` / 總計列後綴 | AC-LIST-11 三個觸點 |
| `list-overview-unestimated-badge` | AC-LIST-10 |
| `list-overview-empty` | AC-LIST-12 |
| `data-group-kind="code｜combined｜unset"` / `data-group-id` | AC-LIST-06 分組歸屬；**注意**合成分組之 DOM 鍵刻意為 `combined` / `unset` 而非 `MULTI` / `UNCLASSIFIED`，以確保 §9.1 黑名單之 DOM 全文掃描不誤判 |

### 13.3 交 team lead（已關閉）

| ID | 議題 | 裁決 | 狀態 |
|----|------|------|------|
| **OQ-F120-B1** | §12 G-1：F049 KPI「本月全名單總量」是否改為 `Σ_L list_total[L]` 精確和？此決定 TC-184-07 可否寫嚴格相等斷言 | **✅ 已裁決（2026-08-20，使用者 / team lead）：採首選主張，F049 KPI 改精確和。** 已落地於 [F049 v2.1](F049-stage0-daily-estimate.md)（§16.5 / AC-DEPT-3 / BR-17 / §14.3 `orgMonthTotal` / §24 影響清單）。本 spec 之 AC-LIST-09、`I-F120-03`、TC-184-07 已同步收緊為**嚴格相等** | ✅ 已關閉 |

> **本 feature 對 team lead 已無殘留待裁項目。** 剩餘 OQ 均為 architect（§13.1）與 ui-ux-designer（§13.2）之 HOW 決策。

---

## 14. 依賴關係

**Blocked By**

- [F049 v2.0](F049-stage0-daily-estimate.md)（頁面本體、名單集合、L1 `list_total[L]`、處長 scope 先例、術語黑名單）
- [F050 v2.4](F050-create-list-definition.md)（`condition_payload` 為篩選條件 source of truth）
- [F075](F075-manage-pooldata-field-whitelist.md) / [F076](F076-manage-categorical-field-values.md)（`prod_kind` 白名單欄位與可選值、`display_order` / `is_active` 語意）
- [F119](F119-categorical-text-match-operators.md)（`operator` / `keyword` 契約、`resolveCategoricalOperator` 單一 fallback、`formatConditionSummary` 單一格式化來源、`STAGE0_LIST_ESTIMATE_PARTIAL` 呈現慣例）
- [F088](F088-ready-stage-summary.md)（`stage0_estimate_count` 物化快取之寫入端）

**Blocks**：無已知下游 feature

**相關**：[F048](F048-view-list-definition.md)（名單定義列表之條件 chip 顯示端）、[F092](F092-stage1-dry-run-estimate.md)（per-list dry-run COUNT 語意）

---

## 15. 假設

| 編號 | 假設 | 影響 / 處置 |
|---|---|---|
| A-1 | `calendarSource` / `startDate` / `endDate` 對本區塊為 no-op（本區塊無日曆維度） | §6.2；若架構師選擇擴充既有端點，此三參數本就存在，不需變更 |
| A-2 | 分組 / 小計 / 佔比於後端計算並回傳 §6.1 之 shape | §6.4；交 architect 確認（OQ-F120-A2）。改變運算歸屬不改變演算法與不變量 |
| A-3 | `prod_kind` 條件在單一名單中至多一筆（寫入端 `validateConditionPayload` 已對重複 `columnName` 攔截） | §5.2 步驟 2b 已加 last-wins 防禦，鏡射 `deriveBackwardCompatColumns` 之既有處置；即使假設不成立行為仍為決定性 |
| A-4 | 產品類別代碼不會與保留字 `MULTI` / `UNCLASSIFIED` 碰撞 | §5.2；契約已提供 `groupType` 作為結構化判別，碰撞時不影響正確性（僅 `groupKey` 字串不再唯一） |
| A-5 | 「多重產品類別」「未分類」之標籤為固定業務文案，不需納入白名單維護 | AC-LIST-05；若業務要求可維護化，屬 F076 範疇之另案 |
| A-6 | 本區塊之名單集合與部門矩陣之名單集合由同一查詢條件產生（`project_workym` + `status='active'`），故 `I-F120-03` 之「同一名單集合」前提成立 | 已對 `computeDeptEstimate` 查證；若日後任一側加上額外過濾（如排除某 `stage`），`I-F120-03` 即破，須同步修訂本 spec |

---

## 16. 交叉參考

- 相關圖表：[diagrams/F120-list-group-resolution.mmd](../diagrams/F120-list-group-resolution.mmd)（分組判定 + 小計 / 佔比 + 顯示過濾流程）
- 資料模型：[`data-model.md`](../data-model.md) — `ob_list_definition`（`list_no` / `list_nm` / `condition_payload` / `prod_kind` / `stage0_estimate_count`）、`pooldata_field_option`
- 錯誤處理：[`error-handling.md#assignment-run-warnings`](../error-handling.md#assignment-run-warnings)（`STAGE0_LIST_ESTIMATE_PARTIAL`）、[`error-handling.md#assignment-misc-errors`](../error-handling.md#assignment-misc-errors)（`STAGE0_ESTIMATE_TIMEOUT`）
- 架構決策：[AD-E07-51](../implementation-log/AD-E07-51-f120-list-estimate-overview.md)（§4.1 端點拓樸 / §4.2 運算歸屬＋`resolveListGroup()` / §4.3 `resolveListTotals` 共用 / §4.4 效能 / §4.5 `orgMonthTotal` / §6 端點契約 / §8 HOW 層級不變式）；`architecture-spec.md` §5.21
- 同頁既有區塊：[F049 v2.1](F049-stage0-daily-estimate.md)（§16.5 月層級彙總 / AC-DEPT-3 / BR-17）
- 待決事項：[`open-questions.md`](../open-questions.md) — F120 節
- Prototype（**UI ground truth**，ui-ux-designer 所有）：`prototypes/30-stage0-estimate.html`（已完成，1633 行）
- UI/UX 設計定案報告：[`ui-ux-design-overview.md` 附錄 D](../../ui-ux-design-overview.md)（D.2 決策表 D-1~D-16、D.7 待確認 D-Q1~D-Q6、D.9 實測結果）；其中 D-2 / D-3 / D-4 / D-5 / D-6 / D-8 / D-9 / D-13 已於 v1.3 編碼進 AC

---

## 17. 變更紀錄

| 版本 | 日期 | 變更內容 | 負責人 |
|---|---|---|---|
| 1.3 | 2026-08-20 | **ui-ux-designer 六項定案編碼進 AC**（原僅存在於 prototype 與設計報告附錄 D，test-generator 讀不到）：**AC-LIST-04** 新增「顯示端不做去重」（刻意行為、禁下游修掉）＋ OQ-F120-U1 ① 三參數（每筆條件獨立標籤不串接＋「且」說明句／截斷前 2 筆＋「＋N 項」／就地展開之真正 `<button>`，禁 hover・tooltip・浮層）；**AC-LIST-08** 新增「`0%` vs 「—」兩情境對照表」（釐清「不得顯示 `0%`」之前提為分母為 0）＋ OQ-F120-U2 定案（保留佔比欄、全顯示「—」、加灰字副標；禁 `100%`、禁抽欄）＋ 明確允許「分組列即小計列」並反向禁止獨立小計列（收合會藏掉小計）；**AC-LIST-11** 由「明確語意標示」細化為**三個必要觸點**（標題徽章／表格上方說明條／**總計列後綴**）＋ 觸發條件與有無轄區無關；**§13.2** OQ-F120-U1 / U2 / U3 全數關閉並新增 **§13.2.1 prototype 測試掛點表**。AC / BR 總數不變（14 / 14）；演算法 / 契約 shape / 授權特例 / 術語規範未動。連帶 [F049 v2.2](F049-stage0-daily-estimate.md) 記錄處長 banner 文案變更 | Spec Writer Agent |
| 1.2 | 2026-08-20 | **欄位命名最終裁決 ＋ 跨區塊嚴格相等邊界條件定案**。①team lead 裁定 [F049](F049-stage0-daily-estimate.md) 月層級欄位名為 **`orgMonthTotal`**（理由：prototype `30-stage0-estimate.html:517` 本即同名、前端既有變數同名、與 `days[].orgTotal` 同族），本檔所有引用同步，先前草擬之其他候選名稱作廢；型別 `number`（非 nullable、所有角色皆回傳）。②依 [AD-E07-51](../implementation-log/AD-E07-51-f120-list-estimate-overview.md) **v1.2 §4.5.1**（`I-LISTOVW-STRICT-EQUALITY-BOUNDARY-01`）改寫 **AC-LIST-09** 為「**充分條件**（`excluded(dept-estimate) === excluded(list-estimate-overview)` ⟹ 嚴格相等；`unestimatedListCount = 0` 僅為其特例、非等價）＋ **測試層指示**（TC-184-07 於測試套件中**無條件**斷言嚴格相等，**不得**加降級旗標分支——測試環境下兩端排除集合恆相等，加分支會放棄含 AC-LIST-10 部分降級情境之驗證力道）＋ **生產環境已知殘留風險**（timeout 分歧窗口，非靜默錯誤，根因處置為提高 F088 物化覆蓋率而非讀取端加快取）」三段；新增「兩組關係不得混淆」對照表（**跨端點**月層級 vs 月層級＝嚴格相等／**同端點內**月層級 vs 逐日捨入值之和＝不得斷言相等）；`I-F120-03` / §11 TC-184-07 同步；**OQ-F120-A5 關閉**；§12 G-1 之容差備選方案標為作廢。AC / BR 總數不變（14 / 14） | Spec Writer Agent |
| 1.1 | 2026-08-20 | **OQ-F120-B1 已裁決（使用者 / team lead）：採 §12 G-1 首選主張，[F049](F049-stage0-daily-estimate.md) 月層級「本月全名單總量」改為 `Σ_L list_total[L]` 精確和**（落地於 [F049 v2.1](F049-stage0-daily-estimate.md) §16.5 / AC-DEPT-3 / BR-17 / §14.3 `orgMonthTotal` / §24 影響清單）。本檔據此收緊：AC-LIST-09 跨區塊斷言由「同源＋容差」改為「**嚴格相等**」並補「不得誤推為 Σ 各日顯示值」之界線；`I-F120-03` 同步擴為「同源＋顯示值嚴格相等」；§11 TC-184-07 斷言形式改嚴格相等；§12 G-1 標 ✅ 已裁決（保留原分析溯源，補記 prototype `30-stage0-estimate.html:517` 本即為精確和之查證）；§13.3 OQ-F120-B1 關閉。AC / BR 總數不變（14 / 14），演算法 / 契約 shape / 授權特例 / 術語規範均未變動。**併同納入 [AD-E07-51](../implementation-log/AD-E07-51-f120-list-estimate-overview.md) §4.5 / §4.3 之實作路徑**（F049 側新欄位 `orgMonthTotal`，值來自共用之 `resolveListTotals(ym, listNo?)`，`I-LISTOVW-SHARED-SOURCE-01` 使 `I-F120-03` 依建構成立）；**AC-LIST-09 之嚴格相等留豁免伏筆**（指向 AD-E07-51 §8 待補之「兩端點 fallback dry-run 逾時不一致」豁免條件，未寫成無條件嚴格相等）；**§13.1 OQ-F120-A1~A4 全數關閉**（AD-E07-51 §4 裁定，記錄結果供溯源）並新增追蹤項 **OQ-F120-A5**。<br>⚠️ **本列之「留豁免伏筆／未寫成無條件嚴格相等」一項已由 v1.2 推翻**——AD-E07-51 於 v1.2 §4.5.1 定案，結論為「**測試套件中無條件斷言嚴格相等**」，以 v1.2 列為準 | Spec Writer Agent |
| 1.0 | 2026-08-20 | 依已定案之 US-184 v1.1 建立。14 AC（AC-LIST-01~14，含 06a / 06b 細化）／14 BR／5 不變量（`I-F120-01`~`I-F120-05`）。三項人類裁決全數落規格。定義 `GROUP-RESOLVE` 分組判定演算法（權威）、`GROUP-ORDER` 排序規則、小計 / 總計 / 佔比公式、API 契約 shape 與**無 dept scope filter** 之授權特例。**不新增錯誤碼、不新增資料表欄位、無 migration**。§12 記錄 6 項 spec / schema 落差與修正主張（G-1 KPI 捨入落差為 TC-184-07 斷言形式之阻塞項）；§13 交付 4 項架構師 OQ、3 項 UI/UX OQ、1 項 team lead 拍板項 | Spec Writer Agent |
