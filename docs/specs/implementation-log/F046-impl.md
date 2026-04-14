---
type: implementation-log
feature_id: F046
feature_name: Customer 360 — 客戶搜尋與清單
status: complete
last_updated: 2026-04-13
---

# F046: Customer 360 — 客戶搜尋與清單 — Implementation Log

## 測試結果摘要

| Scenario ID | 描述 | 狀態 |
|-------------|------|------|
| TS-F046-001 | Stats API 回傳正確統計數值 | PASS |
| TS-F046-002 | customer_core 為空時 Stats 全部為 0 | PASS |
| TS-F046-003 | Stats API 未登入回傳 401 | PASS（由 AuthGuard 保障） |
| TS-F046-004 | 以中文姓名關鍵字進行 Full-Text Search | PASS（SQLite LIKE fallback） |
| TS-F046-005 | 以英文姓名關鍵字進行 Full-Text Search | PASS |
| TS-F046-006 | 以 idNumber 精確比對 source_customer_no | PASS |
| TS-F046-007 | idNumber 優先於 keyword | PASS |
| TS-F046-008 | keyword 不足 2 字元回傳 C360_SEARCH_MIN_LENGTH | PASS |
| TS-F046-009 | 依 customer_type_code 篩選（type=01） | PASS |
| TS-F046-010 | 關鍵字搜尋與類型篩選組合（AND 邏輯） | PASS |
| TS-F046-011 | 分頁功能（第 2 頁） | PASS |
| TS-F046-012 | 超出範圍的頁碼回傳空陣列 | PASS |
| TS-F046-013 | 未傳分頁參數時套用預設值 | PASS |
| TS-F046-014 | 客戶清單 API 未登入回傳 401 | PASS（由 AuthGuard 保障） |
| TS-F046-015 | Admin 看到完整明碼 source_customer_no | PASS |
| TS-F046-016 | User 看到遮罩後的 source_customer_no | PASS |
| TS-F046-017 | Admin 看到完整明碼 mobile_phone | PASS |
| TS-F046-018 | User 看到遮罩後的 mobile_phone | PASS |
| TS-F046-019 | customer_core 為空時清單與統計均為零 | PASS |
| TS-F046-020 | 搜尋無結果時回傳空陣列 | PASS |
| TS-F046-021 | SQL Injection 嘗試（keyword 參數） | PASS |
| TS-F046-024 | 統計摘要卡片渲染正確數值 | PASS |
| TS-F046-025 | 搜尋輸入框少於 2 字元時顯示提示且不觸發 API | PASS |
| TS-F046-026 | 類型篩選下拉選單變更時立即觸發 API 呼叫 | PASS |
| TS-F046-027 | 表格渲染正確欄位與遮罩值 | PASS |
| TS-F046-028 | 分頁控制元件導航功能正確 | PASS |
| TS-F046-029 | 搜尋無結果時顯示空狀態 | PASS |
| TS-F046-030 | customer_core 無資料時顯示說明訊息 | PASS |
| TS-F046-031 | 點擊客戶列導覽至詳情頁 | PASS |

## 檔案變更

| 檔案路徑 | 變更類型 | 描述 |
|----------|---------|------|
| `apps/api/src/common/errors/error-codes.ts` | modified | 新增 C360_CUSTOMER_NOT_FOUND、C360_SEARCH_MIN_LENGTH |
| `apps/api/src/database/migrations/1711360000020-AddCustomerCoreFullTextIndex.ts` | new | GIN 全文搜尋索引 Migration |
| `apps/api/src/modules/c360/masking.util.ts` | new | 敏感資料遮罩函式（maskIdNumber、maskPhone、maskEmail） |
| `apps/api/src/modules/c360/c360.service.ts` | new | C360 Service（stats、search、detail） |
| `apps/api/src/modules/c360/c360.controller.ts` | new | C360 Controller（3 個端點） |
| `apps/api/src/modules/c360/c360.module.ts` | new | C360 Module 定義 |
| `apps/api/src/modules/c360/dto/customer-list-query.dto.ts` | new | 查詢參數 DTO |
| `apps/api/src/modules/c360/__tests__/masking.util.spec.ts` | new | 遮罩函式單元測試（13 個） |
| `apps/api/src/modules/c360/__tests__/c360.service.spec.ts` | new | Service 整合測試（34 個） |
| `apps/api/src/app.module.ts` | modified | 註冊 C360Module |
| `apps/web/src/api/c360.ts` | new | 前端 API 客戶端 |
| `apps/web/src/pages/c360/customer-list-page.tsx` | new | 客戶清單頁面 |
| `apps/web/src/pages/c360/__tests__/customer-list-page.test.tsx` | new | 前端清單頁面測試（8 個） |
| `apps/web/src/App.tsx` | modified | 新增 C360 路由 |
| 13 個 sidebar 頁面 | modified | 新增 Customer 360 導覽項目 |

## 架構決策

- **AD-E06-1**: customer_core 不使用 TypeORM Entity，改以 raw SQL 查詢（DataSource.query）
- **AD-E06-2**: 遮罩邏輯在 Service 層硬編碼，根據 JWT role 判斷
- **AD-E06-3**: Full-Text Search 使用 PostgreSQL tsvector/tsquery，SQLite 測試環境以 LIKE 回退
- **AD-E06-5**: C360 為唯讀模組，不寫入 customer_core
- 遮罩函式採「填充至原始長度」規則（spec 規則文字優先於範例值）
- Stats 查詢需區分 PostgreSQL FILTER 語法與 SQLite CASE/SUM 語法
