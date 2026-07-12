# US-175：TIER_LEVEL 對應頁籤新增「預估各 TIER 分布」

> **Story ID**：US-175
> **Epic**：[E07 — 客戶名單分派](epic-brief.md)
> **模組**：M02 計分設定（Tab 5 — TIER_LEVEL 對應，擴充 US-075）
> **優先級**：Should Have（新增診斷型能力，非既有功能故障修復）
> **階段**：Phase 1（MVP）
> **預估點數**：5
> **版本**：v1（2026-07-11 — 新增；為 Tab 5 補上 Tab 4 已有之分布預覽能力）

---

## User Story

**As a** 業務主管（部長 / 處長，唯讀）
**I want** 在 Tab 5（TIER_LEVEL 對應）看到目前選中 CARD_TYPE 之對應規則下，各 TIER_LEVEL 的預估命中分布
**So that** 我能在儲存 TIER 對應設定前，及早發現對應規則是否造成案件過度集中於單一 TIER，或某些 TIER 幾乎沒有案件等異常狀況，避免月名單分派後才發現配置問題

---

## 背景說明

Tab 4（CARD_LEVEL 門檻）已有「預估各等級分佈」面板（US-074 AC-3，並由 US-174 升級為抽樣估算），讓業務主管在調整門檻時能即時看到影響。但 Tab 5（TIER_LEVEL 對應，US-075）目前**僅顯示對應規則清單本身（CARD_LEVEL → TIER_LEVEL 的表格）**，沒有對應的分布預覽，業務主管無法直觀判斷「這樣設定 TIER 對應後，各 TIER 大概會有多少案件」。

本 Story 為 Tab 5 補上一個對稱的「預估各 TIER 分布」面板，估算方法與 US-174 相同（共用 D1 抽樣估算邏輯），但依據對象改為**目前選中 CARD_TYPE 之 `ob_tier` 對應規則**（含 Standard／Fallback 兩種規則，見 US-075 背景說明）。

此為**全新 UI**，目前 `prototypes/28-scoring-config.html` 的 Tab 5（`panel-tier`）尚未描繪此面板；prototype 更新由 ui-ux-designer / spec-writer 於後續階段處理（D3），本 Story 僅定義行為契約與驗收標準。

---

## 驗收標準

### AC-1：依選中 CARD_TYPE 顯示各 TIER 之抽樣估算分布

- **Given** 業務主管已在 Tab 1 選中某 CARD_TYPE，並切換至 Tab 5（TIER_LEVEL 對應）
- **When** Tab 5 載入完成，且該 CARD_TYPE 於 `ob_tier` 已有至少 1 筆對應規則
- **Then** 顯示「預估各 TIER 分布」面板，內容為：依目前 `ob_tier` 對應規則（CARD_LEVEL → TIER_LEVEL），對 `ob_pool_data` 抽樣估算（沿用 D1：固定樣本 + 可重現種子 + 放大推算 + 估算標示 + 次秒級回應），列出各 TIER_LEVEL 的預估命中筆數與佔比
- **And** 若多個 CARD_LEVEL 對應至同一 TIER_LEVEL（例如 A、B 皆對應 T1），該 TIER 之分布數字須為兩者加總後的合計值

### AC-2：Fallback 規則情境下的分布呈現

- **Given** 選中 CARD_TYPE 於 `ob_tier` 為 Fallback 規則（card_level IS NULL，不分等級，全部對應同一 TIER_LEVEL，見 US-075 背景說明）
- **When** 面板顯示分布
- **Then** 顯示單一 TIER_LEVEL 佔 100%（即該 CARD_TYPE 於 Pool 中符合條件之全部案件皆歸屬同一 TIER）

### AC-3：呈現方式與 Tab 4 面板資訊架構一致（D3）

- **Given** 「預估各 TIER 分布」面板顯示
- **When** 業務主管比較 Tab 4「預估各等級分佈」與 Tab 5「預估各 TIER 分布」
- **Then** 兩者資訊架構一致（分類項目 + 人數 + 佔比 呈現邏輯相同），視覺樣式細節（顏色、圖示、排版）由 ui-ux-designer 依 Tab 4 既有樣式延伸設計，本 AC 不規定像素層級細節
- **And** `prototypes/28-scoring-config.html` Tab 5 於後續階段補上對應之 mock 呈現，作為 ui-ux-designer / spec-writer 的產出物（不在本 Story 交付範圍內）

### AC-4：對應規則不存在時的提示

- **Given** 選中 CARD_TYPE 於 `ob_tier` 尚無任何對應規則（Standard 與 Fallback 皆無）
- **When** Tab 5 載入「預估各 TIER 分布」面板
- **Then** 面板顯示提示訊息（如「尚未設定 TIER 對應規則，請先新增對應後查看分布預估」），不顯示空白或報錯

### AC-5：未選中 CARD_TYPE 時的提示

- **Given** Tab 1 尚未選中任何 CARD_TYPE
- **When** 業務主管切換至 Tab 5
- **Then** 沿用 US-075 AC-7 既有空狀態提示（「請先在 Tab 1 選擇計分卡類型以查看設定」），本面板亦不顯示

### AC-6：月名單分派執行中，預覽仍可讀取（唯讀不受寫入鎖影響）

- **Given** `assignment_run` 有 status IN ('pending', 'running') 的紀錄，Tab 5 編輯功能依 US-075 AC-6 被鎖定
- **When** 業務主管檢視「預估各 TIER 分布」面板
- **Then** 面板仍可正常顯示估算結果（分布預覽為唯讀查詢，不受編輯鎖定影響，行為對齊 US-174 的 CARD_LEVEL 預覽 GET 端點不受 `SCORING_VERSION_LOCKED` 限制之慣例）

### AC-7：估算結果標示為約值且效能達次秒級

- **Given** 面板顯示分布估算
- **When** 業務主管檢視或重複觸發（如切換 CARD_TYPE 後切回）
- **Then** 沿用 US-174 AC-2 / AC-3 之產品行為契約：結果標示為估算值、相同輸入下結果可重現、回應時間次秒級

---

## 技術備註

- **對應資料表**：`ob_tier`（US-075 §「技術備註」；複合 PK `(card_type, card_level)`）
- 估算演算法與 US-174 共用同一套抽樣機制（D1），差異僅在於分類依據由「草稿門檻等級」改為「現有 `ob_tier` 對應規則」；實作是否共用同一段抽樣程式碼由 system-architect 決定，本 Story 不規定
- API 端點為本 Story 新增能力（Tab 5 目前僅有 §5.1 GET 對應清單，無 preview 端點），端點路徑與 response schema 由 spec-writer / system-architect 設計，可參考 F055 §5.2 `GET .../card-levels/preview` 之型態
- RBAC 沿用 F056 §5.1 之 `DirectorOrSectionChiefGuard`（部長 / 處長 / Admin 皆可讀取），與既有 Tab 5 GET 端點權限模型一致，本 Story 不變更權限
- `prototypes/28-scoring-config.html` Tab 5（`panel-tier`，約 L437 起）目前僅有對應表格，尚無分布面板；此為 ui-ux-designer 後續交付項目（D3）

> **[產品決策 D3，team lead 已拍板]**：本面板為全新 UI，非既有 prototype 描繪內容；樣式比照既有「預估各等級分佈」面板，prototype 28 由 ui-ux-designer / spec-writer 後續更新。

---

## 測試案例

### TC-175-01：Standard 規則多對一合計

- **Given**：CARD_TYPE = 'H'；`ob_tier` 中 H 有 A→T1、B→T1、C→T2、D→T3
- **When**：業務主管切換至 Tab 5
- **Then**：分布面板顯示 T1（A+B 合計）、T2（C）、T3（D）三個 TIER，T1 數字為 A、B 兩級樣本估算加總

### TC-175-02：Fallback 規則單一 TIER 100%

- **Given**：CARD_TYPE = 'M3'；`ob_tier` 中 M3 為 Fallback（card_level IS NULL → T5）
- **When**：業務主管切換至 Tab 5
- **Then**：分布面板僅顯示 T5，佔比 100%

### TC-175-03：無對應規則時顯示提示

- **Given**：CARD_TYPE = 'S5'；`ob_tier` 中 S5 尚無任何對應列
- **When**：業務主管切換至 Tab 5
- **Then**：面板顯示「尚未設定 TIER 對應規則」提示，不顯示空白或錯誤

### TC-175-04：未選中 CARD_TYPE 提示

- **Given**：Tab 1 尚未選中任何 CARD_TYPE
- **When**：業務主管切換至 Tab 5
- **Then**：顯示既有空狀態提示，分布面板不出現

### TC-175-05：月名單分派執行中仍可讀取分布

- **Given**：`assignment_run` 有 status = 'running' 的紀錄
- **When**：業務主管檢視 Tab 5 分布面板
- **Then**：分布面板正常顯示估算結果；同時對應表格的編輯 / 新增 / 刪除按鈕依 US-075 AC-6 disabled

### TC-175-06：效能與可重現性

- **Given**：CARD_TYPE = 'H' 之對應規則不變
- **When**：重複兩次載入 Tab 5
- **Then**：兩次估算結果一致，且每次回應於 1 秒內完成

---

## 依賴關係

- **Blocked By**：US-075（Tab 5 TIER_LEVEL 對應表基礎功能與 Standard/Fallback 規則定義）
- **Blocks**：無
- **Related**：US-174（共用 D1 抽樣估算產品邏輯，CARD_LEVEL 分布面板之對照實作）

---

## 開放問題

- [ ] **面板放置位置**：Tab 5 對應表格與新分布面板的版面配置（表格上方/下方/並排）屬視覺設計範疇，由 ui-ux-designer 決定
- [ ] **Prototype 28 Tab 5 更新排程**：由 ui-ux-designer / spec-writer 於後續階段補上 mock，本 Story 交付前無需等待 prototype 完成

---

## Definition of Done

- [ ] 驗收標準全部通過
- [ ] Standard 規則多對一合計測試（AC-1 / TC-175-01）
- [ ] Fallback 規則 100% 呈現測試（AC-2 / TC-175-02）
- [ ] 無對應規則提示測試（AC-4 / TC-175-03）
- [ ] 未選中 CARD_TYPE 空狀態測試（AC-5 / TC-175-04）
- [ ] 月名單分派執行中唯讀可讀測試（AC-6 / TC-175-05）
- [ ] 估算標示 / 可重現性 / 效能測試（AC-7 / TC-175-06）
- [ ] 單元測試覆蓋率 ≥ 80%
- [ ] Code review 通過
- [ ] 文件已更新（F056 spec 補入 preview 端點規格；prototype 28 由 ui-ux-designer 後續更新）

---

## 相關文件

- **Epic Brief**：[E07 Epic Brief](epic-brief.md)
- **對應 Spec**：F056（編輯 TIER_LEVEL 對應表，本 Story 為其新增能力）
- **相關 Stories**：US-075（TIER_LEVEL 對應表基礎功能）、US-174（CARD_LEVEL 分布面板，共用抽樣估算邏輯）、US-093（Tab 1 CARD_TYPE 選中狀態來源）
- **Reference**：`prototypes/28-scoring-config.html`（Tab 4「預估各等級分佈」面板 L395-430 作為樣式參照；Tab 5 `panel-tier` 約 L437 起）
