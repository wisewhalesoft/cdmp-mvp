---
type: implementation-log
feature_id: F001
feature_name: Admin 登入（後端）
status: complete
last_updated: 2026-03-13
---

# F001: Admin 登入 — 後端實作紀錄

## 測試結果摘要

### Unit Tests (14 個)

| Scenario ID | 描述 | 狀態 |
|-------------|------|------|
| TS-F001-001 | Admin 正確憑證 → 回傳 { token, user } | PASS |
| TS-F001-002 | rememberMe=true → JWT exp = 30 天 | PASS |
| TS-F001-003 | rememberMe=false → JWT exp = 8 小時 | PASS |
| TS-F001-004 | 錯誤密碼 → UnauthorizedException (AUTH_INVALID_CREDENTIALS) | PASS |
| TS-F001-005 | 不存在 Email → UnauthorizedException（回應與錯誤密碼一致） | PASS |
| TS-F001-006 | 帳號已停用 → ForbiddenException (AUTH_ACCOUNT_DISABLED) | PASS |
| TS-F001-007 | SQL injection 字串 → TypeORM parameterized query 安全處理 | PASS |
| HASH-001 | bcrypt hash 產生有效 hash | PASS |
| HASH-002 | bcrypt compare 正確匹配 | PASS |
| HASH-003 | cost factor >= 10 | PASS |
| JWT-001 | 產生 valid JWT token | PASS |
| JWT-002 | JWT payload 包含 userId, role, iat, exp | PASS |
| JWT-003 | 預設有效期 8h | PASS |
| JWT-004 | rememberMe 有效期 30d | PASS |

### Integration Tests (8 個)

| Scenario ID | 描述 | 狀態 |
|-------------|------|------|
| E2E-001 | POST /api/v1/auth/login 正確憑證 → 200 + token + user | PASS |
| E2E-002 | POST /api/v1/auth/login 錯誤密碼 → 401 + AUTH_INVALID_CREDENTIALS | PASS |
| E2E-003 | POST /api/v1/auth/login 不存在 Email → 401 + AUTH_INVALID_CREDENTIALS | PASS |
| E2E-004 | POST /api/v1/auth/login 停用帳號 → 403 + AUTH_ACCOUNT_DISABLED | PASS |
| E2E-005 | POST /api/v1/auth/login 空 email → 400 + VALIDATION_ERROR | PASS |
| E2E-006 | POST /api/v1/auth/login 空 password → 400 + VALIDATION_ERROR | PASS |
| E2E-007 | POST /api/v1/auth/login 記住我 → 200 + JWT exp 30d | PASS |
| E2E-008 | Rate limiting → 第 6 次 → 429 | PASS |

## 檔案變更

| 檔案路徑 | 變更類型 | 描述 |
|----------|---------|------|
| `apps/api/src/database/entities/user.entity.ts` | new | User entity (UUID PK, email unique, role, status) |
| `apps/api/src/common/hash/hash.util.ts` | new | HashUtil: bcrypt hash/compare, cost=10 |
| `apps/api/src/common/jwt/jwt.util.ts` | new | JwtUtil: NestJS JwtService wrapper, 8h/30d 到期 |
| `apps/api/src/common/errors/error-codes.ts` | new | 錯誤碼與中文錯誤訊息常數 |
| `apps/api/src/common/filters/http-exception.filter.ts` | new | 統一錯誤回應格式 { error, message } |
| `apps/api/src/modules/auth/dto/login.dto.ts` | new | LoginDto: class-validator 驗證 |
| `apps/api/src/modules/auth/auth.service.ts` | new | AuthService.login(): 查 user → bcrypt → 狀態檢查 → JWT |
| `apps/api/src/modules/auth/auth.controller.ts` | new | POST /auth/login endpoint, @HttpCode(200) |
| `apps/api/src/modules/auth/auth.module.ts` | new | Auth NestJS module (TypeORM, JWT) |
| `apps/api/src/app.module.ts` | new | 根模組 (ConfigModule, TypeORM SQLite/PG, ThrottlerModule) |
| `apps/api/src/main.ts` | new | NestJS bootstrap, ValidationPipe, prefix api/v1 |
| `apps/api/src/common/__tests__/hash.util.spec.ts` | new | HashUtil 單元測試 (3 個) |
| `apps/api/src/common/__tests__/jwt.util.spec.ts` | new | JwtUtil 單元測試 (4 個) |
| `apps/api/src/modules/auth/__tests__/auth.service.spec.ts` | new | AuthService 單元測試 (7 個) |
| `apps/api/test/auth.e2e-spec.ts` | new | 整合測試 (8 個, supertest + in-memory SQLite) |
| `apps/api/test/seeds/test-data.ts` | new | 測試種子帳號資料 |

## 架構決策

- **SQLite in-memory** 作為測試 DB：AppModule 透過 `DB_TYPE` 環境變數切換 SQLite/PostgreSQL，測試預設使用 `better-sqlite3` + `:memory:`
- **Rate Limiting 隔離測試**：功能測試與 Rate Limiting 測試使用獨立的 NestJS app 實例，避免 throttle 計數器互相干擾
- **HttpExceptionFilter 處理順序**：429 (Throttle) → 400 (Validation) → 自訂錯誤格式 → 預設，確保各類錯誤正確格式化
- **@HttpCode(200)**：NestJS `@Post()` 預設回傳 201，登入端點明確設為 200
- **Email 小寫化**：AuthService 在查詢前將 email 轉為小寫，確保大小寫不敏感比對

## 業務規則驗證

- BR-001: bcrypt compare, cost=10 -- PASS
- BR-002: 無效憑證統一訊息「Email 或密碼錯誤」 -- PASS
- BR-003: 帳號停用檢查在密碼驗證之後 -- PASS (AuthService 先 compare 後 check status)
- BR-004: Rate Limiting 5 次/分鐘/IP -- PASS (ThrottlerModule)
