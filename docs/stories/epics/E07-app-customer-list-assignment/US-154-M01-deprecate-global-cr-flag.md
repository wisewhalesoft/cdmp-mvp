---
last-updated: 2026-06-12
version: v1.0
change-summary: "新增 story：廢除全域 CR 旗標 cr_reassignment_enabled（ob_assign_config seed + migration + entity + F059 spec body 的殘留錯誤描述），確認 ob_list_definition.cr_enabled per-list 為唯一有效來源。"
---

# US-154：廢除全域 CR 旗標並修正既有文件

> **Story ID**：US-154
> **Epic**：[E07 — 客戶名單分派](epic-brief.md)
> **模組**：M01 名單定義（技術清理）
> **優先級**：Must Have
> **階段**：Phase 1（MVP）
> **預估點數**：3
> **Feature**：F102 月名單分派 CR 優先分派

---

## User Story

**As a** 技術團隊
**I want** 正式廢除全域 CR 旗標 `ob_assign_config.cr_reassignment_enabled`（包含 seed 資料、migration 中的 INSERT、entity 引用，以及 F059 spec body 中仍誤寫「全域開關」的敘述），並確認 `ob_list_definition.cr_enabled` per-list 為 F102 及所有後續功能的唯一有效 CR 開關來源
**So that** 消除因兩種 CR 開關並存（全域旗標 vs per-list 欄位）而造成的技術債與文件歧義，讓後續開發者不會誤讀 F059 spec 或 seed 資料而實作錯誤邏輯

---

## 背景說明

**殘留現況**（截至 2026-06-12）：

| 殘留位置 | 內容 | 問題 |
|---|---|---|
| `apps/api/src/database/seeds/seed.ts` | `SEED_ASSIGN_CONFIGS` 含 `cr_reassignment_enabled = 'false'`（F059 CR 回分全域開關） | seed 仍活著，開發環境啟動時寫入全域旗標 |
| `apps/api/src/database/migrations/1711360000130-CreateObAssignConfigSetAndUserFlag.ts` | `INSERT INTO ob_assign_config (cr_reassignment_enabled, ...)` | migration 含初始 seed；prod 環境若重跑仍會寫入 |
| `apps/api/src/database/entities/ob-assign-config.entity.ts` | Entity 類別本身仍存在，無任何備注 | 開發者可能誤用此 entity 讀取 CR 設定 |
| `docs/specs/features/F059-toggle-cr-reassignment.md` | spec status 已標記 DEPRECATED，但 spec body（§1 功能摘要、§6 商業規則 BR-1）仍描述「CR 回分規則為**全域開關**」 | 與 per-list cr_enabled 決策矛盾，誤導下游 agent |
| `docs/specs/architecture-spec.md` | `ob_assign_config` 表的 S2 稽核點仍寫「F059 CR 回分開關：確認 `ob_assign_config.config_key = 'cr_reassignment_enabled'` 為唯一真實來源 ✅」 | 技術上已不正確，應更新為 per-list cr_enabled |

**已完成部分**（US-120 宣告，2026-05-16）：
- F059 spec 已加 DEPRECATED header、`supersededBy: F050, F051, ob_list_definition.cr_enabled`
- data-model.md 的 `ob_list_definition` 已記載 `cr_enabled` 欄位

本 story 清理以上五個殘留點，不新增功能。

---

## 驗收標準

### AC-1：seed.ts 移除 cr_reassignment_enabled 項目

- **Given** `apps/api/src/database/seeds/seed.ts`
- **When** 代碼審查與靜態掃描
- **Then** `SEED_ASSIGN_CONFIGS` 陣列不再包含 `config_key: 'cr_reassignment_enabled'` 項目
- **And** seed 執行後不向 `ob_assign_config` 寫入 CR 相關全域設定
- **And** 若 `ob_assign_config` 表中仍有舊的 `cr_reassignment_enabled` 記錄（來自過去 seed/migration），需提供清理 SQL 並在部署文件中說明（不在本 story code 範圍內自動執行，以免誤刪其他 config）

### AC-2：migration 130 不再作為 cr_reassignment_enabled 的有效來源

- **Given** `apps/api/src/database/migrations/1711360000130-CreateObAssignConfigSetAndUserFlag.ts`
- **When** 代碼審查
- **Then** migration 中 `cr_reassignment_enabled` 的 INSERT 加入清楚的 `[DEPRECATED-F102]` 注解，說明此 seed 資料已廢棄，F102 後不再有效
- **And** 注解明確指向 `ob_list_definition.cr_enabled` 為新來源

> **設計說明**：migration 已執行的記錄（`typeorm_migrations` 表）不可回頭修改，故不刪除 migration 檔案本身。以注解標記而非移除 INSERT 語句，確保 migration 歷史可追溯。

### AC-3：ob-assign-config entity 加入廢棄標記

- **Given** `apps/api/src/database/entities/ob-assign-config.entity.ts`
- **When** 代碼審查
- **Then** 檔案頂部加入明確注解：`[DEPRECATED-F102] cr_reassignment_enabled 全域旗標已廢棄，請勿讀取此 config_key；CR 開關改用 ob_list_definition.cr_enabled`
- **And** Entity class 本身保留（不刪除），以維持 TypeORM 對 ob_assign_config 表的 schema sync 不中斷

### AC-4：F059 spec body 修正「全域開關」誤述

- **Given** `docs/specs/features/F059-toggle-cr-reassignment.md`
- **When** spec-writer 更新（本 story 為要求，spec-writer 執行）
- **Then** §1（功能摘要）中「CR 回分規則為**全域開關**」修正為「`[DEPRECATED]` 原設計為全域開關，已改為 per-list 欄位 `ob_list_definition.cr_enabled`；詳見 F050/F051」
- **And** §6（商業規則）BR-1「CR 回分規則為全域開關，影響所有部門」加入 `[DEPRECATED]` 標記並附說明
- **And** DEPRECATED header 中 `supersededBy` 欄位維持現有正確值（`F050, F051, ob_list_definition.cr_enabled`），不修改

### AC-5：architecture-spec.md 稽核點 S2 更新

- **Given** `docs/specs/architecture-spec.md`，S2 稽核點「F059 CR 回分開關：確認 `ob_assign_config.config_key = 'cr_reassignment_enabled'` 為唯一真實來源 ✅」
- **When** spec-writer 或 system-architect 更新
- **Then** S2 稽核點更新為：「`[DEPRECATED-F102]` 全域旗標已廢棄；CR 開關唯一來源改為 `ob_list_definition.cr_enabled`（per-list）；F102 US-154 已清理殘留」
- **And** 狀態標記由 `✅ 確認（AD-E07-5）` 改為 `✅ 廢棄並更新（F102 US-154）`

### AC-6：無任何 service/controller 讀取 cr_reassignment_enabled（靜態驗證）

- **Given** F102 上線後的完整 codebase
- **When** 靜態代碼掃描（Grep）
- **Then** 在 `apps/api/src/**/*.ts`（除 entity、migration、seed 外）中搜尋 `cr_reassignment_enabled` 結果為 0 筆
- **And** 在 `apps/web/src/**/*.ts` 中搜尋 `cr_reassignment_enabled` 結果為 0 筆

---

## 技術備註

- **不刪除 ob_assign_config 表**：表可能含其他 config_key（如未來新增），故不 DROP TABLE；只廢棄 `cr_reassignment_enabled` 這一個 key
- **不刪除 migration 檔案**：migration 歷史不可修改，只加注解
- **不刪除 entity 檔案**：保留 TypeORM schema sync；若未來 ob_assign_config 無其他用途，由架構師在後續 sprint 決策是否廢棄整張表
- **需 spec-writer 執行的項目**：AC-4（F059 spec 修正）、AC-5（architecture-spec.md S2 更新）
- **需 architect 確認的項目**：舊 `cr_reassignment_enabled` 記錄是否需要從 prod DB 清除（若 prod 已有此記錄），及清除 SQL 的安全性

---

## [OPEN QUESTION]

- **[OPEN QUESTION-7]**：`ob_assign_config` 表在 F102 廢除 `cr_reassignment_enabled` 後，是否還有其他 `config_key` 被使用？若此表完全閒置，架構師可在後續 sprint 評估 DROP TABLE + 廢棄 entity。本 story 不做這個決定，僅標記供架構師參考。

- **[OPEN QUESTION-8]**：Prod DB 若已有 `cr_reassignment_enabled = 'false'` 記錄（由 migration 130 寫入），是否需要顯式刪除？或保留無害？建議 spec-writer 確認後在 F102 deployment checklist 中記錄。

---

## 測試案例

### TC-154-01：seed 執行後無 cr_reassignment_enabled 記錄

- **Given**：空 dev DB，執行 seed
- **When**：查詢 `SELECT * FROM ob_assign_config WHERE config_key='cr_reassignment_enabled'`
- **Then**：0 筆結果

### TC-154-02：ob-assign-config entity 有廢棄注解

- **Given**：`apps/api/src/database/entities/ob-assign-config.entity.ts`
- **When**：代碼審查
- **Then**：檔案頂部含 `[DEPRECATED-F102]` 注解，明確說明 cr_reassignment_enabled 已廢棄

### TC-154-03：F059 spec §1 已修正全域開關誤述

- **Given**：`docs/specs/features/F059-toggle-cr-reassignment.md` §1
- **When**：文件審查
- **Then**：`[DEPRECATED]` 標記已加入；不再無注解地描述「全域開關」

### TC-154-04：無 service 讀取 cr_reassignment_enabled（靜態掃描）

- **Given**：`apps/api/src/**/*.service.ts`、`apps/api/src/**/*.controller.ts`
- **When**：grep `cr_reassignment_enabled`
- **Then**：0 筆命中

### TC-154-05：architecture-spec S2 稽核點已更新

- **Given**：`docs/specs/architecture-spec.md`
- **When**：搜尋「cr_reassignment_enabled 為唯一真實來源」
- **Then**：原文已改為廢棄說明，包含 F102 US-154 標記

---

## 依賴關係

- **Blocked By**：US-107（per-list cr_enabled 已落地為唯一來源，方可廢除全域旗標）
- **Blocks**：無（本 story 為清理，不阻擋其他 F102 功能）
- **並行可執行**：US-152（CR 優先分派核心）、US-153（閘控）可與本 story 並行開發

---

## Definition of Done

- [ ] AC-1：seed.ts 移除 cr_reassignment_enabled（TC-154-01 驗證）
- [ ] AC-2：migration 130 加 DEPRECATED 注解（code review 確認）
- [ ] AC-3：ob-assign-config entity 加廢棄注解（TC-154-02 驗證）
- [ ] AC-4：F059 spec §1/§6 由 spec-writer 修正（TC-154-03 驗證）
- [ ] AC-5：architecture-spec S2 由 spec-writer/architect 更新（TC-154-05 驗證）
- [ ] AC-6：靜態掃描確認無 service 讀取全域旗標（TC-154-04 驗證）
- [ ] OPEN QUESTION-7/8（ob_assign_config 未來廢棄與 prod 清理）由架構師確認並記錄
- [ ] Code review 通過
- [ ] 文件已更新

---

## 相關文件

- **Epic Brief**：[E07 Epic Brief](epic-brief.md)
- **相關 Stories**：US-107（per-list cr_enabled 建立，前置）、US-120（CR 儲存位置規格宣告，本 story 延伸清理）、US-152（CR 優先分派核心，並行）、US-153（閘控，並行）
- **需修正的文件**：`docs/specs/features/F059-toggle-cr-reassignment.md`（由 spec-writer 執行 AC-4）、`docs/specs/architecture-spec.md`（由 spec-writer/architect 執行 AC-5）
- **需清理的檔案**：`apps/api/src/database/seeds/seed.ts`（AC-1）、`apps/api/src/database/migrations/1711360000130-CreateObAssignConfigSetAndUserFlag.ts`（AC-2）、`apps/api/src/database/entities/ob-assign-config.entity.ts`（AC-3）
