---
type: implementation-log
feature_id: F044
feature_name: ETL Target Load — fullMode 全量重寫
status: complete
last_updated: 2026-04-15
---

# F044: fullMode 全量重寫 — 實作日誌

## 測試結果摘要

| Scenario ID | 描述 | 狀態 |
|-------------|------|------|
| TS-F044-021 | fullMode=true TRUNCATE + INSERT，無 ON CONFLICT | PASS |
| TS-F044-022 | fullMode=true + isTestRun=true 不執行 TRUNCATE（安全防護） | PASS |
| TS-F044-023 | fullMode=false（或未設定）維持 UPSERT 行為，向後相容 | PASS |
| TS-F044-024 | fullMode=true INSERT 失敗，TRUNCATE 已執行，節點拋出錯誤 | PASS |
| TS-F044-025 | fullMode=true 資料品質閘門（ghost gate）仍然生效 | PASS |

## 修改檔案

| 檔案路徑 | 變更類型 | 描述 |
|----------|---------|------|
| `apps/api/src/modules/etl/engine/handlers/target-load-handler.ts` | modified | 新增 fullMode 分支：TRUNCATE + batch INSERT（無 ON CONFLICT） |
| `apps/api/src/modules/etl/__tests__/engine-target-load.spec.ts` | modified | 新增 5 個 fullMode 測試場景（TS-F044-021~025） |
| `scripts/seed-pipeline-definition.json` | modified | tl1 節點新增 `"fullMode": false`（預設值，向後相容） |

## 架構決策

- `fullMode` 從 `context.node.data.fullMode` 讀取，嚴格 `=== true` 判斷，未設定時預設為 UPSERT 模式
- fullMode 與 UPSERT 共用 ETL 追蹤欄位填充、dedup table 建立、ghost gate 資料品質閘門
- TRUNCATE 與 INSERT 分開執行：TRUNCATE 失敗拋出 `fullMode TRUNCATE 失敗` 錯誤；INSERT 失敗拋出 `fullMode INSERT 批次失敗` 錯誤
- test_run 時無論 fullMode 設定，皆跳過寫入（安全防護邏輯在 fullMode 讀取前）

## 備註

- 2 個 pre-existing BUG-2 測試失敗（TS-F044-018、019）與 fullMode 無關，為既有待修 issue
