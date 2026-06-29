---
last-updated: 2026-06-26
version: v1.0
change-summary: "處長（section_chief）由完全封鎖升級為 Stage 0 試算頁唯讀存取，範圍限縮至其轄區部門（getScopeDeptCode）。調整 DirectorGuard 攔截邏輯，僅允許部長 + admin + section_chief 進入，section_chief 資料層強制 dept scope filter。"
---

# US-168：處長可唯讀存取 Stage 0 試算頁（部門 scope 隔離）

> **Story ID**：US-168
> **Epic**：[E07 — 客戶名單分派](epic-brief.md)
> **模組**：M07 角色與可見範圍（影響 M01 Stage 0 功能）
> **優先級**：Must Have
> **階段**：Phase 2（Advanced）
> **預估點數**：5
> **Feature**：Stage 0 試算頁業務化重設計

---

## 背景說明

目前 Stage 0 試算頁 API（`GET /api/v1/assignment/stage0/daily-estimate` 及 `GET /api/v1/assignment/list-definitions/:listNo/estimate`）使用 `@RequireDirector` Guard，`businessRole = 'section_chief'` 的帳號一律回 403，前端 `<DirectorRoute>` 也完全阻擋處長進入試算頁。

Stage 0 試算頁改版後（US-166 / US-167）以「部門維度每日分派量」為核心，處長需要查看自己轄區的每日工作量估算，以評估業務員負載是否合理。本 Story **刻意將處長提升為 Stage 0 試算頁的唯讀使用者**，並確保處長永遠只能看到自己轄區部門的數字，不能看到任何其他部門的資料。

處長轄區判定使用現有 `SectionChiefScopeService.getScopeDeptCode(userId)` 方法（email → ob_emphire → dept_code where jfun_nm='處長' AND resign_date IS NULL），對應 `ob_dept_pct.obdeptid`。

---

## User Story

**As a** 業務處長（section_chief）
**I want** 查看 Stage 0 試算頁中屬於我轄區部門的每日分派量估算
**So that** 我可以評估業務員的電訪工作量是否合理，而不必等部長整理報告

---

## 驗收標準

### AC-1：處長可進入 Stage 0 試算頁（取消完全封鎖）

- **Given** 使用者登入後 `businessRole = 'section_chief'`
- **When** 使用者導航至 `/assignment/estimate`（或前端 `<Stage0EstimatePage>` 路由）
- **Then** 頁面**成功載入**，不被導向「無存取權限」頁（取消現行的 `<DirectorRoute>` 完全封鎖）
- **And** 頁面頂端顯示「唯讀模式：僅顯示您轄區部門（{dept_name}）的預估資料」說明 banner
- **And** 頁面為純唯讀，不顯示任何可修改設定的操作按鈕

### AC-2：處長僅看到自己轄區部門的資料

- **Given** 處長登入，`SectionChiefScopeService.getScopeDeptCode(userId)` 回傳 `dept_code = 'D003'`
- **When** 頁面載入部門每日預估件數表格（US-166 / US-167 的彙總結果）
- **Then** 表格中只顯示 `dept_code = 'D003'` 的部門資料行
- **And** 其他部門（D001、D002、D004…）的預估件數列**完全不顯示**（包括列本身，不僅是數字遮罩）
- **And** 頁面不顯示「全部門合計」行（因處長看不到全部門，合計無意義）

### AC-3：處長不得透過 API 存取其他部門資料（後端強制 scope filter）

- **Given** 處長已取得有效 JWT，`getScopeDeptCode` 回傳 `'D003'`
- **When** 處長透過任何手段（包括直接呼叫 API）請求 Stage 0 daily-estimate 或 list-estimate 資料
- **Then** 後端 service 層對回傳資料強制套用 dept scope filter，**只包含 D003 的計算結果**
- **And** API **不**回 403（允許存取），但回傳資料被限縮至 D003 轄區
- **And** filter 行為記錄於 server log（`[Stage0Estimate] section_chief scope applied dept_code=D003`），方便稽核

### AC-4：部長 / admin 不受 scope 限制，查看全部門

- **Given** 使用者登入後 `businessRole = 'director'` 或 `role = 'admin'`
- **When** 進入 Stage 0 試算頁
- **Then** 頁面顯示**所有部門**的每日預估件數，不套用任何 dept scope filter
- **And** 現有 `@RequireDirector` Guard 對「部長 / admin」的行為維持不變

### AC-5：處長轄區判定失敗時的錯誤處理

- **Given** 處長登入，但 `getScopeDeptCode(userId)` 回傳 `null`（ob_emphire 中找不到對應 email，或 `jfun_nm ≠ '處長'`，或員工已離職）
- **When** 頁面載入
- **Then** 頁面顯示提示：「無法識別您的轄區部門，請聯繫系統管理員確認帳號 ob_emphire 設定」
- **And** 所有估算數值顯示「—」，後端 API 回傳空陣列（不 crash，不回 500）

### AC-6：處長存取不暴露其他部門資訊（安全性要求）

- **Given** 處長使用任何前端 / API 手段嘗試取得非轄區部門的估算數字
- **When** 請求到達後端
- **Then** 後端 scope filter 確保非轄區部門資料**一律不包含在 response 中**
- **And** Response 結構不洩露其他部門的名稱、件數、或任何衍生指標（人均件數等）
- **And** 此隔離行為不依賴前端遮罩實作（前端遮罩僅為 UX，後端 filter 為安全邊界）

---

## 測試案例

### TC-168-01：處長成功載入試算頁（取消封鎖）

- **Given**：帳號 businessRole = 'section_chief'，getScopeDeptCode 回傳 'D003'
- **When**：導航至 /assignment/estimate
- **Then**：頁面 HTTP 200，顯示「唯讀模式：僅顯示 D003 部門」banner；不出現 403 / 無存取權限頁

### TC-168-02：處長看不到非轄區部門資料

- **Given**：系統有 D001、D002、D003 三個部門；帳號 scope = D003
- **When**：試算頁呈現部門每日件數表格
- **Then**：表格只有 D003 資料行；D001、D002 完全不出現

### TC-168-03：API 層直接呼叫仍只回傳轄區資料

- **Given**：處長 JWT，已知 D001 dept_code
- **When**：直接 curl GET /api/v1/assignment/stage0/daily-estimate 帶上 D001 相關參數（如有 dept 查詢參數）
- **Then**：response body 只包含 D003 資料，不包含 D001 資料；status 200（非 403）

### TC-168-04：getScopeDeptCode 回 null 時顯示錯誤提示

- **Given**：帳號 businessRole = 'section_chief'，但 ob_emphire 無對應 email 記錄
- **When**：頁面載入
- **Then**：顯示「無法識別轄區部門」提示文案，所有數值顯示「—」，後端 API 回空陣列

### TC-168-05：部長查看全部門不受 scope 限制

- **Given**：帳號 businessRole = 'director'
- **When**：試算頁呈現部門每日件數表格
- **Then**：D001、D002、D003 全部顯示，全部門合計行正常顯示

---

## 依賴關係

- **Blocked By**：US-166（試算頁需先有部門維度視角，處長才有意義進入）、US-167（部門件數計算公式，處長看的是 scope-filtered 後的同一資料集）；`SectionChiefScopeService.getScopeDeptCode` 已存在於 codebase
- **Blocks**：US-169（可行性指標的處長 scope 繼承本 Story 的 scope filter 邏輯）

---

## Definition of Done

- [ ] AC-1 ~ AC-6 全部通過
- [ ] TC-168-01 ~ TC-168-05 全部通過
- [ ] 處長存取 API 後端 scope filter regression test（TC-168-03，驗證非 D003 資料不在 response 中）
- [ ] getScopeDeptCode 回 null 時不 crash（TC-168-04）
- [ ] 部長 / admin bypass filter 不受影響（TC-168-05）
- [ ] `tsc --noEmit -p tsconfig.build.json` 乾淨通過
- [ ] 單元測試覆蓋率 ≥ 80%
- [ ] Code review 通過
- [ ] 文件已更新（F049 spec 新增處長 scope filter 章節；F002 auth spec 同步更新 Stage 0 存取矩陣）

---

## 相關文件

- **Epic Brief**：[E07 Epic Brief](epic-brief.md)
- **相關 Stories**：US-100（部長角色定義）、US-101（處長角色定義，本 Story 擴展其可存取範圍）、US-166（彙總視角，處長看的就是 scope-filtered 版本）
- **服務**：`apps/api/src/modules/assignment/services/section-chief-scope.service.ts`（getScopeDeptCode 方法）
- **Spec**：`docs/specs/features/F049-stage0-daily-estimate.md`（需新增 section_chief scope 章節）、`docs/specs/features/F002-auth-permission.md`（需同步更新 Stage 0 存取矩陣）
