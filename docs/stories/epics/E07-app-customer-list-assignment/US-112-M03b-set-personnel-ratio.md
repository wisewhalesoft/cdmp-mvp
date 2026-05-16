# US-112：個別業務比例設定（處長設定本部門業務員比例）

> **Story ID**：US-112
> **Epic**：[E07 — 客戶名單分派](epic-brief.md)
> **模組**：M03b 個別業務比例設定階段
> **優先級**：Must Have
> **階段**：Phase 1（MVP）
> **預估點數**：8
> **取代**：US-079（已廢棄）

---

## User Story

**As a** 處長（Section Chief）或代操作的部長（Director）/ Admin
**I want** 在名單進入「個別業務比例設定」階段後，為本部門（處長轄區）的每位業務員設定分配比例（RATION），使部門內各業務員比例加總 = 100%
**So that** 月跑時能按業務員設定的比例精準分配案件，反映每位業務員的當月承接量

---

## 背景說明

本 Story 為五階段流程（US-105）第三階段「個別業務比例設定（personnel_ratio）」的核心操作。

名單從部門比例設定推進至此階段後（US-110），由各處長為本部門業務員設定比例。

**設計要點**：
- 處長僅能操作「本部門（`created_by` 過濾，即名單/業務員紀錄的建立者等於本帳號 ID）」的業務員比例
- 部長 / Admin 可代操作**所有**部門的業務員比例（不受轄區限制）
- 每個部門的業務員 RATION 加總必須 = 100%（各部門獨立驗證）
- 業務員清單來源：`ob_emphire`（RESIGN_DATE IS NULL 的在職員工），按 DEPT_CODE 分組
- RATION = 0% 視為有效值（表示該業務員本月不分派名單）
- 基準比例為「系統預設值」（均等分配：1/N * 100%），US-113 提供快速模板調整

---

## 驗收標準

### AC-1：個別業務比例設定入口（處長轄區限定）

- **Given** 帳號持有「處長」或「部長」或「Admin」角色，且名單 `stage = 'personnel_ratio'`
- **When** 在 US-105 五階段清單查看操作欄
- **Then** 處長看到「設定個別比例」按鈕（限本部門名單，依 `created_by` 過濾）
- **And** 部長 / Admin 看到所有部門的「設定個別比例」入口
- **And** 點擊後進入個別業務比例設定頁，頁首顯示「名單：{LIST_NM}（{LIST_NO}）— 本部門：{DEPT_NAME}」

### AC-2：僅顯示本處長轄區業務員

- **Given** 帳號持有「處長」角色
- **When** 進入個別業務比例設定頁
- **Then** 僅顯示本處長轄區（`created_by` = 本帳號 ID）的業務員清單（EMP_ID / EMP_NM / 目前 RATION 值）
- **And** 其他部門的業務員**不顯示**
- **And** 若處長嘗試透過 API 讀取或寫入他人轄區的比例資料，後端回 403 Forbidden

### AC-3：部長 / Admin 可代操作所有部門

- **Given** 帳號持有「部長」或「Admin」角色
- **When** 進入個別業務比例設定頁
- **Then** 可選擇任意部門，查看並修改該部門所有業務員的 RATION
- **And** 不受 `created_by` 轄區限制

### AC-4：修改業務員比例並即時驗證

- **Given** 使用者在個別業務比例設定頁進入編輯模式
- **When** 修改某業務員的 RATION 值
- **Then** 頁面即時顯示該部門所有業務員 RATION 的動態加總
- **And** 若加總 = 100%，「儲存」按鈕啟用
- **And** 若加總 ≠ 100%，「儲存」按鈕停用，顯示提示「目前加總為 N%，需調整至 100% 才能儲存」

### AC-5：RATION 輸入值驗證

- **Given** 使用者在 RATION 輸入框輸入值
- **When** 輸入的值為負數（< 0）或超過 100（> 100）
- **Then** 輸入框顯示錯誤提示「比例需介於 0 到 100 之間」，儲存按鈕停用

### AC-6：RATION = 0 視為有效值

- **Given** 使用者將某業務員 RATION 設為 0%，其他業務員加總 = 100%
- **When** 點擊儲存
- **Then** 系統允許儲存（0% 表示該業務員本月不分派名單）
- **And** 0% 業務員仍顯示於清單，以便日後調整

### AC-7：儲存成功

- **Given** 部門業務員 RATION 加總 = 100%
- **When** 使用者點擊「儲存」
- **Then** 系統寫入 `ob_empl_set`（對應 OBEMPLSETMF）
- **And** 操作寫入 `assignment_audit_log`（action = 'SET_PERSONNEL_RATIO'，entity_type = 'list_definition'，LIST_NO 與 DEPT_CODE 記錄於 entity_id / metadata）
- **And** 頁面顯示成功提示「{DEPT_NAME} 個別業務比例已儲存」，切換回唯讀模式

### AC-8：月跑執行中禁止設定

- **Given** 目前有 AssignmentRun status = 'running' 的月跑
- **When** 使用者嘗試進入個別業務比例設定的編輯模式
- **Then** 編輯按鈕為停用狀態，hover 顯示提示「分派執行中，無法修改比例設定」

### AC-9：跨轄區存取防禦（後端守衛）

- **Given** 帳號持有「處長」角色
- **When** 嘗試透過 API 修改非本轄區的業務員 RATION（即便知道資料 ID）
- **Then** 後端查詢 `created_by` 欄位，確認不屬本帳號轄區後，回 403 Forbidden
- **And** 前端不顯示他人轄區的「編輯」按鈕

---

## 技術備註

- 業務員比例資料：`ob_empl_set`（對應 OBEMPLSETMF），按 LIST_NO + DEPT_CODE + EMP_ID 組合
- 業務員清單來源：`ob_emphire` WHERE `resign_date IS NULL`，按 DEPT_CODE 分組，JOIN `ob_empl_set` 取現有 RATION 值（若無則預設 0 或均等分配）
- 「轄區」識別：`ob_empl_set.created_by` = 本帳號 ID；部長 / Admin 不受此限
- `OBEMPLSETMF.DEPTID_M` 遷移時需 RTRIM（dump 發現 46 個空白填充），新系統存入 trim 後值（見 memory: feedback_typeorm_timestamp）
- **[通知 spec-writer]**：本 Story 取代 F058（US-079 對應），請將 F058 標記 DEPRECATED 並新增對應本 Story 的 Feature spec

---

## 測試案例

### TC-112-01：處長正常設定本部門業務員比例

- **Given**：LIST_NO = 'OB202506001'，stage = 'personnel_ratio'；處長 A（轄區 XTC0）；XTC0 有 3 位在職業務員（EMP001/EMP002/EMP003）
- **When**：處長 A 設定比例為 40%/35%/25%（加總 100%），點擊「儲存」
- **Then**：`ob_empl_set` 寫入 3 筆記錄（LIST_NO + DEPT_CODE + EMP_ID + RATION）；稽核日誌新增 SET_PERSONNEL_RATIO；頁面顯示成功提示

### TC-112-02：處長嘗試存取他人轄區被拒

- **Given**：處長 A（轄區 XTC0）知道處長 B（轄區 XTD0）的業務員 ID
- **When**：處長 A 直接呼叫 PUT /api/v1/personnel-ratio 並傳入 XTD0 部門的業務員 ID
- **Then**：後端查詢 created_by，確認非轄區後回 403 Forbidden

### TC-112-03：部長可代操作任意部門

- **Given**：LIST_NO = 'OB202506001'，stage = 'personnel_ratio'；部長帳號
- **When**：部長選擇部門 XTD0，設定業務員比例並儲存
- **Then**：`ob_empl_set` 寫入 XTD0 的比例記錄；操作成功，不受轄區限制

### TC-112-04：加總不等於 100% 阻擋儲存

- **Given**：處長設定 3 位業務員比例加總 = 90%
- **When**：頁面即時加總計算
- **Then**：顯示「目前加總為 90%，需調整至 100% 才能儲存」；儲存按鈕停用

### TC-112-05：RATION = 0 業務員可儲存

- **Given**：EMP003 設為 0%，EMP001/EMP002 加總 100%
- **When**：點擊儲存
- **Then**：儲存成功；EMP003 仍顯示於清單，RATION = 0%

### TC-112-06：月跑中禁止編輯

- **Given**：AssignmentRun status = 'running'
- **When**：處長嘗試進入編輯模式
- **Then**：編輯按鈕停用，顯示「分派執行中，無法修改比例設定」

---

## 依賴關係

- **Blocked By**：US-110（推進至個別業務比例設定，才有 stage = 'personnel_ratio' 名單）、US-100（部長角色定義）、US-101（處長角色定義與轄區限制）
- **Blocks**：US-113（獎懲快速比例設定，依賴本 Story 的基礎設定）、US-114（個別業務比例設定階段推進至簽核，需先完成本 Story）
- **Rollback 反向**：US-115（個別業務比例設定階段 Rollback 至部門比例，清空本 Story 資料）

---

## Definition of Done

- [ ] 驗收標準全部通過
- [ ] 處長轄區限制測試（TC-112-01 / TC-112-02）
- [ ] 部長代操作測試（TC-112-03）
- [ ] 加總 ≠ 100% 阻擋測試（TC-112-04）
- [ ] RATION = 0 儲存測試（TC-112-05）
- [ ] 月跑中鎖定測試（TC-112-06）
- [ ] AssignmentAuditLog 寫入測試
- [ ] 單元測試覆蓋率 ≥ 80%
- [ ] Code review 通過
- [ ] 文件已更新

---

## 相關文件

- **Epic Brief**：[E07 Epic Brief](epic-brief.md)
- **取代**：US-079（已廢棄）
- **相關 Stories**：US-105（五階段總覽）、US-110（推進至此階段）、US-113（獎懲快速設定模板）、US-114（推進至簽核）、US-115（Rollback 至部門比例）、US-101（處長轄區規則）
