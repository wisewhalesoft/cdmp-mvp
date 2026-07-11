---
type: staging-manual-verification
feature_id: F084
feature_name: 個別業務比例設定階段「自動推進」至簽核（auto-advance v2.0）
version: "1.0"
date: 2026-05-25
status: pending-staging-verification
related_test_design: F084-v2-auto-advance-test-design.md
related_arch: /docs/specs/architecture-spec.md#AD-E07-19
covers_int: [INT-F084-001, INT-F084-002, INT-F084-003, INT-F084-004]
---

# F084 v2.0 Auto-Advance — Staging 真 PG 手動驗證步驟

> **背景**：F084 v2.0 的 4 個 integration 案例（INT-F084-001~004）依賴 PostgreSQL 專有機制
> （`pg_advisory_xact_lock` / `SET LOCAL lock_timeout` / `55P03 lock_not_available` / READ COMMITTED
> tx-local dirty-read），SQLite 無法替代、mock 無法測到真實 lock 時序。tdd-implementation 採**決策 B**：
> 不落地為自動化測試，改以本文件描述在真 PG / staging 環境手動驗證的步驟。
>
> **前置**：`ENABLE_E07_REFACTOR_PHASE3=on` + `ENABLE_E07_AUTO_ADVANCE_TO_APPROVAL=on`；
> 連線真 PostgreSQL（非 SQLite）；測試名單 `OB202506001`（stage=personnel_ratio、status=active、
> project_workym >= current_work_ym）；3 個部門 XTC0 / XTD0 / XTE0，各有 ration > 0 的 ob_dept_pct 與
> ≥1 在職員工。每次驗證前清空 `ob_empl_set`（該 listNo）與 `assignment_run`（pending/running）。

---

## 共用 Seed SQL（每次驗證前重置）

```sql
-- 名單回到 personnel_ratio
UPDATE ob_list_definition
   SET stage = 'personnel_ratio'
 WHERE list_no = 'OB202506001';

-- 清空本名單個別比例
DELETE FROM ob_empl_set WHERE list_no = 'OB202506001';

-- 清空稽核（僅驗證環境，方便斷言 STAGE_ADVANCE 筆數）
DELETE FROM assignment_audit_log WHERE entity_id = 'OB202506001';

-- 確認無進行中月名單分派
SELECT run_id, status FROM assignment_run WHERE status IN ('pending','running');
-- 預期 0 列；若有，先結束或刪除測試月名單分派
```

---

## INT-F084-001：兩並發 PUT advisory lock 序列化，只推進一次（對應 TC-114-03 / AC-4 / BR-13）

**驗證目標**：兩處長幾乎同時送出 PUT（兩筆都會使所有部門完成），blocking advisory lock 序列化後，
只有先到者推進、後到者 idempotent no-op，稽核只新增一筆 STAGE_ADVANCE。

**操作步驟**：
1. 先設定 XTC0 + XTD0 各加總 100%（PUT 兩次，使僅剩 XTE0 未完成）。
2. 開兩個並發 client（或用 `psql` 兩條連線 + 應用層 endpoint），幾乎同時對 `PUT /api/v1/assignment/ratios/personnel/OB202506001`：
   - 連線 A：body 設定 XTE0 加總 100%
   - 連線 B：body 設定 XTE0 加總 100%（同 dept，覆寫式）
3. 觸發兩筆並發（建議用 script `Promise.all([putA, putB])`）。

**預期結果（斷言）**：
- A、B 兩筆 PUT 皆回 HTTP 200。
- 其中一筆 response `autoAdvanced: true` + `newStage: "approval"`；另一筆 `autoAdvanced: false`、`newStage: null`、**不含** `autoAdvanceFailReason`。
- `SELECT stage FROM ob_list_definition WHERE list_no='OB202506001'` → `approval`。
- `SELECT count(*) FROM assignment_audit_log WHERE entity_id='OB202506001' AND action='STAGE_ADVANCE'` → **1**（不重複）。
- `SELECT count(*) FROM ob_empl_set WHERE list_no='OB202506001' AND deptid_m='XTE0'` > 0（後到者比例寫入保留）。

---

## INT-F084-002：lock 等待逾時（55P03）+ Option B 比例寫入保留（對應 BR-13 / AD-E07-19 §19.3.3）

**驗證目標**：另一連線持有同 key advisory lock 不釋放時，PUT 的 lock 取得在 `lock_timeout` 後觸發 55P03，
catch 不 rethrow、tx 照常 commit、比例寫入保留、auto-advance 不執行且不報 5xx。

**操作步驟**：
1. 連線 A（持鎖者，psql）：
   ```sql
   BEGIN;
   SELECT pg_advisory_xact_lock(hashtext('OB202506001')::bigint);
   -- 不 COMMIT，保持持有 lock（測試期間維持此 tx 開啟）
   ```
2. （臨時）將驗證環境 `lock_timeout` 縮短，或於應用層暫調為 100ms 以加速（正式為 5000ms）。
3. 連線 B（測試對象）：對 XTE0 送出使所有部門完成的 PUT。
4. 等待逾時（>lock_timeout）後觀察 B 的回應；隨後連線 A `ROLLBACK;` 釋放 lock。

**預期結果（斷言）**：
- B 的 PUT 正常回 HTTP 200（不拋例外、不報 5xx）。
- response `autoAdvanced: false`、`newStage: null`、**不含** `autoAdvanceFailReason`。
- `SELECT count(*) FROM ob_empl_set WHERE list_no='OB202506001' AND deptid_m='XTE0'` > 0（Option B：寫入保留）。
- `SELECT stage FROM ob_list_definition WHERE list_no='OB202506001'` → 仍 `personnel_ratio`。
- `assignment_audit_log` 無本次 `STAGE_ADVANCE`（auto-advance 未執行）。

---

## INT-F084-003：完成度偵測讀取同一 tx 未 commit 的 ob_empl_set（對應 AD-E07-19 §19.3.2 / A-6）

**驗證目標**：`assertAllDeptsSumEquals100WithMgr` 使用傳入 mgr 查詢，能讀到同一 tx 內剛 INSERT 但未 commit 的
ob_empl_set（READ COMMITTED tx-local visibility）；若誤用全域 repository 則讀不到 → regression。

**操作步驟（以 script / 整合驗證程式）**：
1. 清空 ob_empl_set（XTC0 為唯一部門、ration=100、2 名在職員工）。
2. 在單一 `dataSource.transaction(async (mgr) => { ... })` 內：
   - `mgr.insert(ObEmplSet, ...)`（XTC0 EMP001 ration=60、EMP002 ration=40）
   - 於同一 mgr 呼叫 `personnelRatioValidation.assertAllDeptsSumEquals100WithMgr('OB202506001', mgr)`
   - **不 commit**，於 tx 內直接斷言

**預期結果（斷言）**：
- `assertAllDeptsSumEquals100WithMgr` **不拋例外**（讀到 tx 內 sum=100%）。
- regression guard：若臨時改用全域 repository（不傳 mgr）查詢，應讀不到 → 拋 422
  （確認實作確實使用傳入 mgr，而非全域 repo）。

---

## INT-F084-004：advanceToInMgr 原子性 — stage 更新 + 稽核同 tx rollback（對應 BR-7 / A-6）

**驗證目標**：`advanceToInMgr` 的 stage 更新 + 稽核與 ob_empl_set 寫入同屬一個 tx；tx rollback 時全部復原。

**操作步驟（以 script / 整合驗證程式）**：
1. Seed：`ob_list_definition.stage='personnel_ratio'`、`ob_empl_set` 為空。
2. 在 `dataSource.transaction(async (mgr) => { ... })` 內：
   - `mgr.insert(ObEmplSet, ...)`（比例資料）
   - `stageTransition.advanceToInMgr('OB202506001','personnel_ratio','approval', actorId, mgr, { auto_advanced_by_completion: true, operator_role: 'director' })`
   - **強制拋例外**（模擬後續業務失敗）→ tx rollback

**預期結果（斷言）**：
- `SELECT stage FROM ob_list_definition WHERE list_no='OB202506001'` → 仍 `personnel_ratio`（未 commit）。
- `SELECT count(*) FROM ob_empl_set WHERE list_no='OB202506001'` → 0（rollback 還原）。
- `assignment_audit_log` 無 `STAGE_ADVANCE`（rollback 還原）。

---

## PR Checklist（合併前須勾選）

- [ ] **INT-F084-001** 已在 staging PG 環境手動驗證：兩並發 PUT 序列化、stage=approval、STAGE_ADVANCE 僅 1 筆、兩筆比例寫入保留
- [ ] **INT-F084-002** 已在 staging PG 環境手動驗證：lock 超時 55P03 → 200 + autoAdvanced:false 不帶 failReason、比例寫入保留、stage 不變
- [ ] **INT-F084-003** 已在 staging PG 環境手動驗證：WithMgr 偵測讀到 tx 內未 commit 資料（regression：全域 repo 讀不到）
- [ ] **INT-F084-004** 已在 staging PG 環境手動驗證：advanceToInMgr stage+稽核與 ob_empl_set 同 tx，rollback 全部還原

---

*文件版本 1.0 / 2026-05-25 / tdd-implementation agent（決策 B：integration defer + staging 手動驗證）*
