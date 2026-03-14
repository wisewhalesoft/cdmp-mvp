---
type: implementation-log
feature_id: F011
feature_name: 新增資料來源
status: complete
last_updated: 2026-03-14
---

# F011: 新增資料來源 — Implementation Log

## Test Results Summary

| Scenario ID | Description | Status |
|-------------|------------|--------|
| TS-F011-001 | 新增 MySQL 資料來源 | PASS |
| TS-F011-002 | 新增 PostgreSQL 資料來源 | PASS |
| TS-F011-003 | 新增 SQL Server 資料來源 | PASS |
| TS-F011-004 | 密碼加密儲存驗證（AES-256-GCM 格式） | PASS |
| TS-F011-005 | 名稱重複 409 | PASS |
| TS-F011-006 | 非 Admin 新增 403 | PASS |
| TS-F011-007 | 無效類型 422 | PASS |
| TS-F011-008 | Port 邊界值（0→422, 1→201, 65535→201, 65536→422） | PASS |

單元測試：CryptoUtil 5 tests PASS, DatasourceService 3 tests PASS
E2E 測試：11 tests PASS
全套回歸測試：78 unit + 89 E2E = 167 tests 全數通過

## Files Changed

| File Path | Change Type | Description |
|-----------|------------|-------------|
| `packages/shared/src/index.ts` | modified | 新增 F011 共享型別（DatasourceType, CreateDatasourceRequest/Response）與錯誤碼 |
| `apps/api/src/common/errors/error-codes.ts` | modified | 新增 DS_NAME_EXISTS, DS_NOT_FOUND, VALIDATION_INVALID_TYPE, VALIDATION_PORT_RANGE |
| `apps/api/src/common/crypto/crypto.util.ts` | new | AES-256-GCM 加密/解密工具，格式 iv:authTag:ciphertext（Base64） |
| `apps/api/src/common/crypto/crypto.util.spec.ts` | new | CryptoUtil 單元測試（5 tests） |
| `apps/api/src/database/entities/datasource.entity.ts` | new | Datasource Entity（UUID PK, 軟刪除, FK to User） |
| `apps/api/src/modules/datasource/dto/create-datasource.dto.ts` | new | 建立資料來源 DTO（class-validator 驗證） |
| `apps/api/src/modules/datasource/datasource.service.ts` | new | DatasourceService（名稱唯一性、密碼加密、建立資料來源） |
| `apps/api/src/modules/datasource/datasource.controller.ts` | new | DatasourceController（POST /datasources, Admin Only） |
| `apps/api/src/modules/datasource/datasource.module.ts` | new | DatasourceModule |
| `apps/api/src/modules/datasource/datasource.service.spec.ts` | new | Service 單元測試（3 tests） |
| `apps/api/src/app.module.ts` | modified | 匯入 DatasourceModule、Datasource Entity |
| `apps/api/test/datasource.e2e-spec.ts` | new | E2E 測試（11 tests，涵蓋所有 TS-F011 場景） |
| `apps/api/src/database/entities/user.entity.ts` | modified | `timestamp` → `datetime`（修復 better-sqlite3 相容性） |
| `apps/api/src/database/entities/password-reset-token.entity.ts` | modified | `timestamp` → `datetime`（修復 better-sqlite3 相容性） |

## Architectural Decisions

1. **CryptoUtil 使用靜態方法**：與 HashUtil 保持一致的設計風格，使用 `process.env.AES_ENCRYPTION_KEY` 讀取金鑰
2. **AES-256-GCM 儲存格式**：`iv:authTag:ciphertext`（Base64 編碼），每次加密產生隨機 IV 確保安全性
3. **名稱唯一性檢查使用 QueryBuilder**：透過 `LOWER()` 實現 case-insensitive 比較，並排除軟刪除記錄
4. **Entity 使用 `datetime` 取代 `timestamp`**：TypeORM 的 better-sqlite3 driver 不支援 `timestamp` 類型，使用 `datetime` 可同時相容 PostgreSQL 和 SQLite
5. **DatasourceModule 自行註冊 TokenBlocklist 和 User**：AuthGuard 需要這些 Repository，遵循 AccountsModule 的相同模式

## Bug Fix（附帶修復）

- **better-sqlite3 `timestamp` 不相容問題**：User.password_changed_at 和 PasswordResetToken.used_at 在 F009 實作時使用了 `timestamp` 類型，導致所有使用 better-sqlite3 的測試無法執行。已統一改為 `datetime` 類型，修復後全部 89 個 E2E 測試恢復正常。
