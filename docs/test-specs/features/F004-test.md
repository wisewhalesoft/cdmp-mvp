---
type: test-design-feature
feature_id: F004
feature_name: 建立帳號
priority: P0-MVP
related_spec: /specs/features/F004-create-account.md
last_updated: 2026-04-02
---

# F004: 建立帳號 — 測試設計

---

## Acceptance Test Design

### AC-1：成功建立帳號

| 項目 | 內容 |
|------|------|
| Given | Admin 已登入（ADMIN_ACTIVE） |
| When | 呼叫 `POST /api/accounts`，body: {name, email, password, role} |
| Then | HTTP 201、回應含新建帳號資訊（id, name, email, role=指定值, status=active） |
| 驗證步驟 | 1. 確認回應 HTTP 201<br>2. 回應不含 password_hash<br>3. email 已轉為小寫<br>4. status = active<br>5. 新帳號出現於 GET /api/accounts 清單中 |
| 測試資料 | ADMIN_ACTIVE Token + 新帳號資料 |

### AC-2：防止重複 Email（大小寫不敏感）

| 項目 | 內容 |
|------|------|
| Given | admin@cdmp.test 已存在 |
| When | 以 ADMIN@CDMP.TEST 建立帳號 |
| Then | HTTP 409、ACCOUNT_EMAIL_EXISTS |
| 驗證步驟 | 1. 確認 HTTP 409<br>2. 確認帳號未被建立 |
| 測試資料 | ADMIN_ACTIVE Token + 重複 Email |

### AC-3：欄位驗證

| 項目 | 內容 |
|------|------|
| Given | Admin 已登入 |
| When | 提交不合規資料（缺少必填欄位、格式錯誤） |
| Then | HTTP 422、VALIDATION_ERROR，details 列出各欄位錯誤 |
| 驗證步驟 | 1. 確認 HTTP 422<br>2. details 陣列包含對應欄位的錯誤訊息 |

### AC-4：角色選單顯示全部 8 種角色（更新自 US-010 AC-4）

| 項目 | 內容 |
|------|------|
| Given | Admin 在建立帳號表單 |
| When | Admin 展開角色下拉選單 |
| Then | 選單顯示全部 8 種角色：管理者（Admin）、使用者（User）、業務、行銷（企劃）、客服、分析師、主管、後端作業（作服） |
| 驗證步驟 | 1. 確認選項數量 = 8<br>2. 逐一核對顯示文字（含括號別名）<br>3. 確認選項資料來自 GET /api/roles（動態載入） |
| 測試資料 | F045 Seed Data 已初始化 |

### AC-5：指派業務角色建立帳號（新增自 US-010 AC-5）

| 項目 | 內容 |
|------|------|
| Given | Admin 在建立帳號表單 |
| When | 選擇業務角色（如「分析師」）並填寫其他必填欄位後送出 |
| Then | HTTP 201，帳號建立成功，role_code 記錄為 analyst；帳號清單中角色欄位顯示「分析師」 |
| 驗證步驟 | 1. 確認 HTTP 201<br>2. 回應中 role = "analyst"<br>3. GET /api/accounts 清單中該帳號的 role.displayName = "分析師" |
| 測試資料 | ADMIN_ACTIVE Token + {name, email, password, role: "analyst"} |

---

## Test Scenarios

### Positive Scenarios

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F004-001 | 成功建立 Admin 帳號 | AC-1 | Integration | Admin 已登入 | 1. POST /api/accounts {name, email, password, role: admin} | HTTP 201，帳號建立成功 |
| TS-F004-002 | 成功建立 User 帳號 | AC-1 | Integration | Admin 已登入 | 1. POST /api/accounts {name, email, password, role: user} | HTTP 201，role=user |
| TS-F004-003 | Email 自動轉小寫 | AC-2, BR-2 | Integration | Admin 已登入 | 1. POST /api/accounts {email: "Test@CDMP.Test"} | HTTP 201，回應中 email = "test@cdmp.test" |
| TS-F004-009 | 成功建立 analyst 帳號 | AC-5 / US-010 AC-5 | Integration | Admin 已登入，F045 Seed Data 存在 | 1. POST /api/accounts {name, email, password, role: analyst} | HTTP 201，role="analyst"；GET /api/accounts 清單顯示「分析師」 |
| TS-F004-010 | 成功建立 backend_ops 帳號 | AC-5 / US-010 AC-5 | Integration | Admin 已登入，F045 Seed Data 存在 | 1. POST /api/accounts {name, email, password, role: backend_ops} | HTTP 201，role="backend_ops"；清單顯示「後端作業（作服）」 |
| TS-F004-011 | 成功建立 marketing 帳號 | AC-5 / US-010 | Integration | Admin 已登入，F045 Seed Data 存在 | 1. POST /api/accounts {name, email, password, role: marketing} | HTTP 201，role="marketing"；清單顯示「行銷（企劃）」 |

### Negative Scenarios

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F004-004 | Email 重複（大小寫不敏感） | AC-2 | Integration | admin@cdmp.test 已存在 | 1. POST /api/accounts {email: "ADMIN@CDMP.TEST"} | HTTP 409，ACCOUNT_EMAIL_EXISTS |
| TS-F004-005 | 非 Admin 嘗試建立帳號 | BR-4 | Integration | USER_ACTIVE 已登入 | 1. 以 User Token 呼叫 POST /api/accounts | HTTP 403，AUTH_FORBIDDEN |
| TS-F004-006 | 無效角色值（manager） | AC-3 / US-010 測試案例 10 | Integration | Admin 已登入 | 1. POST /api/accounts {role: "manager"} | HTTP 422，VALIDATION_INVALID_ROLE |
| TS-F004-012 | 業務角色 Token 嘗試建立帳號 | BR-4 | Integration | analyst 角色帳號已登入 | 1. 以業務角色 Token 呼叫 POST /api/accounts | HTTP 403，AUTH_FORBIDDEN |

### Boundary Scenarios

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F004-007 | 密碼恰好 8 字元 | BR-7 | Integration | Admin 已登入 | 1. POST /api/accounts {password: "12345678"} | HTTP 201，建立成功 |
| TS-F004-008 | 密碼僅 7 字元 | BR-7 | Integration | Admin 已登入 | 1. POST /api/accounts {password: "1234567"} | HTTP 422，VALIDATION_PASSWORD_LENGTH |

### 前端場景

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F004-FE-001 | 角色下拉選單顯示 8 種角色 | AC-4 / US-010 AC-4 | E2E | Admin 已登入，Seed Data 存在 | 1. 開啟建立帳號頁<br>2. 展開角色下拉選單 | 共 8 個選項，文字為：管理者（Admin）、使用者（User）、業務、行銷（企劃）、客服、分析師、主管、後端作業（作服） |
| TS-F004-FE-002 | 選擇業務角色「分析師」後送出 | AC-5 / US-010 AC-5 | E2E | Admin 已登入 | 1. 填寫表單，角色選「分析師」<br>2. 點擊建立帳號 | 顯示成功訊息；帳號清單中新帳號角色欄位顯示「分析師」 |
