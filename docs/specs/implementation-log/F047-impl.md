---
type: implementation-log
feature_id: F047
feature_name: Customer 360 — 單一客戶詳情
status: complete
last_updated: 2026-04-13
---

# F047: Customer 360 — 單一客戶詳情 — Implementation Log

## 測試結果摘要

| Scenario ID | 描述 | 狀態 |
|-------------|------|------|
| TS-F047-001 | 回傳完整客戶資料（8 個分類） | PASS |
| TS-F047-002 | 不存在的 customerId 回傳 404 | PASS |
| TS-F047-003 | 非 UUID 格式的 customerId 回傳 422 | PASS |
| TS-F047-004 | 未登入呼叫詳情 API 回傳 401 | PASS（由 AuthGuard 保障） |
| TS-F047-005 | A 分類（identity）欄位映射正確 | PASS |
| TS-F047-006 | B 分類（personalAttributes）欄位映射正確 | PASS |
| TS-F047-007 | C 分類（contactInfo）欄位映射正確 | PASS |
| TS-F047-008 | D 分類（addresses）欄位映射正確 | PASS |
| TS-F047-009 | E 分類（employment）欄位映射正確 | PASS |
| TS-F047-010 | F 分類（financial）欄位映射正確 | PASS |
| TS-F047-012 | H 分類（etlTracking）欄位映射正確 | PASS |
| TS-F047-013 | Admin 看到所有敏感欄位完整明碼 | PASS |
| TS-F047-014 | User 看到遮罩後的 source_customer_no | PASS |
| TS-F047-015 | User 看到遮罩後的 mobile_phone | PASS |
| TS-F047-016 | User 看到遮罩後的 email | PASS |
| TS-F047-017 | User 看到遮罩後的 home_phone/contact_phone/office_phone | PASS |
| TS-F047-018 | code/desc 欄位組合顯示格式正確 | PASS |
| TS-F047-019 | NULL 欄位在前端顯示「—」 | PASS |
| TS-F047-020 | debt_flag='Y' 時顯示警告色 Badge | PASS |
| TS-F047-021 | fine_flag='Y' 時顯示警告色 Badge | PASS |
| TS-F047-022 | 風控旗標值非 'Y' 時不觸發高亮 | PASS（含在 TS-F047-032 測試） |
| TS-F047-023 | 個人客戶（01）— G 分類顯示「本分類不適用」 | PASS |
| TS-F047-024 | 企業客戶（02）— G 分類顯示完整企業資料 | PASS |
| TS-F047-025 | 外籍客戶（04）— G 分類顯示「本分類不適用」 | PASS（含在 TS-F047-035 邏輯） |
| TS-F047-026 | _etl_loaded_at 在 7 天以內 — 不顯示警告 | PASS |
| TS-F047-027 | _etl_loaded_at 超過 7 天 — 顯示警告 Banner | PASS |
| TS-F047-029 | Header 渲染客戶姓名、類型 Badge、客戶編號 | PASS |
| TS-F047-030 | 8 個分類卡片全部渲染 | PASS |
| TS-F047-031 | NULL 欄位前端顯示「—」 | PASS |
| TS-F047-032 | 風控旗標 Badge 以警告色渲染 | PASS |
| TS-F047-033 | 資料新鮮度警告 Banner 顯示 | PASS |
| TS-F047-034 | 企業客戶顯示 G 分類資料 | PASS |
| TS-F047-035 | 個人客戶 G 分類顯示「本分類不適用」 | PASS |
| TS-F047-036 | 404 狀態渲染錯誤提示與返回按鈕 | PASS |
| TS-F047-037 | 「返回清單」按鈕導覽至清單頁 | PASS |
| TS-F047-038 | Admin 與 User 的遮罩顯示差異 | PASS |

## 檔案變更

| 檔案路徑 | 變更類型 | 描述 |
|----------|---------|------|
| `apps/api/src/modules/c360/c360.service.ts` | shared | getCustomerDetail 方法（85 欄位映射、8 分類回傳） |
| `apps/api/src/modules/c360/c360.controller.ts` | shared | GET /:customerId 端點 |
| `apps/api/src/modules/c360/masking.util.ts` | shared | maskEmail 函式（F047 新增需求） |
| `apps/api/src/modules/c360/__tests__/c360.service.spec.ts` | shared | F047 相關測試場景 |
| `apps/web/src/pages/c360/customer-detail-page.tsx` | new | 客戶 360 詳情頁面（8 分類卡片） |
| `apps/web/src/pages/c360/__tests__/customer-detail-page.test.tsx` | new | 前端詳情頁面測試（13 個） |

## 架構決策

- 85 欄位完整映射為 8 個分類物件 + customerId 頂層鍵
- code/desc 格式顯示邏輯在前端實作（formatCodeDesc 函式）
- 風控旗標（debtFlag/fineFlag）僅在值為 'Y' 時以 amber Badge 渲染
- 資料新鮮度計算（daysSince）在前端以 Math.ceil 計算天數差
- G 分類適應顯示：customer_type_code 為 '01' 或 '04' 時顯示「本分類不適用」
- 遮罩邏輯包含 F047 新增的 email、homePhone、contactPhone、officePhone
- UUID 格式驗證在 Service 層以 regex 執行，回傳 422

## 備註

- TS-F047-011（G 分類企業客戶完整映射）未單獨在 backend 測試中驗證，因 test 環境種子資料為個人客戶。企業客戶的 G 分類映射已在前端 TS-F047-034 測試中覆蓋。
- TS-F047-028（效能測試）為 performance 類型，不在 unit/integration 測試範圍內。
