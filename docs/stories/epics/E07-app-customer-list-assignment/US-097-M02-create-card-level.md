# US-097：新增 CARD_LEVEL 等級

> **Story ID**：US-097
> **Epic**：[E07 — 客戶名單分派](epic-brief.md)
> **模組**：M02 計分設定（Tab 4 — CARD_LEVEL 門檻）
> **優先級**：Must Have
> **階段**：Phase 1（MVP）
> **預估點數**：3

---

## User Story

**As a** 業務主管
**I want** 在選定計分卡類型（CARD_TYPE）的 Tab 4 中，新增一筆 CARD_LEVEL 等級（代碼 + 分數區間）
**So that** 可因應業務需求彈性擴充等級結構，而無需刪除重建整個 CARD_TYPE

---

## 背景說明

F055 spec（v1.4）的 Tab 4 僅提供 GET / PUT / DELETE，缺少新增等級的 POST 資源。Prototype 28 的 Tab 4 empty state 顯示「請點擊『+ 新增等級』開始」，但按鈕本身不存在。本 Story 補足此缺口，讓業務主管能夠從零開始建立等級結構，或在既有等級外追加新等級代碼，而不需借助 IT 介入。

本 Story 完成後，F055 spec 需由 spec-writer 補充 POST endpoint（`POST /api/v1/assignment/scoring/card-levels`）及對應 AC / BR。

---

## 驗收標準

### AC-1：「+ 新增等級」按鈕與表單入口

- Tab 4 顯示「+ 新增等級」按鈕（無論目前等級列表是否為空）
- 點擊按鈕後開啟新增表單（Modal 或 inline row），欄位包含：等級代碼（`cardLevel`）、分數下限（`scoreS`）、分數上限（`scoreE`）
- 月跑執行中（BR-3）按鈕 disabled，hover 顯示鎖定提示

### AC-2：新增成功並顯示於列表

- 填入資料送出後，新等級立即出現於 Tab 4 等級列表，可繼續使用既有 PUT / DELETE 操作
- 儲存成功後顯示成功提示
- 新增動作寫入 `assignment_audit_log`（`action = 'CREATE'`、`entity_type = 'ob_levelcard_level'`、`after_value` 含新等級的 `cardLevel` / `scoreS` / `scoreE`）

### AC-3：重疊驗證（允許 gap，不要求連續）

- 新等級的分數區間（`scoreS` ~ `scoreE`）不得與同一 CARD_TYPE 既有任何等級的區間重疊
- 驗證僅檢查重疊，**允許 gap**（相鄰等級之間不強制連續，不自動 re-balance 既有列）
- 若重疊，顯示錯誤提示並阻止送出

### AC-4：月跑鎖（BR-3）與 CARD_TYPE 範圍鎖（BR-7）

- `assignment_run` 有 status IN ('pending', 'running') 時，新增按鈕 disabled，API 回 409 `SCORING_VERSION_LOCKED`
- 新增操作的 CARD_TYPE 固定為 Tab 1 選中之 CARD_TYPE，後端驗證該 `cardType` 對應 `ob_card_type.status = 'active'`，否則回 404 `CARD_TYPE_NOT_FOUND`

### AC-5：Tab 4 空狀態的進入點

- 當選中 CARD_TYPE 尚無任何等級（`ob_levelcard_level` 中無對應紀錄）時，Tab 4 顯示 prototype empty state 文字（「請點擊『+ 新增等級』開始」）
- 空狀態下「+ 新增等級」按鈕仍可用（非 disabled）

---

## 已知約束

| 約束 | 說明 |
|------|------|
| BR-1 | 僅驗證區間重疊；允許 gap（不強制 contiguous；不自動 re-balance 既有列）— 用戶決策 Q2 |
| BR-3 | 月跑鎖：月跑執行中禁止新增 |
| BR-7 | CARD_TYPE 範圍鎖：操作範圍限定於 Tab 1 當前選中之 `ob_card_type.status = 'active'` CARD_TYPE |

---

## Out of Scope

- 自動 re-balance：新增後不重新排序或調整既有等級的 `scoreS` / `scoreE`
- 跨列同步：新增一筆不觸發其他等級的任何異動
- F056 cascade 連動：新增 CARD_LEVEL 後不自動在 `ob_tier` 建立對應的 TIER_LEVEL 對應列
- 等級代碼格式驗證（`cardLevel` 合法值由 spec-writer 於 F055 POST endpoint AC 中定義）

---

## 技術備註

- 寫入資料表：`ob_levelcard_level`（AppDB），複合 PK：`(card_type, card_version, card_level)`
- `card_version` 應沿用 Tab 1 選中 CARD_TYPE 之 active 版本（`ob_levelcard_version.status = 'active'`），與 US-074 GET / PUT 行為一致
- Prototype 參考：prototype 28（`/prototypes/28-scoring-config.html`）Tab 4 — empty state 文字 + 「+ 新增等級」按鈕位置

---

## 測試案例

### TC-097-01：空狀態下新增第一筆等級

- **Given**：Tab 1 選中 'H'；`ob_levelcard_level` 中 H 無任何等級
- **When**：業務主管點擊「+ 新增等級」，填入 `cardLevel = 'A'`、`scoreS = 80`、`scoreE = 999`，送出
- **Then**：等級 A 出現於列表；`ob_levelcard_level` 新增一筆 `card_type='H', card_level='A', score_s=80, score_e=999`；稽核日誌寫入 CREATE

### TC-097-02：新增等級區間不重疊（允許 gap）

- **Given**：Tab 1 選中 'H'；已有 A（80~999）；業務主管新增 C（0~50）（與 A 之間有 gap 51~79）
- **When**：送出
- **Then**：新增成功（gap 不阻擋）；列表顯示 A 與 C 兩列

### TC-097-03：新增等級區間重疊驗證

- **Given**：Tab 1 選中 'H'；已有 A（80~999）；業務主管嘗試新增 B（`scoreS=85`，落入 A 的 80~999 區間）
- **When**：送出
- **Then**：顯示重疊錯誤提示，不允許新增

### TC-097-04：月跑執行中按鈕 disabled

- **Given**：`assignment_run` 有 status = 'running' 的紀錄
- **When**：業務主管查看 Tab 4
- **Then**：「+ 新增等級」按鈕 disabled，hover 顯示鎖定提示

### TC-097-05：新增後可繼續使用 PUT / DELETE

- **Given**：TC-097-01 完成後，等級 A 已存在
- **When**：業務主管點擊 A 的「編輯」並修改 `scoreE = 998`
- **Then**：修改成功（走 US-074 PUT 流程，無衝突）

---

## 依賴關係

- **Blocked By**：US-074（Tab 4 等級列表框架、月跑鎖邏輯）、US-093（F069 Tab 1 selectedCardType 狀態）
- **Blocks**：無直接下游 Story（新增等級後可銜接 US-075 TIER_LEVEL 對應設定，但非強依賴）

---

## 待解決問題

- [ ] **OQ-097-1**：`cardLevel` 的合法值格式（大寫英文單字元？長度限制？）— 由 spec-writer 於 F055 POST endpoint AC 中定義
- [ ] **OQ-097-2**：同一 CARD_TYPE 新增的等級代碼是否可與已被刪除過的代碼重複？（硬刪除後 PK 釋放，理論上可，但需 spec 明確）

---

## Definition of Done

- [ ] 驗收標準全部通過
- [ ] 空狀態入口可用（AC-5）
- [ ] 重疊驗證測試通過（TC-097-03）；允許 gap 測試通過（TC-097-02）
- [ ] 月跑鎖定保護測試通過（TC-097-04）
- [ ] 稽核日誌 CREATE 寫入驗證
- [ ] 新增後 PUT / DELETE 操作正常（TC-097-05）
- [ ] 單元測試覆蓋率 ≥ 80%
- [ ] Code review 通過
- [ ] 文件已更新

---

## 相關文件

- **Epic Brief**：[E07 Epic Brief](epic-brief.md)
- **對應 Spec**：F055（編輯 CARD_LEVEL 分級門檻）— 本 Story 完成後需由 spec-writer 補 POST endpoint
- **相關 Stories**：US-074（編輯／刪除 CARD_LEVEL 門檻）、US-093（Tab 1 CARD_TYPE 選中狀態）、US-075（TIER_LEVEL 對應，CARD_LEVEL 新增後可在此建立對應）、US-081（月跑的等級劃分依賴此設定）
- **Reference**：`reference/TableSchema/OB/OBLEVELCARD_LEVEL.sql`、`prototypes/28-scoring-config.html`（Tab 4 empty state）
