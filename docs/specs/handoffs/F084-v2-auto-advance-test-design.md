---
type: test-design-handoff
feature_id: F084
feature_name: 個別業務比例設定階段「自動推進」至簽核（auto-advance v2.0）
version: "1.0"
date: 2026-05-25
status: approved-for-tdd
related_spec: /docs/specs/features/F084-advance-to-approval.md
related_spec_version: "2.0.1"
related_arch: /docs/specs/architecture-spec.md#AD-E07-19
covers_ac: [AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-7, AC-8, AC-9, AC-10, AC-11, AC-12]
covers_br: [BR-11, BR-12, BR-13, BR-14, BR-15, BR-16]
covers_tc: [TC-114-01, TC-114-02, TC-114-03, TC-114-04, TC-114-05, TC-114-06, TC-114-07, TC-114-08]
total_scenarios: 45
breakdown:
  backend_unit: 30
  backend_integration_real_pg: 4
  frontend_unit: 11
---

# F084 v2.0 Auto-Advance — 測試設計交接文件

> **本文件為 tdd-implementation agent 的 executable spec**。內含 45 個測試案例的完整設計，包含每個案例的層級、前置 seed、操作步驟、預期斷言，以及 4 個必須真 PostgreSQL 的 integration 場景之 infra gap 說明。

---

## 文件目錄

1. [測試框架與慣例對齊](#1-測試框架與慣例對齊)
2. [共用 Seed / Factory 定義](#2-共用-seed--factory-定義)
3. [後端 Unit Tests（30 個）](#3-後端-unit-tests30-個)
   - 3.1 Feature Flag Off 場景
   - 3.2 完成度偵測場景
   - 3.3 Auto-Advance 成功觸發場景
   - 3.4 稽核欄位完整性 + operator_role 推導
   - 3.5 月名單分派 Guard 場景
   - 3.6 Lock 超時降級 + Option B 場景（Unit Mock）
   - 3.7 Idempotent No-Op 場景
   - 3.8 `advanceToInMgr` 過載合約驗證
   - 3.9 `assertAllDeptsSumEquals100WithMgr` 場景
   - 3.10 推進後鎖定 / 歷史月份 / Fallback 手動路徑
4. [後端 Integration Tests（4 個，必須真 PG）](#4-後端-integration-tests4-個必須真-pg)
5. [前端 Unit Tests（11 個）](#5-前端-unit-tests11-個)
6. [Infra Gap 與給 tdd-implementation 的交接備註](#6-infra-gap-與給-tdd-implementation-的交接備註)

---

## 1. 測試框架與慣例對齊

### 後端

| 項目 | 規格 |
|------|------|
| 測試框架 | Vitest（與既有 `personnel-ratio.service.spec.ts` 一致） |
| 描述區塊 | `describe('PersonnelRatioService — F084 v2.0 Auto-Advance', () => {...})` |
| Mock 方式 | `vi.fn()` 直接 mock service / repo；`dataSource.transaction` → `vi.fn(async (fn) => fn(mgr))`；lock mock 見 §3.6 |
| 命名格式 | `TC-F084-NNN`（延續 `TC-M03b-XXX` 前綴慣例，但本 feature 用 F084 前綴） |
| 錯誤斷言方式 | `try/catch` 驗 `e.response.error === ERROR_CODES.XXX` 或 `expect(fn).rejects.toThrow()` |
| 稽核斷言方式 | `expect(mgr.insert).toHaveBeenCalledWith(AssignmentAuditLog, expect.objectContaining({...}))` |

### 前端

| 項目 | 規格 |
|------|------|
| 測試框架 | Vitest + `@testing-library/react`（與既有 `personnel-ratio-config-page.test.tsx` 一致） |
| Mock 方式 | `vi.mock('@/api/assignment-stage')` 整個模組 mock；`vi.mock('@/stores/auth-store')` |
| Wrapper | `MemoryRouter` + `ToastProvider`（沿用既有 `renderPage()` 結構） |
| response shape | 必須使用後端真實 response shape（`autoAdvanced: boolean`、`newStage: string | null`、`autoAdvanceFailReason?: string`）；不可使用 happy-path 簡化結構 |

---

## 2. 共用 Seed / Factory 定義

> 以下為測試案例的基礎 seed 定義，tdd agent 依此初始化 `beforeEach`。

### 後端共用 Mock 物件

```
# validList（stage = personnel_ratio，當月，active）
{
  list_no: 'OB202506001',
  list_nm: '2026-05 主力催收名單',
  project_workym: '202605',
  stage: 'personnel_ratio',
  status: 'active',
}

# validActor — 處長（section_chief）
{
  userId: 'chief-001',
  role: 'user',
  businessRole: 'section_chief',
  ipAddress: null,
}

# directorActor — 部長（director）
{
  userId: 'director-001',
  role: 'user',
  businessRole: 'director',
  ipAddress: null,
}

# adminActor — Admin
{
  userId: 'admin-001',
  role: 'admin',
  businessRole: null,
  ipAddress: null,
}

# mgr（EntityManager mock）
{
  delete: vi.fn().mockResolvedValue({ affected: 1 }),
  insert: vi.fn().mockResolvedValue({}),
  find: vi.fn().mockResolvedValue([]),
  findOne: vi.fn().mockResolvedValue(null),
  update: vi.fn().mockResolvedValue({ affected: 1 }),
  query: vi.fn().mockResolvedValue([]),   ← lock 呼叫點，各案例按需 override
  createQueryBuilder: vi.fn(() => ({
    select: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    andWhere: vi.fn().mockReturnThis(),
    groupBy: vi.fn().mockReturnThis(),
    getRawMany: vi.fn().mockResolvedValue([]),
  })),
}

# dataSource
{
  transaction: vi.fn(async (fn) => fn(mgr)),
}

# 部門完成度 seed（三個部門，XTC0 / XTD0 / XTE0）
completedDepts = [
  { deptid_m: 'XTC0', sum: 100 },
  { deptid_m: 'XTD0', sum: 100 },
  { deptid_m: 'XTE0', sum: 100 },
]

partialDepts = [
  { deptid_m: 'XTC0', sum: 100 },
  { deptid_m: 'XTD0', sum: 80 },   ← 未完成
]

allResignedDept = [
  { deptid_m: 'XTC0', sum: 100 },
  { deptid_m: 'XTE0', sum: 0, activeCount: 0 },  ← 全員離職
]
```

### 前端共用 Factory

```
# buildAutoAdvanceResponse（含新欄位，為後端真實 response shape）
buildAutoAdvanceResponse({
  autoAdvanced: true,
  newStage: 'approval',
  autoAdvanceFailReason: undefined,
  ...existingFields,   ← savedCount, deptSum, savedAt, savedBy
})

# buildFallbackRequiredResponse
buildAutoAdvanceResponse({
  autoAdvanced: false,
  newStage: null,
  autoAdvanceFailReason: 'ASSIGNMENT_RUN_ALREADY_RUNNING',
})

# buildPartialResponse
buildAutoAdvanceResponse({
  autoAdvanced: false,
  newStage: null,
  autoAdvanceFailReason: undefined,
})
```

---

## 3. 後端 Unit Tests（30 個）

### 3.1 Feature Flag Off 場景

#### TC-F084-001
- **名稱**：flag off 時 auto-advance 完全不執行，PUT 回 autoAdvanced: false
- **層級**：unit
- **對應**：AC-8、BR-16、TC-114-05
- **前置 seed**：`ENABLE_E07_AUTO_ADVANCE_TO_APPROVAL = false`；`validList`（stage = personnel_ratio）；所有部門完成（`personnelRatioValidation.assertAllDeptsSumEquals100WithMgr` mock 不拋例外）
- **操作**：呼叫 `setPersonnelRatios('OB202506001', dto, validActor, '202605')`（dto 使 XTE0 加總 = 100%）
- **預期斷言**：
  - response 含 `autoAdvanced: false`
  - `newStage` 為 `null` 或 undefined
  - `stageTransition.advanceToInMgr` **未被呼叫**（`expect(stageTransition.advanceToInMgr).not.toHaveBeenCalled()`）
  - `mgr.update`（stage 更新）**未被呼叫**
  - `mgr.query`（advisory lock）**未被呼叫**
  - 稽核日誌 **不含** `auto_advanced_by_completion` 欄位

#### TC-F084-002
- **名稱**：flag off + phase3 on → 退回 v1.x 手動推進行為（flag 組合驗證）
- **層級**：unit
- **對應**：BR-16（雙 flag 關係）
- **前置 seed**：`ENABLE_E07_AUTO_ADVANCE_TO_APPROVAL = false`、`ENABLE_E07_REFACTOR_PHASE3 = true`；`validList`；部門全部完成
- **操作**：呼叫 `setPersonnelRatios(...)` 兩次（模擬連續 PUT）
- **預期斷言**：
  - 兩次 response 均含 `autoAdvanced: false`
  - stage 始終維持 `personnel_ratio`
  - auto-advance 相關程式碼路徑（lock / assertAllDeptsSumEquals100WithMgr）**完全未執行**

---

### 3.2 完成度偵測場景

#### TC-F084-003
- **名稱**：部分部門未完成（加總 80%）→ autoAdvanced: false，stage 不變
- **層級**：unit
- **對應**：AC-3、TC-114-02、BR-12
- **前置 seed**：`flag = on`；`validList`；`personnelRatioValidation.assertAllDeptsSumEquals100WithMgr` mock 拋例外（表示 XTD0 未完成）
- **操作**：呼叫 `setPersonnelRatios('OB202506001', dtoForXTC0, validActor, '202605')`
- **預期斷言**：
  - response 含 `autoAdvanced: false`、`newStage: null`、**不含** `autoAdvanceFailReason`
  - `stageTransition.advanceToInMgr` 未被呼叫
  - `mgr.delete` 和 `mgr.insert`（ob_empl_set 寫入）**已被呼叫**（寫入保留）

#### TC-F084-004
- **名稱**：容差邊界 ±0.01%（99.99% → 通過，99.98% → 不通過）
- **層級**：unit
- **對應**：BR-12、I-8
- **前置 seed**：`flag = on`；`validList`；兩個子場景
- **操作子場景 A**：所有部門 sum = 99.99%（ = 100 - 0.01%）→ `assertAllDeptsSumEquals100WithMgr` mock 不拋例外
- **操作子場景 B**：所有部門 sum = 99.98%（超出容差）→ mock 拋例外
- **預期斷言**：
  - 子場景 A：`autoAdvanced: true`
  - 子場景 B：`autoAdvanced: false`，不報 5xx（仍回 200，只是不推進）

#### TC-F084-005
- **名稱**：全員離職部門（activeCount = 0）短路通過，不阻擋 auto-advance
- **層級**：unit
- **對應**：TC-114-06、BR-8、BR-12
- **前置 seed**：`flag = on`；`validList`；`assertAllDeptsSumEquals100WithMgr` mock 實作為：「XTE0 activeCount = 0 → 短路 return（不拋例外）；其餘部門 sum = 100% → 通過」；`validList` stage = personnel_ratio；lock mock 正常取得
- **操作**：呼叫 `setPersonnelRatios(...)` 設定最後一個有效部門 XTD0
- **預期斷言**：
  - response 含 `autoAdvanced: true`、`newStage: 'approval'`
  - `stageTransition.advanceToInMgr` 被呼叫，且 listNo = 'OB202506001'
  - 稽核 metadata 含 `auto_advanced_by_completion: true`

---

### 3.3 Auto-Advance 成功觸發場景

#### TC-F084-006
- **名稱**：處長完成最後部門 PUT → auto-advance 成功觸發（TC-114-01 主場景）
- **層級**：unit
- **對應**：AC-1、AC-2、TC-114-01
- **前置 seed**：`flag = on`；`validList`（stage = personnel_ratio）；所有部門完成（`assertAllDeptsSumEquals100WithMgr` mock 不拋）；lock mock 正常（`mgr.query` resolve）；`stageTransition.advanceToInMgr` mock resolve
- **操作**：呼叫 `setPersonnelRatios('OB202506001', dtoForXTE0, validActor, '202605')`（validActor = section_chief）
- **預期斷言**：
  - response 含 `autoAdvanced: true`、`newStage: 'approval'`
  - `mgr.query` 被呼叫且參數包含 `SET LOCAL lock_timeout`（lock 呼叫）
  - `stageTransition.advanceToInMgr` 被呼叫，參數符合：
    ```
    advanceToInMgr(
      'OB202506001',
      'personnel_ratio',
      'approval',
      'chief-001',      ← actor.userId
      mgr,
      { auto_advanced_by_completion: true, operator_role: 'section_chief' }
    )
    ```
  - ob_empl_set 寫入（`mgr.delete` + `mgr.insert`）均已執行

#### TC-F084-007
- **名稱**：部長完成最後部門 PUT → auto-advance 成功觸發（director 角色）
- **層級**：unit
- **對應**：AC-1、AC-9（部長代操）
- **前置 seed**：同 TC-F084-006，但 actor = `directorActor`
- **操作**：呼叫 `setPersonnelRatios('OB202506001', dtoForXTE0, directorActor, '202605')`
- **預期斷言**：
  - response 含 `autoAdvanced: true`
  - `stageTransition.advanceToInMgr` 第 6 個參數（auditMetadata）含 `operator_role: 'director'`

#### TC-F084-008
- **名稱**：Admin 完成最後部門 PUT → auto-advance 成功觸發（admin 角色）
- **層級**：unit
- **對應**：AC-1、A-7（operator_role 推導）
- **前置 seed**：同 TC-F084-006，但 actor = `adminActor`（`role: 'admin'`、`businessRole: null`）
- **操作**：呼叫 `setPersonnelRatios('OB202506001', dtoForXTE0, adminActor, '202605')`
- **預期斷言**：
  - `stageTransition.advanceToInMgr` 第 6 個參數含 `operator_role: 'admin'`
  - **不含** `operator_role: 'section_chief'`（`businessRole: null` 時不應 fallback 至 section_chief）

---

### 3.4 稽核欄位完整性 + operator_role 推導

#### TC-F084-009
- **名稱**：auto-advance 稽核記錄完整性驗證（AC-2 全欄位）
- **層級**：unit
- **對應**：AC-2、BR-14
- **前置 seed**：`flag = on`；所有部門完成；`stageTransition.advanceToInMgr` **mock 捕獲呼叫參數**
- **操作**：呼叫 `setPersonnelRatios(...)` 觸發 auto-advance，actor = validActor（section_chief）
- **預期斷言**：`advanceToInMgr` 呼叫時第 6 個參數（auditMetadata）必須同時包含：
  - `auto_advanced_by_completion: true`（bool，非 string）
  - `operator_role: 'section_chief'`
  - **不含** 其他非預期 key（以避免 metadata 膨脹）

#### TC-F084-010
- **名稱**：手動 fallback 路徑稽核**不含** auto_advanced_by_completion（BR-14 區分）
- **層級**：unit
- **對應**：BR-14、AC-12、TC-114-07
- **前置 seed**：呼叫手動 `advanceTo`（非 `advanceToInMgr`）；`stageTransition.advanceTo` mock
- **操作**：呼叫手動推進 service 方法（`advanceToApproval`）
- **預期斷言**：
  - `stageTransition.advanceTo` 被呼叫（非 `advanceToInMgr`）
  - `stageTransition.advanceTo` 的呼叫參數 **不含** `auditMetadata` 參數（或 auditMetadata 未帶 `auto_advanced_by_completion`）
  - 稽核日誌中 `after_value.metadata` **不含** `auto_advanced_by_completion` 欄位

#### TC-F084-011
- **名稱**：operator_role 推導規則完整性（三角色 × 推導公式）
- **層級**：unit
- **對應**：A-7、AC-2、AC-9
- **前置 seed**：`flag = on`；所有部門完成；三個 actor 子場景
- **操作 + 斷言**：
  - 子場景 A：`actor.role = 'user'`, `businessRole = 'section_chief'` → `operator_role = 'section_chief'`
  - 子場景 B：`actor.role = 'user'`, `businessRole = 'director'` → `operator_role = 'director'`
  - 子場景 C：`actor.role = 'admin'`, `businessRole = null` → `operator_role = 'admin'`（`role === 'admin'` 優先）
  - 驗證方式：`stageTransition.advanceToInMgr` 第 6 個參數之 `operator_role`

---

### 3.5 月名單分派 Guard 場景

#### TC-F084-012
- **名稱**：月名單分派進行中（status = 'running'）→ autoAdvanced: false + autoAdvanceFailReason，PUT 寫入保留
- **層級**：unit
- **對應**：AC-5、BR-15、TC-114-04
- **前置 seed**：`flag = on`；`validList`；所有部門完成；lock mock 正常取得；tx 內月名單分派 guard mock（`runGuard.isRunning` 回 `true`）
- **操作**：呼叫 `setPersonnelRatios(...)`
- **預期斷言**：
  - response 含 `autoAdvanced: false`、`autoAdvanceFailReason: 'ASSIGNMENT_RUN_ALREADY_RUNNING'`
  - `newStage` 為 `null`
  - **不拋例外**（PUT 仍 200）
  - `mgr.delete` 和 `mgr.insert`（ob_empl_set 寫入）**已執行**（不 rollback PUT）
  - `stageTransition.advanceToInMgr` **未被呼叫**

#### TC-F084-013
- **名稱**：月名單分派進行中（status = 'pending'）同樣觸發 guard
- **層級**：unit
- **對應**：AC-5、BR-15
- **前置 seed**：同 TC-F084-012，但 `runGuard.isRunning` 模擬 `pending` 狀態
- **操作**：呼叫 `setPersonnelRatios(...)`
- **預期斷言**：同 TC-F084-012（`autoAdvanceFailReason: 'ASSIGNMENT_RUN_ALREADY_RUNNING'`）

> **mock 對齊真實 contract 注意**：tx 內的月名單分派 guard（`[4b]` 步驟）是 `runGuard.isRunning()` 而非 `runGuard.assertNoRunningRun()`（後者在 tx 外、會拋例外）。兩者是不同的呼叫點，不可混淆。tx 外的 `assertNoRunningRun()` 拋例外表示 PUT 整體失敗（非 200）；tx 內的 `isRunning()` 回 true 表示跳過 auto-advance 但 PUT 仍 200。

---

### 3.6 Lock 超時降級 + Option B 場景（Unit Mock）

> **說明**：以下三個案例以 unit mock 模擬 lock 超時行為。真實的 `55P03 lock_not_available` 行為需見 §4（真 PG integration）。

#### TC-F084-014
- **名稱**：lock 等待逾時（55P03）→ autoAdvanced: false，不帶 failReason，比例寫入保留（Option B）
- **層級**：unit
- **對應**：BR-13、AD-E07-19 §19.3.3
- **前置 seed**：`flag = on`；`validList`；所有部門完成；`mgr.query` mock → 第一次呼叫（lock 取得）**拋 `{ code: '55P03', message: 'lock not available' }`**；ob_empl_set 寫入在 lock 前已完成（mock 正常）
- **操作**：呼叫 `setPersonnelRatios(...)`
- **預期斷言**：
  - response 含 `autoAdvanced: false`
  - `newStage` 為 `null`
  - **不含** `autoAdvanceFailReason`（lock 超時不帶 failReason）
  - **不拋例外**（不報 5xx）
  - `mgr.delete` 和 `mgr.insert`（ob_empl_set 寫入）**已執行**（Option B：寫入保留）
  - `stageTransition.advanceToInMgr` **未被呼叫**

#### TC-F084-015
- **名稱**：lock 超時 catch 後 tx 照常 commit（不 rethrow）
- **層級**：unit
- **對應**：BR-13 Option B、AD-E07-19 §19.3.3
- **前置 seed**：同 TC-F084-014；`dataSource.transaction` mock 可捕獲是否正常 resolve vs reject
- **操作**：呼叫 `setPersonnelRatios(...)`，lock 超時（`55P03`）
- **預期斷言**：
  - `dataSource.transaction` 的 callback 正常 resolve（不 reject）
  - 表示 tx 照常 commit（而非 rollback）
  - 整個 `setPersonnelRatios()` 正常 resolve（不拋例外）

#### TC-F084-016
- **名稱**：lock 超時 vs 月名單分派 guard 的回應欄位差異（不含 failReason vs 含 failReason）
- **層級**：unit
- **對應**：BR-13（lock 超時）vs BR-15（月名單分派 guard）—— 兩者皆 autoAdvanced: false，但 failReason 有無不同
- **前置 seed**：兩個子場景
- **操作 + 斷言**：
  - 子場景 A（lock 超時）：`autoAdvanced: false`，response 中 **不包含** `autoAdvanceFailReason` 欄位（或值為 `undefined/null`）
  - 子場景 B（月名單分派 guard）：`autoAdvanced: false`，response 中 **包含** `autoAdvanceFailReason: 'ASSIGNMENT_RUN_ALREADY_RUNNING'`

---

### 3.7 Idempotent No-Op 場景

#### TC-F084-017
- **名稱**：取得 lock 後重新偵測 stage 已為 approval → idempotent no-op，不重複寫稽核
- **層級**：unit
- **對應**：AC-4、BR-13
- **前置 seed**：`flag = on`；`validList` 的 mock 初始為 `stage = 'personnel_ratio'`；所有部門完成；lock mock 正常；但 `advanceToInMgr` 內部的 `assertStageEquals` mock 發現 stage = 'approval'（模擬先到者已推進）→ `advanceToInMgr` mock 不執行 stage 更新（回傳而不寫稽核）
- **操作**：呼叫 `setPersonnelRatios(...)` 模擬「後到者」
- **預期斷言**：
  - response 含 `autoAdvanced: false`
  - **不含** `autoAdvanceFailReason`
  - `mgr.update`（stage 更新）**未被呼叫**
  - `mgr.insert`（assignment_audit_log 的 STAGE_ADVANCE）**未被呼叫**（稽核不重複）
  - ob_empl_set 寫入（DELETE + INSERT）**已執行**（後到者的比例寫入保留）

#### TC-F084-018
- **名稱**：idempotent no-op 時稽核日誌不重複（驗 STAGE_ADVANCE 寫入次數）
- **層級**：unit
- **對應**：AC-4（不重複寫稽核日誌）
- **前置 seed**：同 TC-F084-017
- **操作**：分別呼叫先到者（`autoAdvanced: true`）和後到者（idempotent no-op）
- **預期斷言**：
  - `stageTransition.advanceToInMgr` **只被呼叫一次**（先到者）
  - 整體 `assignment_audit_log` INSERT（action = 'STAGE_ADVANCE'）**只有一筆**

---

### 3.8 `advanceToInMgr` 過載合約驗證

#### TC-F084-019
- **名稱**：`advanceToInMgr` 接受外部 EntityManager，不自開 tx
- **層級**：unit
- **對應**：A-6、AD-E07-19 §19.3.2
- **前置 seed**：實際建立（非 mock）`StageTransitionService` 的 `advanceToInMgr` 過載；提供 mock `EntityManager`（不注入 `DataSource`）
- **操作**：呼叫 `stageTransitionService.advanceToInMgr('OB202506001', 'personnel_ratio', 'approval', 'chief-001', mockMgr, { auto_advanced_by_completion: true, operator_role: 'section_chief' })`
- **預期斷言**：
  - `mockMgr.update` 被呼叫（`ObListDefinition`，`{ list_no: 'OB202506001' }`，`{ stage: 'approval' }`）
  - `mockMgr.insert` 被呼叫（`AssignmentAuditLog`），且 insert 參數含：
    - `action: 'STAGE_ADVANCE'`
    - `actor_id: 'chief-001'`（或對應欄位名 `operator_id`）
    - `after_value.metadata.auto_advanced_by_completion: true`
    - `after_value.metadata.operator_role: 'section_chief'`
  - `this.dataSource.transaction` **未被呼叫**（確認不自開 tx）

#### TC-F084-020
- **名稱**：`advanceToInMgr` auditMetadata = undefined 時，不寫入 auto_advanced_by_completion（手動路徑對比）
- **層級**：unit
- **對應**：BR-14、A-7
- **前置 seed**：同 TC-F084-019，但 auditMetadata 參數省略（undefined）
- **操作**：呼叫 `stageTransitionService.advanceToInMgr('OB202506001', 'personnel_ratio', 'approval', 'chief-001', mockMgr)`
- **預期斷言**：
  - `mockMgr.insert` 被呼叫，但 `after_value.metadata` **不含** `auto_advanced_by_completion` 欄位
  - `action: 'STAGE_ADVANCE'`（沿用既有 enum，不變）

#### TC-F084-021
- **名稱**：`advanceToInMgr` 在 stage 不符時拋 LIST_STAGE_TRANSITION_FORBIDDEN
- **層級**：unit
- **對應**：A-6、BR-1
- **前置 seed**：`mockMgr.findOne` 回傳 `{ stage: 'approval' }`（已是 approval，不符 fromStage = personnel_ratio）
- **操作**：呼叫 `stageTransitionService.advanceToInMgr('OB202506001', 'personnel_ratio', 'approval', 'chief-001', mockMgr, {...})`
- **預期斷言**：
  - 拋出 422 `LIST_STAGE_TRANSITION_FORBIDDEN`
  - `mockMgr.update` **未被呼叫**（不執行 stage 更新）

---

### 3.9 `assertAllDeptsSumEquals100WithMgr` 場景

#### TC-F084-022
- **名稱**：`assertAllDeptsSumEquals100WithMgr` 使用傳入的 EntityManager 查詢（不用全域 repo）
- **層級**：unit
- **對應**：A-6、AD-E07-19 §19.3.2
- **前置 seed**：建立（非 mock）`PersonnelRatioValidationService`；`mgr.createQueryBuilder` mock 回傳所有部門 sum = 100
- **操作**：呼叫 `personnelRatioValidationService.assertAllDeptsSumEquals100WithMgr('OB202506001', mockMgr)`
- **預期斷言**：
  - `mockMgr.createQueryBuilder` 被呼叫（確認使用外部 mgr 查詢）
  - 不拋例外（所有部門完成）

#### TC-F084-023
- **名稱**：`assertAllDeptsSumEquals100WithMgr` 全員離職部門短路（activeCount = 0）
- **層級**：unit
- **對應**：BR-12、BR-8
- **前置 seed**：`mgr.createQueryBuilder` mock 回傳 `[{ deptid_m: 'XTE0', sum: '0', activeCount: '0' }, { deptid_m: 'XTC0', sum: '100', activeCount: '2' }]`
- **操作**：呼叫 `assertAllDeptsSumEquals100WithMgr('OB202506001', mockMgr)`
- **預期斷言**：
  - 不拋例外（XTE0 activeCount = 0 → 短路通過；XTC0 sum = 100 → 通過）
  - 若 XTC0 sum 改為 80 → 拋例外（確認非離職部門仍被驗證）

---

### 3.10 推進後鎖定 / 歷史月份 / Fallback 手動路徑

#### TC-F084-024
- **名稱**：推進後（stage = approval）再 PUT 業務員比例 → 422 LIST_STAGE_TRANSITION_FORBIDDEN（AC-10）
- **層級**：unit
- **對應**：AC-10、TC-114-08、BR-5
- **前置 seed**：`validList` stage = `'approval'`（已推進）；`stageTransition.assertStageEquals` mock 拋 422（因 stage 不符 personnel_ratio）
- **操作**：呼叫 `setPersonnelRatios('OB202506001', dto, validActor, '202605')`
- **預期斷言**：
  - 拋出 422 `LIST_STAGE_TRANSITION_FORBIDDEN`
  - `mgr.delete` **未被呼叫**（不執行寫入）

#### TC-F084-025
- **名稱**：歷史月份（project_workym < current_work_ym）→ PUT 本身 403，auto-advance 不執行（AC-11）
- **層級**：unit
- **對應**：AC-11、BR-4
- **前置 seed**：`validList.project_workym = '202504'`；`currentWorkYm = '202605'`
- **操作**：呼叫 `setPersonnelRatios('OB202506001', dto, validActor, '202605')`
- **預期斷言**：
  - 拋出 403 `LIST_HISTORICAL_READONLY`
  - auto-advance 邏輯完全未執行（`mgr.query` 未被呼叫）

#### TC-F084-026
- **名稱**：fallback 手動路徑 — 部長手動推進成功（flag off 路徑）（TC-114-07）
- **層級**：unit
- **對應**：AC-12、TC-114-07
- **前置 seed**：`flag = off`；`validList`（stage = personnel_ratio）；所有部門完成（`assertAllDeptsSumEquals100` mock 不拋）；月名單分派 guard 通過；`stageTransition.advanceTo` mock resolve
- **操作**：呼叫手動推進 service method（`POST /api/v1/assignment/lists/{listNo}/stage/advance-to-approval` 對應的 service）
- **預期斷言**：
  - 回傳 200 OK，含 `currentStage: 'approval'`、`advancedByRole: 'director'`
  - `stageTransition.advanceTo` 被呼叫（非 `advanceToInMgr`）
  - `stageTransition.advanceTo` 的 auditMetadata **不含** `auto_advanced_by_completion`

#### TC-F084-027
- **名稱**：fallback 手動路徑 — 仍有部門未完成 → 422 STAGE_ADVANCE_PRECONDITION_FAILED + incompleteDepts
- **層級**：unit
- **對應**：AC-12、BR-2
- **前置 seed**：`assertAllDeptsSumEquals100` mock 拋 422 `STAGE_ADVANCE_PRECONDITION_FAILED`（`incompleteDepts: ['XTD0']`）
- **操作**：呼叫手動推進 service method
- **預期斷言**：
  - 拋出 422 `STAGE_ADVANCE_PRECONDITION_FAILED`
  - response 含 `incompleteDepts: ['XTD0']`
  - stage 未更新

#### TC-F084-028
- **名稱**：fallback 手動路徑 — 月名單分派進行中 → 409 ASSIGNMENT_RUN_ALREADY_RUNNING
- **層級**：unit
- **對應**：AC-12、BR-9
- **前置 seed**：`runGuard.assertNoRunningRun` mock 拋 409 `ASSIGNMENT_RUN_ALREADY_RUNNING`
- **操作**：呼叫手動推進 service method
- **預期斷言**：拋出 409 `ASSIGNMENT_RUN_ALREADY_RUNNING`

#### TC-F084-029
- **名稱**：fallback 手動路徑 — 歷史月份 → 403 LIST_HISTORICAL_READONLY
- **層級**：unit
- **對應**：AC-12、BR-4
- **前置 seed**：`validList.project_workym = '202504'`
- **操作**：呼叫手動推進 service method
- **預期斷言**：拋出 403 `LIST_HISTORICAL_READONLY`

#### TC-F084-030
- **名稱**：fallback 手動路徑 — stage 不是 personnel_ratio → 422 LIST_STAGE_TRANSITION_FORBIDDEN
- **層級**：unit
- **對應**：AC-12、BR-1
- **前置 seed**：`validList.stage = 'approval'`（或 `'draft'`）
- **操作**：呼叫手動推進 service method
- **預期斷言**：拋出 422 `LIST_STAGE_TRANSITION_FORBIDDEN`

---

## 4. 後端 Integration Tests（4 個，必須真 PG）

> **警告：以下 4 個案例需要真實 PostgreSQL 環境。若目前專案 integration test infra 為 SQLite，請先閱讀本節末的「infra gap 處理指引」再決定是否繼續。**

> **【DEFERRED — 需真 PG，本 MVP 不落地】（tdd-implementation 決策 B / 2026-05-25）**
> 本節 INT-F084-001~004 採**選項 B（暫標 deferred + 手動測試備忘）**，不落地為自動化測試。
> 理由：專案現有 integration test infra 為 SQLite（`apps/api/test/setup.ts` 設 `DB_TYPE='sqlite'`），
> 而 `pg_advisory_xact_lock` / `SET LOCAL lock_timeout` / `55P03 lock_not_available` / READ COMMITTED
> tx-local dirty-read 等語意為 PostgreSQL 專有，**SQLite 無法替代、mock 亦無法測到真實 lock 時序**
> （硬寫成 SQLite 測試會「假綠」，違反 mock 對齊真實 contract 原則）。
> 手動驗收步驟見 [F084-v2-staging-manual-verification.md](F084-v2-staging-manual-verification.md)（含 PR checklist 4 項）。
> 後端 catch 路徑（55P03 降級、Option B 寫入保留、operator_role、稽核 metadata）已由 Phase 1 的 30 個
> unit 測試以 mock 覆蓋（TC-F084-001~030 全綠）；本節 4 個 integration 僅補「真實 PG 並發/lock 時序」之驗證。

---

### INT-F084-001：兩並發 PUT advisory lock 序列化，只推進一次　【DEFERRED — 需真 PG，本 MVP 不落地】

- **名稱**：兩並發 PUT advisory lock 序列化 → 先到者 autoAdvanced: true，後到者 idempotent no-op（TC-114-03）
- **層級**：**integration（需真 PostgreSQL，SQLite 無法替代）**
- **必須真 PG 原因**：`pg_advisory_xact_lock(key)` 是 PostgreSQL 專有函數。兩條真實 DB 連線的 blocking 時序（B 等待 A commit 後取得 lock）無法以 SQLite 或 mock 模擬。
- **對應**：AC-4、TC-114-03、BR-13
- **前置 seed**：
  - 清空並 INSERT `ob_list_definition`：`{ list_no: 'OB202506001', stage: 'personnel_ratio', status: 'active', project_workym: '202605' }`
  - INSERT `ob_dept_pct`：3 個部門（XTC0 / XTD0 / XTE0），各 ration > 0
  - INSERT `ob_emphire`：每個部門各 2 名在職員工
  - `ENABLE_E07_AUTO_ADVANCE_TO_APPROVAL = true`
  - `assignment_run` 無 pending/running 紀錄
- **操作（模擬兩並發 PUT 的測試技巧）**：
  1. 開啟兩條獨立 DB 連線（`dataSource.createQueryRunner()` × 2）
  2. **連線 A**：開始 tx → DELETE/INSERT ob_empl_set（XTC0 + XTD0 各設定 100%）→ **不 commit，等待指令**
  3. **連線 B**：開始 tx → DELETE/INSERT ob_empl_set（XTE0 設定 100%）→ **嘗試取得 advisory lock**（此時 A 尚未 commit，B 會 blocking）
  4. 使用 `Promise.all([txA(), txB()])` 觸發並發：txA 在 5ms 後 commit；B 等待後取得 lock，重新偵測 stage
- **預期斷言**：
  - A 的 `setPersonnelRatios` 回傳 `autoAdvanced: true`、`newStage: 'approval'`
  - B 的 `setPersonnelRatios` 回傳 `autoAdvanced: false`（stage 已 approval，idempotent no-op）
  - **不含** `autoAdvanceFailReason`
  - 資料庫中 `ob_list_definition.stage = 'approval'`
  - `assignment_audit_log` 中 action = 'STAGE_ADVANCE' 的紀錄**只有一筆**
  - 兩筆 ob_empl_set 寫入均保留（A 和 B 的比例資料都存在）

---

### INT-F084-002：lock 等待逾時（55P03）+ Option B 比例寫入保留　【DEFERRED — 需真 PG，本 MVP 不落地】

- **名稱**：lock_timeout 觸發 55P03 → autoAdvanced: false，不帶 failReason，ob_empl_set 寫入完整保留
- **層級**：**integration（需真 PostgreSQL，SQLite 無法替代）**
- **必須真 PG 原因**：`SET LOCAL lock_timeout = '100ms'` 和 PostgreSQL 錯誤碼 `55P03 lock_not_available` 是 PG 專有機制；`catch (e) { if (e.code === '55P03') { ... } }` 的 catch 路徑需真實 PG 錯誤才能觸發。
- **對應**：BR-13（lock 超時降級）、AD-E07-19 §19.3.3（Option B）
- **前置 seed**：同 INT-F084-001
- **操作（模擬 lock 超時的測試技巧）**：
  1. **連線 A（持鎖者）**：開始 tx → `SELECT pg_advisory_xact_lock(hashtext('OB202506001')::bigint)` 取得 lock → **不 commit**，保持 lock 持有狀態 200ms
  2. **連線 B（測試對象）**：設 `lock_timeout = 100ms`（測試環境縮短，正式為 5000ms）→ 嘗試取得同一 key 的 advisory lock → 因 A 持有 → **100ms 後觸發 55P03**
  3. `setPersonnelRatios` 的 catch 路徑處理 55P03 → 不 rethrow → tx 照常 commit
- **預期斷言**：
  - `setPersonnelRatios` 正常 resolve（不拋例外，不報 5xx）
  - response 含 `autoAdvanced: false`，**不含** `autoAdvanceFailReason`
  - 資料庫中 `ob_empl_set` 有 B 連線寫入的比例資料（Option B：寫入保留）
  - 資料庫中 `ob_list_definition.stage` 仍為 `'personnel_ratio'`（auto-advance 未執行）
  - `assignment_audit_log` 中**無** `STAGE_ADVANCE` 紀錄（本次 PUT 未推進）

---

### INT-F084-003：`assertAllDeptsSumEquals100WithMgr` 讀取同一 tx 未 commit 的 ob_empl_set 資料　【DEFERRED — 需真 PG，本 MVP 不落地】

- **名稱**：完成度偵測能讀取同一 tx 內剛 INSERT 但未 commit 的 ob_empl_set 紀錄
- **層級**：**integration（需真 PostgreSQL，SQLite 無法替代）**
- **必須真 PG 原因**：READ COMMITTED 隔離級別下，同一 EntityManager（同一 tx）能讀取自己 INSERT 但未 commit 的資料（tx-local visibility）。SQLite 行為不同，無法驗證 PG 的 tx-local dirty read 語意。若 `assertAllDeptsSumEquals100WithMgr` 使用全域 repository（非傳入的 mgr），則會讀不到 tx 內的新資料，導致完成度誤判為「未完成」。
- **對應**：A-6、AD-E07-19 §19.3.2
- **前置 seed**：
  - 清空 `ob_empl_set`（確保沒有既有比例資料）
  - `ob_emphire`：XTC0 部門 2 名在職員工
  - `ob_dept_pct`：XTC0 ration = 100
- **操作**：
  1. 開始 tx（`dataSource.transaction`）
  2. tx 內 INSERT `ob_empl_set`（XTC0, EMP001, ration=60）+（XTC0, EMP002, ration=40）
  3. tx 內呼叫 `assertAllDeptsSumEquals100WithMgr('OB202506001', mgr)` —— 使用同一 mgr
  4. **不 commit**，在 tx 內直接斷言
- **預期斷言**：
  - `assertAllDeptsSumEquals100WithMgr` **不拋例外**（代表讀到 tx 內剛寫的資料，sum = 100%）
  - 若改用全域 repository（不傳 mgr）→ 應讀不到資料 → 拋例外（此為 regression guard：確認實作確實使用傳入的 mgr）

---

### INT-F084-004：`advanceToInMgr` 原子性 — stage 更新 + 稽核同 tx rollback　【DEFERRED — 需真 PG，本 MVP 不落地】

- **名稱**：`advanceToInMgr` 和 ob_empl_set 寫入同屬一個 tx，tx rollback 時全部復原
- **層級**：**integration（需真 PostgreSQL，SQLite 無法替代）**
- **必須真 PG 原因**：需驗證 TypeORM `EntityManager` 的 tx 原子性語意（commit/rollback 影響多個 entity 的一致性），SQLite 行為接近但 advisory lock 路徑不完整。
- **對應**：BR-7（DB 操作原子性）、A-6
- **前置 seed**：`ob_list_definition`（stage = personnel_ratio）；`ob_empl_set` 為空
- **操作**：
  1. 開始 tx（`dataSource.transaction(async (mgr) => { ... })`）
  2. tx 內：INSERT ob_empl_set（比例資料）
  3. tx 內：呼叫 `advanceToInMgr`（更新 stage + 寫稽核）
  4. **強制拋例外**（模擬後續業務邏輯失敗）→ tx rollback
- **預期斷言**：
  - 資料庫中 `ob_list_definition.stage` 仍為 `'personnel_ratio'`（未 commit）
  - `ob_empl_set` 比例資料**不存在**（rollback 還原）
  - `assignment_audit_log` 無 STAGE_ADVANCE 紀錄（rollback 還原）

---

### Integration Test Infra Gap 處理指引

**當前風險評估**：若專案現有 integration test 採用 SQLite（in-memory）作為測試 DB，以上 4 個案例**無法在現有 infra 執行**。

**tdd-implementation agent 的處理選項**：

選項 A — 建立真 PG 測試 harness（建議）：
- 使用 `testcontainers-node`（`@testcontainers/postgresql`）在 CI 啟動真實 PG container
- 針對 `*.integration.spec.ts` 設定獨立的 `vitest.integration.config.ts`，指定真 PG DSN
- 4 個案例放入 `*.integration.spec.ts` 檔案，與 unit test 分離
- CI 中以獨立 job 執行（允許額外時間）

選項 B — 暫標 deferred + 手動測試備忘：
- 在 unit test 文件標記 `it.skip('INT-F084-00X — deferred: 需真 PG', () => {...})`
- 補充手動驗收測試步驟（staging 環境執行真實並發 PUT 驗證）
- 在 PR checklist 加入：「☐ INT-F084-001~004 已在 staging PG 環境手動驗證」

**建議**：優先選擇選項 A；advisory lock 並發正確性（AC-4）是 F084 v2.0 的核心風險，不建議僅靠手動測試。

---

## 5. 前端 Unit Tests（11 個）

> **測試檔案位置建議**：在既有 `personnel-ratio-config-page.test.tsx` 新增 describe block，或新建 `personnel-ratio-auto-advance.test.tsx`（兩者均在 `apps/web/src/pages/assignment/__tests__/`）。

### 共用 Mock 設定

```
# setPersonnelRatios API mock（新 response 欄位，對齊真實後端 contract）
mockedSetPersonnelRatios = vi.mocked(assignmentStageApi.setPersonnelRatios)

# 設定 mock 回傳值時必須包含新欄位，不可省略：
mockedSetPersonnelRatios.mockResolvedValue({
  listNo: 'OB202506001',
  deptCode: 'XTC0',
  savedCount: 2,
  deptSum: 100,
  savedAt: '2026-05-25T08:00:00Z',
  savedBy: 'chief-001',
  autoAdvanced: true,           ← 必填（不可省略）
  newStage: 'approval',         ← 必填（不可省略）
  autoAdvanceFailReason: null,  ← 必填（即使 null 也要明示）
})
```

---

#### TC-F084-FE-001
- **名稱**：PUT 成功且 autoAdvanced: true → 顯示自動推進 toast + redirect 至名單列表（AC-6）
- **層級**：frontend unit
- **對應**：AC-6、TC-114-01 前端
- **前置 seed**：`flag = on`（前端 feature flag mock）；`mockedSetPersonnelRatios` 回 `autoAdvanced: true`、`newStage: 'approval'`；名單 listNm = '2026-05 主力催收名單'
- **操作**：
  1. Render `PersonnelRatioConfigPage`
  2. 填入 XTC0 比例資料（60 / 40）
  3. 點擊「儲存」按鈕 → API 回傳 `autoAdvanced: true`
- **預期斷言**：
  - `screen.getByText(/已自動推進至簽核階段/)` 出現（toast 訊息）
  - toast 訊息含 listNm：`/2026-05 主力催收名單/`
  - `screen.getByText(/等待部長核准/)` 出現
  - `mockNavigate` 被呼叫，path 指向名單列表（`/assignment/lists`）

#### TC-F084-FE-002
- **名稱**：PUT 後 redirect 至名單列表，該名單階段標籤更新為「簽核」（AC-6 UX 驗證）
- **層級**：frontend unit
- **對應**：AC-6
- **前置 seed**：同 TC-F084-FE-001，另 `mockedListLists` 在 redirect 後回傳名單 stage = 'approval'
- **操作**：同 TC-F084-FE-001
- **預期斷言**：
  - redirect 後（若使用 `MemoryRouter` 模擬）名單列表頁顯示階段標籤「簽核」（`/簽核/`）

---

#### TC-F084-FE-003
- **名稱**：PUT 後 autoAdvanceFailReason = ASSIGNMENT_RUN_ALREADY_RUNNING → 顯示月名單分派 toast + 退回顯示手動按鈕
- **層級**：frontend unit
- **對應**：AC-5、TC-114-04 前端
- **前置 seed**：`mockedSetPersonnelRatios` 回 `autoAdvanced: false`、`autoAdvanceFailReason: 'ASSIGNMENT_RUN_ALREADY_RUNNING'`、`newStage: null`；所有部門 sumValidated = true（使 fallback 按鈕應出現）
- **操作**：點擊「儲存」按鈕
- **預期斷言**：
  - toast 含 `比例已儲存` + `分派執行中`（或 `月名單分派完成後手動推進`）
  - `screen.getByTestId('btn-advance-approval')` **出現**（fallback 手動按鈕）
  - **不 redirect**（留在頁面，供手動推進）

#### TC-F084-FE-004
- **名稱**：月名單分派 guard toast 中手動推進按鈕為 disabled（月名單分派進行中）
- **層級**：frontend unit
- **對應**：AC-5、AC-7
- **前置 seed**：同 TC-F084-FE-003；月名單分派狀態 mock（前端判斷）= running
- **操作**：同上，PUT 後 fallback 按鈕出現
- **預期斷言**：
  - `btn-advance-approval` 有 `disabled` 屬性
  - hover 顯示 `分派執行中，無法推進`（tooltip 文字）

---

#### TC-F084-FE-005
- **名稱**：PUT 後 autoAdvanced: false 無 failReason（部分完成）→ 只顯示儲存 toast，不顯示推進訊息
- **層級**：frontend unit
- **對應**：AC-3 前端、§7.1
- **前置 seed**：`mockedSetPersonnelRatios` 回 `autoAdvanced: false`、`autoAdvanceFailReason: null`、`newStage: null`；仍有部門 sumValidated = false
- **操作**：點擊「儲存」按鈕
- **預期斷言**：
  - 顯示既有「已儲存」toast（`/{deptName} 個別業務比例已儲存/`）
  - **不顯示** `已自動推進至簽核` 相關訊息
  - **不顯示** `比例已儲存；因分派執行中` 相關訊息
  - **不 redirect**

---

#### TC-F084-FE-006
- **名稱**：flag off → 頁面顯示手動「推進至簽核」按鈕（AC-8 前端）
- **層級**：frontend unit
- **對應**：AC-8、TC-114-05 前端、BR-16
- **前置 seed**：`ENABLE_E07_AUTO_ADVANCE_TO_APPROVAL = false`（前端 flag mock）；所有部門 sumValidated = true；stage = 'personnel_ratio'
- **操作**：Render `PersonnelRatioConfigPage`
- **預期斷言**：
  - `screen.getByTestId('btn-advance-approval')` **出現**（可點擊的手動推進按鈕）
  - 按鈕**不是** disabled
  - **不顯示** auto-advance 相關 toast（頁面初始不觸發推進）

---

#### TC-F084-FE-007
- **名稱**：手動推進按鈕在非 personnel_ratio 階段**完全不渲染**（DOM 不存在）
- **層級**：frontend unit
- **對應**：AC-7（非 personnel_ratio 不渲染）
- **前置 seed**：`getPersonnelRatios` 回傳 `stage = 'approval'`（或 `'draft'`）
- **操作**：Render `PersonnelRatioConfigPage`
- **預期斷言**：
  - `screen.queryByTestId('btn-advance-approval')` 回傳 `null`（DOM 完全不存在，非 CSS 隱藏）

#### TC-F084-FE-008
- **名稱**：手動推進按鈕在歷史月份**完全不渲染**
- **層級**：frontend unit
- **對應**：AC-7（歷史月份不渲染）
- **前置 seed**：`getPersonnelRatios` 回傳 `isReadOnly: true`（歷史月份）
- **操作**：Render `PersonnelRatioConfigPage`
- **預期斷言**：
  - `screen.queryByTestId('btn-advance-approval')` 回傳 `null`

---

#### TC-F084-FE-009
- **名稱**：手動推進 fallback — 確認對話框 + 成功 toast（AC-12 前端 / TC-114-07 前端）
- **層級**：frontend unit
- **對應**：AC-12、TC-114-07 前端
- **前置 seed**：`flag = off`；所有部門完成（sumValidated = true）；`mockedAdvanceApproval` 回 `{ currentStage: 'approval', ... }`
- **操作**：
  1. 點擊「推進至簽核」按鈕
  2. 確認對話框出現
  3. 點擊「確認推進」
- **預期斷言**：
  - `screen.getByTestId('confirm-advance-modal')` 出現（確認對話框）
  - 對話框含名單資訊（listNm / listNo）
  - `mockedAdvanceApproval` 被呼叫
  - 成功後顯示 toast `/{listNm} 已推進至簽核階段/`
  - redirect 至名單列表

#### TC-F084-FE-010
- **名稱**：手動推進 fallback — 確認對話框「取消」不觸發 API
- **層級**：frontend unit
- **對應**：AC-12 前端 UX
- **前置 seed**：同 TC-F084-FE-009
- **操作**：點擊「推進至簽核」→ 確認對話框 → 點擊「取消」
- **預期斷言**：
  - `mockedAdvanceApproval` **未被呼叫**
  - 對話框關閉
  - 頁面無 redirect

---

#### TC-F084-FE-011
- **名稱**：手動推進 fallback — 部分部門未完成時 API 回 422 + incompleteDepts → 顯示未完成部門 modal
- **層級**：frontend unit
- **對應**：AC-12 前端（422 錯誤回饋）
- **前置 seed**：`mockedAdvanceApproval` 回 422 `STAGE_ADVANCE_PRECONDITION_FAILED`（`incompleteDepts: ['XTD0']`）
- **操作**：點擊「推進至簽核」→ 確認 → API 回 422
- **預期斷言**：
  - 顯示未完成部門 modal，含部門名稱（`/XTD0/` 或對應的 `deptName`）
  - 顯示「我知道了」按鈕
  - 點擊「我知道了」後 modal 關閉，頁面不 redirect

---

## 6. Infra Gap 與給 tdd-implementation 的交接備註

### 6.1 實作順序建議

```
Phase 1：後端 Unit — 紅燈先行
  1. 新增 `PersonnelRatioService.setPersonnelRatios()` 的 auto-advance 路徑（flag gate）
     → 使 TC-F084-001 / TC-F084-002 紅燈 → 實作 flag check → 綠燈
  2. 完成度偵測 mock 路徑
     → TC-F084-003 / TC-F084-004 / TC-F084-005 紅燈 → 實作 assertAllDeptsSumEquals100WithMgr 呼叫 → 綠燈
  3. Lock 取得 + auto-advance 成功路徑
     → TC-F084-006 / TC-F084-007 / TC-F084-008 紅燈 → 實作 mgr.query（lock）+ advanceToInMgr 呼叫 → 綠燈
  4. 稽核欄位 + operator_role 推導
     → TC-F084-009 / TC-F084-010 / TC-F084-011 紅燈 → 實作 auditMetadata 組裝邏輯 → 綠燈
  5. 月名單分派 guard tx 內路徑
     → TC-F084-012 / TC-F084-013 紅燈 → 實作 runGuard.isRunning() 呼叫 → 綠燈
  6. Lock 超時 55P03 catch 路徑（Option B）
     → TC-F084-014 / TC-F084-015 / TC-F084-016 紅燈 → 實作 catch 邏輯 → 綠燈
  7. Idempotent no-op
     → TC-F084-017 / TC-F084-018 紅燈 → 實作 stage 重新偵測 → 綠燈
  8. advanceToInMgr 過載 + assertAllDeptsSumEquals100WithMgr（新 method）
     → TC-F084-019 ~ TC-F084-023 紅燈 → 新增 method → 綠燈
  9. 推進後鎖定 / 歷史月份 / fallback 手動路徑
     → TC-F084-024 ~ TC-F084-030 紅燈 → 補全各 guard → 綠燈

Phase 2：前端 Unit
  1. setPersonnelRatios API client 補 autoAdvanced / newStage / autoAdvanceFailReason 型別
  2. PersonnelRatioConfigPage 新增 auto-advance response 處理邏輯
  → TC-F084-FE-001 ~ TC-F084-FE-011 紅燈 → 實作 → 綠燈

Phase 3：Integration（選項 A：建立真 PG harness）
  1. 設定 vitest.integration.config.ts + testcontainers
  2. INT-F084-001 ~ INT-F084-004
```

### 6.2 需要新增的 API / Method 清單

tdd-implementation agent 需要實作以下**新增項目**（不修改現有 method 簽名）：

| 新增項目 | 所在檔案 | 說明 |
|---------|---------|------|
| `StageTransitionService.advanceToInMgr()` | `stage-transition.service.ts` | 接受外部 EntityManager 過載，不自開 tx |
| `PersonnelRatioValidationService.assertAllDeptsSumEquals100WithMgr()` | `personnel-ratio-validation.service.ts` | 使用傳入 mgr 查詢，確保讀 tx 內資料 |
| F082 PUT response 補欄位 | `personnel-ratio.service.ts`（return type）+ API client 型別 | `autoAdvanced`, `newStage`, `autoAdvanceFailReason` |
| tx 內月名單分派 guard | `personnel-ratio.service.ts`（tx 內 `[4b]`）| `runGuard.isRunning()` （tx 內輕量版，非 assertNoRunningRun） |

### 6.3 mock 對齊真實 contract 警告

> **請閱讀並遵守，避免 unit test 全綠但 prod silent miss（對應 memory 教訓 `feedback_mock_real_system_contract.md`）。**

1. **lock 超時錯誤碼**：mock 時必須使用 `{ code: '55P03' }`（PostgreSQL 標準錯誤碼，非 `'LOCK_TIMEOUT'` 或其他自訂字串）。catch 邏輯應判斷 `e.code === '55P03'`，不可用 message string 比對。

2. **稽核 metadata 型別**：`auto_advanced_by_completion` 必須為 `boolean true`（非 `1`、非 `'true'`）。mock 斷言用 `expect.objectContaining({ auto_advanced_by_completion: true })` 嚴格比對型別。

3. **operator_role 推導公式**：`actor.role === 'admin' ? 'admin' : (actor.businessRole ?? 'section_chief')`。測試子場景 C（Admin）中，`businessRole: null` 時 `operator_role` 必須是 `'admin'`（非 `'section_chief'`）——這是 `role === 'admin'` 優先判斷的語意，mock 不可省略此邊界。

4. **tx 外 vs tx 內月名單分派 guard**：tx 外的 `assertNoRunningRun()` 拋例外（PUT 整體失敗，非 200）；tx 內的 `isRunning()` 回 boolean（PUT 仍 200，只跳過 auto-advance）。兩個 method 是不同的 contract，mock 時不可互換。

5. **前端 response shape**：`setPersonnelRatios` 的 mock 回傳必須包含 `autoAdvanced`、`newStage`、`autoAdvanceFailReason` 三欄位，即使值為 `false`/`null` 也要明示。省略欄位會導致前端邏輯走到 undefined 分支，掩蓋真實 bug。

### 6.4 F084 §10 連結補充提醒

> 本文件建議由 tdd-implementation agent 實作完成後，在 `docs/specs/features/F084-advance-to-approval.md` §10 最末補充：
> `詳細測試案例設計見 [F084-v2-auto-advance-test-design.md](../../specs/handoffs/F084-v2-auto-advance-test-design.md)（45 個案例，含 4 個真 PG integration 場景）。`

---

*文件版本 1.0 / 2026-05-25 / Test Designer Agent*
