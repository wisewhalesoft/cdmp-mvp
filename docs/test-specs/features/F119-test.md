---
type: test-design-feature
feature_id: F119
feature_name: 類別型篩選欄位新增文字比對運算子（包含 / 不包含 / 完全等於）
priority: P1
related_spec: /docs/specs/features/F119-categorical-text-match-operators.md
related_spec_parent: /docs/specs/features/F050-create-list-definition.md
related_architecture: /docs/specs/implementation-log/AD-E07-50-categorical-text-match-operators.md
spec_version: "1.1"
covers:
  - F119
  - US-183
date: 2026-08-18
last_updated: 2026-08-18
---

# F119：類別型篩選欄位新增文字比對運算子（包含 / 不包含 / 完全等於）— 測試設計

> **本輪範圍簡化（team lead 明確指示）**：僅產出 vitest/jest 單元 + 整合測試。**不含** Playwright
> e2e fidelity、**不含** Stryker mutation、**不含** dependency-cruiser metric gate、未呼叫
> `ring-setup` skill。§六 / §七（下方原屬 e2e/mutation/metric 章節）僅記錄「本輪未產出」與
> 建議下輪範圍，不臆造任何門檻或設定檔。
>
> **環境情報更正（2026-08-18，team lead）**：dev MSSQL（`172.20.202.212:1433`）**可連線**，初次
> 判斷「連不到」有誤，已由 team lead 實測更正——批次全套件跑時 `.mssql.spec.ts` 之浮動失敗為併跑
> 資源競爭（CPU/連線競爭致 testTimeout），非網路不可達。故本文件**新增一份真實 MSSQL 測試**
> （§一末 `f119-categorical-collation.mssql.spec.ts`，7 案例）覆蓋 SQLite 無法重現之 BR-8 大小寫/
> 全半形敏感度（`Chinese_Taiwan_Stroke_BIN` collation）；純函式斷言（BR-6/BR-7）維持不變——AD SA-2
> 裁定跳脫不依 dialect 分支，純函式證明力本就強於 DB 比對回傳列，非因連線問題而妥協。
>
> **盲眼聲明**：本文件與對應測試檔僅依據 F119 spec v1.1、AD-E07-50 v1.1、US-183 v1.3、
> `docs/ui-ux-design-overview.md` 附錄 C、`prototypes/27a/27b/27/30` 撰寫，**未**開啟以下生產碼：
> `stage1-query-composer.ts`、`stage1-customer-core-clause.ts`（及 -mssql）、
> `stage1-customer-financial-clause.ts`、`assignment-list.service.ts`、`condition-item.dto.ts`、
> `list-create-draft-page.tsx`、`list-edit-draft-page.tsx`、`list-definition-page.tsx`、
> `stage0-estimate-page.tsx`、`_components/ListDetailDrawer.tsx`、`_utils/labels.ts`、
> `_utils/condition-summary.ts`。允許讀取範圍：既有 `__tests__/*.spec.ts` / `*.test.tsx`
> （harness/mock/命名慣例）、entity 型別定義（`ob-list-definition.entity.ts` 等）。

---

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + [F119 spec](../../specs/features/F119-categorical-text-match-operators.md) + [AD-E07-50](../../specs/implementation-log/AD-E07-50-categorical-text-match-operators.md) §3/§7/§9 + [US-183](../../stories/epics/E07-app-customer-list-assignment/US-183-M01-categorical-text-match-operators.md) |
| QA / Tester | 本文件 + F119 spec §4/§10 + [error-handling.md#assignment-list-errors](../error-handling.md#assignment-list-errors) |

---

## 測試策略概覽

| 項目 | 說明 |
|---|---|
| 主要測試層 | 後端 Unit（SQLite in-memory，純函式 + 真實 SQL 執行雙軌）+ 後端 Integration（真實 `AssignmentListService` + in-memory better-sqlite3，`previewHitCount`/`createList` 黑箱）+ 前端 `_utils` 純函式單元 + 前端 Page/Component 整合（RTL） |
| 後端測試檔（stage1，SQL 語意層） | `apps/api/src/modules/assignment/stage1/__tests__/f119-categorical-operator-fragment.spec.ts`（新建，28 案例：`resolveCategoricalOperator`/`escapeLikeKeyword`/`buildCategoricalOperatorFragment` 結構契約 + BR-6 NULL 八格矩陣真實 SQL 執行 + AC-9 未跳脫必紅案例） |
| | `f119-customer-core-categorical-operator.spec.ts`（新建，8 案例：`buildCustomerCoreClause` 文字運算子 + `cpost_city` 衍生欄 + I-CATOP-NULL-MATRIX-01 靜態掃描） |
| | `f119-customer-financial-categorical-operator.spec.ts`（新建，6 案例：`buildCustomerFinancialClause` 對等覆蓋） |
| | `f119-categorical-collation.mssql.spec.ts`（新建，7 案例，**真實 MSSQL**：BR-8 大小寫/全半形敏感度，2026-08-18 依 team lead 環境情報回饋補上，見 §一末說明） |
| 後端測試檔（assignment-list，黑箱行為 + 驗證層） | `apps/api/src/modules/assignment-list/__tests__/f119-preview-hit-count-text-operators.spec.ts`（新建，7 案例：`previewHitCount` 對真實 seed 資料之 contains/not_contains/equals/escape/零可選值/caseyear 驗證黑箱） |
| | `f119-condition-validation.spec.ts`（新建，13 案例：`createList` 對 AC-1/AC-6/AC-8/BR-2/BR-3/caseyear 之驗證黑箱） |
| | `f119-signature-backcompat-duplicate.spec.ts`（新建，10 案例：`normalizeConditionPayload` 簽章擴充 T-11/T-12 + AC-16 重複判定 T-13~T-16 黑箱） |
| 前端測試檔（`_utils` 純函式） | `apps/web/src/pages/assignment/_utils/__tests__/f119-labels.test.ts`（新建，6 案例：`OPERATOR_LABEL`/`operatorLabel()`） |
| | `f119-condition-summary.test.ts`（新建，7 案例：`formatConditionSummary()`，採 AC-15 例句而非 AD §3.6 樣板，見 C-Q1） |
| 前端測試檔（Page 整合，追加既有檔案） | `list-create-draft-page.test.tsx` 追加 `describe('F119 — ...')`（12 案例：AC-1/AC-5（含 C-6 文字↔文字不清除）/AC-8/AC-11/AC-12/caseyear/AC-17） |
| | `list-edit-draft-page.test.tsx` 追加 `describe('F119 — ...')`（4 案例：AC-18 一致性抽樣，含 2026-08-18 dispute 裁決後強化之確認 modal 案例，見 §五末） |
| | `list-kanban-page.test.tsx` 追加 `describe('F119 — ...')`（3 案例：AC-15/AC-17 Kanban chip + Detail Drawer） |
| | `stage0-estimate-page.test.tsx` 追加 `describe('F119 — ...')`（4 案例：AC-13/BR-13） |
| Mutation / Metric | **本輪未產出**（team lead 明確排除範圍）。建議下輪若納入，Stryker mutate 範圍應為 `buildCategoricalOperatorFragment`/`escapeLikeKeyword`（單一 SQL 落點，投資報酬率最高） |
| E2E Fidelity（Playwright） | **本輪未產出**（team lead 明確排除範圍） |

---

## 一、後端 — SQL 語意層（stage1，四運算子 × 三來源 × NULL 矩陣）

### `f119-categorical-operator-fragment.spec.ts`

> 撰寫依據：AD-E07-50 §3.2/§3.3 之函式契約（`resolveCategoricalOperator`/`escapeLikeKeyword`/
> `buildCategoricalOperatorFragment`，含完整程式碼片段，屬本 feature 架構決策文件而非生產碼）。
> 以 better-sqlite3 in-memory 執行回傳之 fragment，驗證**真實列選取結果**而非僅字串形狀。

| 群組 | 案例 | 對應 |
|---|---|---|
| `resolveCategoricalOperator` | FRAG-RESOLVE-001~003：undefined/null/空字串/合法四值/非法值 fallback | BR-11 / I-CATOP-OPERATOR-FALLBACK-01 |
| `escapeLikeKeyword` | FRAG-ESC-001~006：`%` `_` `[` `]` `^` `\` 逐一跳脫 + 混合字元 | BR-7 / I-CATOP-ESCAPE-SINGLE-01 |
| `buildCategoricalOperatorFragment` 結構契約 | FRAG-SHAPE-001~007：空 values、IN、equals（無 LIKE）、contains（LIKE+ESCAPE）、not_contains 兩種 nullKeptOnNotContains、對 contains/equals 無影響 | AD §3.3 |
| **BR-6 NULL 八格矩陣（★核心）** | MATRIX-001~008：四運算子 ×（ob_pool_data / 客戶來源），真實 SQL 執行逐格斷言 | BR-6 / I-CATOP-NULL-MATRIX-01 / AC-2/AC-3/AC-4 |
| AC-9 未跳脫必紅 | LITERAL-001~004：關鍵字 `100%` 不得誤命中 `1000元`；`A_B` 不得誤命中 `AXB`；equals/not_contains 亦須遵守 | AC-9 / BR-7 |

### `f119-customer-core-categorical-operator.spec.ts` / `f119-customer-financial-categorical-operator.spec.ts`

| 案例 | 對應 |
|---|---|
| CC/CF-OP-001~002：contains（LIKE+ESCAPE）/ equals（`=`，無 LIKE） | AC-10 / BR-5 |
| CC/CF-OP-003（★核心）：not_contains 不得含 `IS NULL`/`COALESCE`（客戶來源七格之一） | I-CATOP-NULL-MATRIX-01 |
| CC/CF-OP-004：operator 缺漏（視為 in）與現況 IN 語意逐字相同 | AC-17 回歸 |
| CC-OP-005：`cpost_city` 衍生欄（`LEFT(cc.cpost_city,3)`）套用文字運算子 | AD assumption A-3 |
| STATIC-001/002：原始碼不含 `COALESCE(cc/cf.*)` + 須 import `buildCategoricalOperatorFragment` | I-CC/CF-NULL-EXCLUDE-01、I-CATOP-SINGLE-FRAGMENT-01 |

> **範圍說明**：`I-CATOP-CASEYEAR-EXCLUDE-01` 之組合層 defense-in-depth（composer 收到違規條件時不
> 得建構 fragment）**未**另立測試檔——實測發現該情境於實作前即已「trivially green」（因既有
> `values`-based 分支對缺漏 `values` 之條件本就 no-op 產生 `EMPTY_VALUES` 警告 + 不產生 fragment，
> 與「正確實作後之預期結果」巧合相同，無法做為紅燈證據，屬 tautological pass）。該不變式之**權威
> 執行點**依其文字本身即明定於**驗證層**（"此限制實作於驗證層...而非 SQL 建構層"），已由
> `f119-condition-validation.spec.ts` CASEYEAR-CREATE-001 與
> `f119-preview-hit-count-text-operators.spec.ts` CASEYEAR-PREVIEW-001 真實覆蓋（見 §二）。

### `f119-categorical-collation.mssql.spec.ts`（真實 MSSQL，2026-08-18 依 team lead 環境情報回饋補上）

> team lead 實測確認本機環境**可連線**至 dev MSSQL（`172.20.202.212:1433`，`Test-NetConnection`
> 為 True），先前一度誤判為「連不到」，經 `preview-hit-count-customer-core.mssql.spec.ts` 單跑
> 4/4 綠燈於 5.53 秒完成而更正——批次全套件跑時的 `.mssql.spec.ts` 失敗為**併跑資源競爭**
> （CPU/連線競爭致 testTimeout），非網路不可達，此為專案既有形態（見專案記憶
> `feedback_pg_spec_parallel_timeout`）。純函式斷言（`f119-categorical-operator-fragment.spec.ts`
> 之 BR-6/BR-7）仍是**較強**的證據形式（AD SA-2 裁定跳脫不依 dialect 分支，等價之證明即「兩邊呼叫
> 同一 helper」，非 DB 比對回傳列），本檔補的是**唯一 SQLite 無法重現**之案例——BR-8 大小寫 /
> 全半形敏感度（`Chinese_Taiwan_Stroke_BIN` collation），此為 T-7/T-18（原 F119 spec §10 已列、
> 本輪初次撰寫時判斷屬 e2e/live 範圍而未產出，經 team lead 提醒真實 MSSQL 可用後補上）。

| 案例 | 對應 | 說明 |
|---|---|---|
| 環境可達性 | — | `mssqlPortReachable` 探測，不可達則後續案例 `ctx.skip()` |
| COLLATION-001 | BR-8 前提查證 | `ob_pool_data.spec_name` 之 `INFORMATION_SCHEMA.COLUMNS` 查詢，確認 collation 確為 `Chinese_Taiwan_Stroke_BIN`（與 F119 函式實作與否無關，屬環境事實查證，非行為紅燈） |
| T-7（★核心） | BR-8 大小寫敏感 | contains "ABC" 不命中值 "abc"、須命中值 "ABC" |
| T-18a/b | BR-8 大小寫敏感 | equals / not_contains 之大小寫敏感對稱驗證 |
| T-18c | BR-8 全形/半形敏感 | 半形關鍵字 "A" 不命中全形值 "Ａ"（U+FF21） |
| T-18d（正控制組） | — | 中文字面值恰等時仍命中，證明查詢管道本身未整體失效 |

**技術手法**：呼叫（尚未存在之）`buildCategoricalOperatorFragment()` 取得 fragment/params，將
`colExpr` 傳入字面值 `CAST(N'...' AS nvarchar(100))`（把「待測欄位值」直接內嵌為 SQL 字面值），
執行 `SELECT CASE WHEN <fragment> THEN 1 ELSE 0 END`——**不查詢、不寫入 `ob_pool_data` 或任何既有
表**，比照既有 `preview-hit-count-customer-core.mssql.spec.ts` 之純讀取慣例（`synchronize: false`）。
除 `環境可達性`/`COLLATION-001` 兩案例外，其餘 5 案例因函式未匯出而 TypeError，紅燈原因正確
（與 SQLite 版同理）；一旦實作落地，紅燈轉綠同時證明「函式邏輯正確」與「真實 MSSQL collation 下
行為符合 BR-8」。已依專案慣例加 `vi.setConfig({ testTimeout: 60000 })` 避免併跑競爭偽紅。

---

## 二、後端 — 黑箱行為 + 驗證層（assignment-list）

### `f119-preview-hit-count-text-operators.spec.ts`

> `previewHitCount` 之真實 SQLite 黑箱驗證：呼叫端不知道內部如何實作，僅驗證篩選結果數字。

| 案例 | 對應 |
|---|---|
| T-1：contains，NULL 排除 | AC-2 |
| T-2（★核心）：not_contains，NULL 保留（不對稱） | AC-3 |
| T-5：equals，逐字元相同 | AC-4 |
| T-6（★核心，未跳脫必紅）：`100%` 不誤命中 `1000元的商品` | AC-9 |
| T-6b：`A_B` 不誤命中 `AXB` | AC-9 |
| T-29：`spec_name` 零可選值仍正確估算 | AC-11 / BR-14 |
| CASEYEAR-PREVIEW-001：caseyear + 文字運算子 → 422 | I-CATOP-CASEYEAR-EXCLUDE-01 |

### `f119-condition-validation.spec.ts`

| 案例 | 對應 |
|---|---|
| T-10a/b：numeric/date 帶 operator/keyword → 422 | AC-1 |
| T-9a~c（★核心）：互斥違規（文字+values、in+keyword、缺漏+keyword）→ 422 含 columnName | AC-6 / BR-3 |
| T-8a~d：keyword 缺漏/純半形空白/純全形空白 U+3000/超長 101 → 422 | AC-8 / BR-2 |
| T-8e（正控制組）：長度恰 100 → 合法 | AC-8 邊界 |
| T-19（★核心）：前後空白（半形+全形+Tab）trim 後落庫，內部空白保留 | BR-2 |
| CASEYEAR-CREATE-001：caseyear + 文字運算子 → 422 | I-CATOP-CASEYEAR-EXCLUDE-01 |
| POSITIVE-001（正控制組）：合法 contains 條件正常建立 | 回歸基準 |

### `f119-signature-backcompat-duplicate.spec.ts`

| 案例 | 對應 |
|---|---|
| T-12（★核心）：顯式 `operator:'in'` 與缺漏 → 簽章逐字相同 | AC-17 / I-CATOP-SIG-BACKCOMPAT-01 |
| T-11（★核心）：既有無 operator payload 簽章符合 BR-9 公式 | AC-17 硬性回歸 |
| SIG-CATOP-001~004：`:catop:` 新區段格式、大小寫敏感、in 單值 vs equals 不同簽章 | BR-9 |
| T-13（★核心）：contains vs not_contains（其餘同）→ 不觸發 422 | AC-16 |
| T-14：同運算子同關鍵字 → 仍觸發 422 | AC-16（重複攔截不得失效） |
| T-15：in 單值 vs equals 同值 → 判為不同 | AC-16 / AC-4 |
| T-16：`ABC` vs `abc` → 判為不同 | AC-16 / BR-8 |

> **弱通過（weak-pass）揭露與說明**：T-13/T-15/T-16（斷言「不觸發 422」）於實作前**已為綠燈**，
> 因目前僅帶 `keyword`（無 `values`）之 categorical 條件於現行 `normalizeConditionPayload`
> 產生空簽章、空簽章依既有規則「永不衝突」——此為巧合式綠燈，非證明運算子已被正確區分。
> **真正的紅燈證據**是配對的 T-14（斷言「同運算子同關鍵字仍須觸發 422」，實作前必為紅，因
> keyword-based 簽章尚未產生），T-13/15/16 與 T-14 成對閱讀方能證明 AC-16 之完整雙向行為
> （不同判不同、相同判相同）。此手法對齊本 repo test-generator agent memory
> `weak-pass-confound-detection` 之既定作法。

---

## 三、前端 — `_utils` 純函式

### `f119-labels.test.ts`

| 案例 | 對應 |
|---|---|
| LABEL-001：`OPERATOR_LABEL` 四值逐字（IN/包含/不包含/完全等於） | BR-10 |
| LABEL-002~004：`operatorLabel()` 各運算子輸出 | BR-10 |
| LABEL-005（★核心）：`operatorLabel(undefined)` === "IN" | BR-11 前端 fallback |
| LABEL-006：顯式 `in` 與缺漏輸出逐字相同 | AC-17 |

### `f119-condition-summary.test.ts`

> **C-Q1 裁定採用**：ui-ux-designer 已於附錄 C C.7 記錄 AD §3.6 樣板字串（`「${欄位}」${標籤}「${keyword}」`）
> 與 AC-15 例句（`${欄位} ${標籤}「${keyword}」`，欄位名不加引號）不一致，並裁定**採 AC-15 例句**
> （業務契約優先）。本測試檔依此裁定撰寫，與 AD 樣板字串故意不同，**非誤植**。

| 案例 | 對應 |
|---|---|
| SUMMARY-001（★核心，AC-15 例句本身）：`主約專案名稱 不包含「勁便利」` | AC-15 |
| SUMMARY-002：`職業別 完全等於「軍公教」` | AC-15 |
| SUMMARY-003/004：contains 格式 + 關鍵字內部空白保留 | AC-15 / BR-2 |
| SUMMARY-005：in 格式 `{欄位}：{值1}、{值2}` | BR-10 |
| SUMMARY-006（★核心）：空 values → `（未選擇任何值）`，非空白非 `IN []` | AC-15 |
| SUMMARY-007（★核心）：顯式 in 與缺漏 operator 輸出逐字相同 | AC-17 |

---

## 四、前端 — Page 整合（RTL，追加既有測試檔）

### `list-create-draft-page.test.tsx` — `describe('F119 — 類別型條件文字比對運算子（建立草稿頁）')`

| 案例 | 對應 |
|---|---|
| F119-FE-001/001b：四選項預設 in；IN 面板顯示、文字面板不存在 | AC-1 |
| F119-FE-002（★核心）：切為 contains → IN 面板消失、文字面板出現、關鍵字為空 | AC-5 |
| F119-FE-002b（★核心，附錄 C C-6）：文字運算子彼此切換（contains → not_contains）→ 關鍵字不清除 | AC-5 |
| F119-FE-003：切回 in → 文字面板消失、IN 面板重現 | AC-5 |
| F119-FE-004（★核心）：關鍵字留空儲存 → 就地錯誤，createList 不被呼叫 | AC-8 |
| F119-FE-005/006：效能提示文案逐字對照 + 切回 in 後消失 | AC-12 |
| F119-FE-007（★核心）：spec_name（零可選值）出現於下拉，可用文字運算子完成設定 | AC-11 |
| F119-FE-008：spec_name IN 形態顯示零可選值指引 | AC-11 / BR-14 |
| F119-FE-009（★核心）：caseyear 三個文字選項 disabled | I-CATOP-CASEYEAR-EXCLUDE-01 |
| F119-FE-010：未變更之 IN 條件 payload 不含 operator key | AC-17 |

### `list-edit-draft-page.test.tsx` — `describe('F119 — 類別型條件文字比對運算子（編輯草稿頁，AC-18 一致性）')`

| 案例 | 對應 |
|---|---|
| F119-EDIT-001（★核心）：載入既有 not_contains 條件 → 運算子與關鍵字正確帶入 | AC-18 |
| F119-EDIT-002（★核心，2026-08-18 dispute 裁決強化）：載入之關鍵字非空 → 切回 IN 須先彈出二次確認 modal（附錄 C C-3~C-5），未確認前面板不得切換、損失清單含關鍵字內容，確認後才切換 | AC-5 / AC-18 |
| F119-EDIT-002b（2026-08-18 新增，對照組）：剛加入條件兩側皆空 → 不彈窗，獨立路徑 | AC-5 / AC-18 |
| F119-EDIT-003：caseyear 排除與建立頁一致 | AC-18 |

### `list-kanban-page.test.tsx` — `describe('F119 — 條件顯示（Kanban chip + Detail Drawer，AC-15/BR-10/AC-17）')`

| 案例 | 對應 |
|---|---|
| F119-KANBAN-001（★核心，AC-15 例句本身）：Kanban 卡片顯示文字運算子條件 | AC-15 |
| F119-KANBAN-002：顯式 in 與缺漏 operator（同 values）→ 兩卡逐字相同（正控制組，見下方說明） | AC-17 |
| F119-DRAWER-001（★核心）：Detail Drawer 條件頁籤呈現，非空白非 `IN []` | AC-15 |

> F119-KANBAN-002 於實作前**已為綠燈**——`in`/缺漏 operator 路徑本屬既有未變更行為
> （AC-1「未特別選擇時，維持現況行為」），此為**合法的正控制組（regression guard）**，
> 非弱斷言：其職責是確保 F119 上線後此路徑**仍然**成立，而非證明新功能已實作。

### `stage0-estimate-page.test.tsx` — `describe('F119 — Stage0 部門估算頁 STAGE0_LIST_ESTIMATE_PARTIAL 渲染（AC-13/BR-13）')`

| 案例 | 對應 |
|---|---|
| F119-STAGE0-001（★核心）：2 筆 warning → banner 逐筆可辨識，訊息符合 error-handling.md v1.20 契約 | AC-13 |
| F119-STAGE0-002（正控制組）：warnings 為空 → banner/KPI 徽章皆不渲染 | 回歸基準 |
| F119-STAGE0-003：warning 不阻擋其餘內容渲染 | BR-13 |
| F119-STAGE0-004：單筆 warning → 仍可辨識該 listNo | AC-13 |

---

## 五、紅燈驗證（已實際執行）

> 全數新增/追加測試已於本輪實際以 `vitest run` 執行確認。

**後端**（`npm run test --workspace=apps/api`，逐檔 + `apps/assignment-list`/`apps/assignment/stage1` 整目錄跑過）：
- `f119-categorical-operator-fragment.spec.ts`：28 red / 0 green（`resolveCategoricalOperator is not a function` / `escapeLikeKeyword is not a function` / `buildCategoricalOperatorFragment is not a function`——三個新函式尚未匯出，紅燈原因正確）
- `f119-customer-core-categorical-operator.spec.ts`：4 red / 4 green（綠燈者為 CC-OP-004/006/STATIC-001，皆為既有行為之回歸錨點或與 CC-OP-003 成對之弱斷言，見上方說明）
- `f119-customer-financial-categorical-operator.spec.ts`：3 red / 3 green（同上模式）
- `f119-categorical-collation.mssql.spec.ts`（真實 MSSQL）：5 red / 2 green（`環境可達性`/`COLLATION-001` 為環境事實查證非行為紅燈；其餘 5 案例因函式未匯出 TypeError，紅燈原因正確；已確認 dev MSSQL 可連線、單檔執行 1.33 秒完成，非併跑競爭偽紅）
- `f119-preview-hit-count-text-operators.spec.ts`：7 red / 0 green
- `f119-condition-validation.spec.ts`：11 red / 2 green（T-8e 正控制組 + POSITIVE-001 正控制組，皆設計為應保持綠燈）
- `f119-signature-backcompat-duplicate.spec.ts`：9 red / 4 green（T-13/15/16 弱通過 + 見上方說明段落，T-14 為配對之紅燈證據）

**前端**（`npm run test --workspace=apps/web`）：
- `f119-labels.test.ts`：6 red（`operatorLabel is not a function`）
- `f119-condition-summary.test.ts`：模組解析失敗（`../condition-summary` 檔案不存在，7 個案例皆無法收集，等同全紅——原因正確：新檔案尚未建立）
- `list-create-draft-page.test.tsx` 追加區塊：12 red / 0 green（實作完成後重跑：F119-FE-010 修正 testid 後轉綠，其餘全綠，見下方 dispute 記錄）
- `list-edit-draft-page.test.tsx` 追加區塊：4 red / 0 green（實作完成後重跑：F119-EDIT-002 因缺二次確認 modal 為真紅，F119-EDIT-002b 轉綠，其餘見下方 dispute 記錄）
- `list-kanban-page.test.tsx` 追加區塊：2 red / 1 green（F119-KANBAN-002 正控制組）
- `stage0-estimate-page.test.tsx` 追加區塊：3 red / 1 green（F119-STAGE0-002 正控制組）

**回歸確認**：以上 6 個前端檔案之全部既有測試（共 815 個既有通過案例，涵蓋整個
`apps/web/src/pages/assignment` 目錄 869 個測試中扣除本輪新增與既有 skip）與後端既有
`assignment-list`/`stage1` 目錄之既有測試套件於本輪追加後**皆未被破壞**（逐檔執行 + 全目錄批次
執行雙重確認，無任何非 F119 相關測試由綠轉紅；`assignment-list`+`stage1` 排除 `.mssql.spec.ts`
之全量批次執行為 36 既有檔全綠 / 6 新檔紅，零回歸）。

**型別檢查**（`tsc --noEmit -p tsconfig.json`，因 `tsconfig.build.json` 排除 `*.spec.ts`
不適用於驗證測試檔本身）：僅出現「匯入尚未存在之生產碼匯出成員」之預期錯誤
（`resolveCategoricalOperator`/`escapeLikeKeyword`/`buildCategoricalOperatorFragment`/
`OPERATOR_LABEL`/`operatorLabel`/`../condition-summary` 模組），**無**任何測試檔自身邏輯造成
之型別錯誤。

### 團隊模式測試爭議裁決（2026-08-18，tdd-implementation 提報）

後端 7 檔 79 案例、前端 utils/kanban/stage0 全綠後，implementer 提報兩件測試側爭議，裁決如下（完整
技術脈絡見 `risks-and-gaps.md` R-F119-08）：

1. **F119-FE-010 testid 誤植（採納，判定測試自身缺陷）**：`value-checkbox-0-0` 與該 describe 之
   mock（`prod_kind` optionValue `'01'`）不符，本檔既有慣例（L372/424/577）皆證實應為
   `value-checkbox-0-01`。已修正兩處，AC-17 斷言本體（`'operator' in cond === false`）未改動。
2. **F119-EDIT-002 遺漏 prototype 確認 modal 行為（採納，判定測試遺漏真實行為，非設計偏離）**：
   重讀 `prototypes/27a-list-create-draft.html` 之 `setCondOperator()` 原始碼確認——跨形態切換
   （IN↔文字）且另一側「有內容」時，`crossForm && willLose` 為真，須先呼叫
   `openOpSwitchConfirm()` 顯示二次確認 modal（附錄 C C-3~C-5），並非立即切換。原測試（載入
   `not_contains` + 非空關鍵字 `勁便利` 之條件，直接切至 `in` 並斷言面板立即切換）與此不符。
   採 implementer 建議之選項 (b)：F119-EDIT-002 改為斷言「未確認前面板不得切換、
   `operator-switch-loss` 內容含關鍵字、確認後才切換」；新增 F119-EDIT-002b 覆蓋「剛加入條件
   兩側皆空 → 不彈窗」對照組（採獨立路徑：實際新增一個 `prod_kind` 條件，而非依賴 EDIT-002 之
   確認流程清空狀態，避免測試間依賴）。
   - 裁決後重跑：F119-EDIT-002 為真紅（implementer 目前暫以「立即切換、不確認」佔位，待補二次
     確認 modal）；F119-EDIT-002b 為真綠（該路徑 implementer 已正確實作）。

---

## 六、E2E Fidelity（Playwright）—— 本輪未產出

依 team lead 指示，本輪排除。若後續納入，建議對照 `prototypes/27a/27b/27/30` 之
`data-testid` 掛點（已於附錄 C 逐一列出）直接撰寫，資料策略比照既有 `fidelity-f117-*`/
`fidelity-f118-*` 之 `page.route()` 攔截慣例。

## 七、Mutation / Metric Gate —— 本輪未產出

依 team lead 指示，本輪排除。若後續納入，建議：
- Stryker `mutate` 範圍鎖定 `buildCategoricalOperatorFragment` + `escapeLikeKeyword`
  （單一 SQL 落點，BR-4 之結構性保證使此處變異覆蓋率即可代表全部四個呼叫端）
- Coverage gate 鎖定 `stage1-query-composer.ts`（新增部分）+ `assignment-list.service.ts`
  （`normalizeConditionPayload`/驗證層新增之第 4 步）
- dependency-cruiser：F119 未新增模組邊界，沿用既有設定即可，無需新規則

---

## 對應總表（AC → 測試場景）

| AC | 測試場景 |
|---|---|
| AC-1 | FRAG-SHAPE-002, F119-FE-001/001b, T-10a/b |
| AC-2 | MATRIX-002/006, T-1 |
| AC-3（★核心） | MATRIX-003/007, T-2 |
| AC-4 | MATRIX-004/008, T-5, SIG-CATOP-004 |
| AC-5（★核心） | F119-FE-002/002b/003, F119-EDIT-002/002b |
| AC-6（★核心） | T-9a~c |
| AC-7 | （單一關鍵字為 schema 型別本身之結構保證，見 F119 §5.1 `keyword: string`；無獨立可測負向案例，已記錄） |
| AC-8（★核心） | T-8a~e, F119-FE-004 |
| AC-9（★核心） | LITERAL-001~004, T-6/T-6b |
| AC-10 | CC/CF-OP-001~002 |
| AC-11（★核心） | T-29, F119-FE-007/008 |
| AC-12 | F119-FE-005/006 |
| AC-13（★核心） | F119-STAGE0-001~004 |
| AC-14 | （五路徑一致性之完整覆蓋需 MSSQL live 環境逐路徑驗證，超出本輪 SQLite unit/integration 範圍；BR-4/BR-5 之「單一落點」結構性保證已由 FRAG-SHAPE 系列 + CC/CF-OP-STATIC 系列間接佐證「四個呼叫端皆呼叫同一函式」，完整逐路徑數字一致性建議留待 `.mssql.spec.ts` 或下輪 e2e 補強，見 risks-and-gaps） |
| AC-15（★核心） | SUMMARY-001/002/006, F119-KANBAN-001, F119-DRAWER-001 |
| AC-16 | T-13~T-16 |
| AC-17（★核心） | LABEL-005/006, SUMMARY-007, T-11/T-12, F119-FE-010, F119-KANBAN-002 |
| AC-18 | F119-EDIT-001~003（含 002b） |
| I-CATOP-CASEYEAR-EXCLUDE-01 | CASEYEAR-CREATE-001, CASEYEAR-PREVIEW-001, F119-FE-009, F119-EDIT-003 |
