# CDMP MVP — 企業客戶資料治理平台

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript + Vite + Tailwind CSS |
| Backend | NestJS 10 + TypeScript + TypeORM |
| Database | PostgreSQL 16 |
| Testing | Vitest + Supertest + Testing Library |
| Infrastructure | Docker Compose |

## Project Structure

```
cdmp-mvp/
├── apps/
│   ├── api/                # NestJS backend (port 3000)
│   │   └── Dockerfile
│   └── web/                # React SPA frontend (port 5173)
│       └── Dockerfile
├── packages/
│   └── shared/             # Shared types (DTO, error codes)
├── docs/                   # Specs, test designs, diagrams
├── docker-compose.yml      # Development environment
└── docker-compose.test.yml # Test environment
```

## Prerequisites

- Docker & Docker Compose
- Node.js 20 LTS (local development only)
- npm 9+ (local development only)

---

## Docker

### Development — 一鍵啟動 (DB + API + Frontend)

```bash
# 啟動所有服務 (PostgreSQL + API + Frontend)
docker compose up -d

# 首次啟動需執行 Seed 建立測試帳號
docker compose --profile seed up seed

# E07 計分卡 6 表初始化（從 reference/DumpData 載入；冪等：表為空才 INSERT）
docker compose --profile data-seed up data-seed
```

啟動完成後開啟瀏覽器：
- Frontend: http://localhost:5173
- API: http://localhost:3000/api/v1

| Service | Container | Port | Description |
|---------|-----------|------|-------------|
| postgres | cdmp-postgres | 5432 | PostgreSQL 16 (cdmp_dev) |
| api | cdmp-api | 3000 | NestJS backend (hot reload via volume mount) |
| web | cdmp-web | 5173 | React frontend (HMR via volume mount) |
| seed | cdmp-seed | — | 一次性 seed script — 測試帳號（需手動觸發） |
| data-seed | cdmp-data-seed | — | 一次性 seed script — E07 計分卡 6 表初始化資料（需手動觸發） |

```bash
# 停止所有服務
docker compose down

# 停止並刪除 DB 資料
docker compose down -v

# 依賴變更後重新建置
docker compose up -d --build

# 查看即時 log
docker compose logs -f api
```

### 正式部署 — 一鍵 Bootstrap（Production）

正式/類正式環境（`NODE_ENV=production`，關閉 `synchronize`，schema 由 migration 提供）。
`bootstrap` 冪等，一次建好：**全部資料表**＋帳號＋資料來源＋擷取任務＋ETL Pipeline＋篩選欄位＋計分卡設定。
（真實業務資料仍需之後接來源跑 ETL / 月跑才會有。）

```bash
# 1) 先只起 DB（fresh 部署可先 docker compose down -v 清空 volume），等 healthy
docker compose up -d postgres

# 2) 一鍵 bootstrap：migration(建全表+篩選欄位) → seed(帳號) → seed-datasource(env) → data-seed(計分卡/pipeline/擷取任務)
#    OB 來源連線用 OB_DS_* 帶入；未帶則建 placeholder（部署後於 UI 補連線）
NODE_ENV=production \
OB_DS_HOST=<OB主機> OB_DS_DATABASE=<OB庫> OB_DS_USERNAME=<帳號> OB_DS_PASSWORD=<密碼> \
AES_ENCRYPTION_KEY=<64位hex> JWT_SECRET=<jwt密鑰> \
docker compose --profile bootstrap up bootstrap --build --abort-on-container-exit

# 3) 起 api / worker / web（synchronize 已關，schema 來自 migration baseline）
NODE_ENV=production AES_ENCRYPTION_KEY=<同上> JWT_SECRET=<同上> docker compose up -d
```

> - `AES_ENCRYPTION_KEY` 在 bootstrap 與 api/worker 之間**必須一致**（datasource 密碼加解密），否則 UI 測試連線會失敗。
> - migration baseline（`1711360000000-BaselineSchema` + `1711360000001-BaselineReferenceData`）為 schema 與篩選欄位/角色的唯一來源；計分卡 6 表由 `data-seed` 從 `seeds/data/*.json` 灌。
> - 重跑 `bootstrap` 安全（冪等）。本機開發不需此流程：`NODE_ENV` 預設 `development`，`docker compose up -d` 仍以 `synchronize` 建表。

### Test — 一鍵跑測試

測試環境使用獨立的 `docker-compose.test.yml`，透過 `--profile` 選擇要跑的測試範圍。

```bash
# 跑全部後端測試 (Unit 14 + E2E 8 = 22 tests)
docker compose -f docker-compose.test.yml --profile all up test-all --build --abort-on-container-exit

# 只跑後端 E2E 測試 (in-memory SQLite，不需 DB)
docker compose -f docker-compose.test.yml --profile e2e up api-e2e --build --abort-on-container-exit

# 只跑前端測試 (23 tests)
docker compose -f docker-compose.test.yml --profile unit up web-test --build --abort-on-container-exit

# 只跑後端 Unit 測試 (需要 postgres-test)
docker compose -f docker-compose.test.yml --profile unit up api-test --build --abort-on-container-exit
```

| Profile | Service | Tests | DB Required |
|---------|---------|-------|-------------|
| `all` | test-all | Backend Unit (14) + E2E (8) | No (SQLite in-memory) |
| `e2e` | api-e2e | Backend E2E (8) | No (SQLite in-memory) |
| `unit` | api-test | Backend Unit (14) | Yes (postgres-test:5433) |
| `unit` | web-test | Frontend (23) | No |

測試完成後容器會自動停止（`--abort-on-container-exit`）。

---

## Local Development (without Docker)

```bash
# 1. Install dependencies
npm install

# 2. Start PostgreSQL only
docker compose up -d postgres

# 3. Seed database (first time only)
cd apps/api
npx ts-node -r tsconfig-paths/register src/database/seeds/seed.ts
cd ../..

# 4. Start backend API (port 3000)
npm run api:dev

# 5. Open another terminal — start frontend (port 5173)
npm run web:dev
```

### Running Tests Locally

```bash
# All tests
npm test

# Backend unit tests
npm run api:test

# Backend E2E tests (in-memory SQLite, no DB required)
cd apps/api && npx vitest run --config vitest.e2e.config.ts

# Frontend tests
npm run web:test
```

---

## E07 計分卡初始資料

`data-seed` profile 將 `reference/DumpData/` 中 2026-05-05 dump 匯入 E07 計分卡相關 6 表，作為新環境部署的初始資料：

| Table | 來源 dump | 載入筆數 | 特殊處理 |
|-------|-----------|---------|---------|
| `ob_card_type` | OBLEVELCARD_VERSION（推導 prod_kind） | 6 | M 系列 → prod_kind=02，其餘 01 |
| `ob_levelcard_version` | OBLEVELCARD_VERSION_20260505.csv | 6 | — |
| `ob_levelcard_column` | OBLEVELCARD_COLUNM_20260505.csv | 47 | 含中文 column_label |
| `ob_levelcard_score` | OBLEVELCARD_SCORE_20260505.csv | 370 | BR-9 RTRIM、空字串/NULL 規一化 |
| `ob_levelcard_level` | OBLEVELCARD_LEVEL_20260505.csv | 22 | — |
| `ob_tier` | OBTIER_20260505.csv | 27 | tier_level 正規化（捨去後綴英文 + T1-T10 範圍）|

**冪等保證：**
- 每張表執行前 `SELECT COUNT(*)`，若 `> 0` 則 SKIP（不洗業務既有資料）
- `ob_levelcard_column` 例外：表非空時用 `UPDATE WHERE column_label IS NULL` 補中文標籤（不洗已調整的 label）
- `match_type` 只在 `ob_levelcard_column` 首次 INSERT 才依 score 推導；非空 SKIP（保留業務手動調整）

**重新生成 JSON 資料**（dump 更新時）：

```bash
cd apps/api
npm run data-seed:regen-json
```

`reference/DumpData/*.csv` → `apps/api/src/database/seeds/data/*.json`，含 OBTIER 正規化映射（T1HM→T1、T32→T3、T5M→T5 等）。

## Test Accounts

| Email | Password | Role | Status |
|-------|----------|------|--------|
| admin@cdmp.test | P@ssw0rd123 | admin | active |
| disabled@cdmp.test | P@ssw0rd123 | admin | disabled |
| user@cdmp.test | P@ssw0rd123 | user | active |

## API Endpoints (implemented)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/auth/login` | Login (Admin & User) |

## Environment Variables

All environment variables are configured in `docker-compose.yml`. For local development, copy `.env.example` to `apps/api/.env`.

| Variable | Default | Description |
|----------|---------|-------------|
| DB_TYPE | postgres | Database type (postgres / sqlite) |
| DB_HOST | localhost | PostgreSQL host |
| DB_PORT | 5432 | PostgreSQL port |
| DB_NAME | cdmp_dev | Database name |
| DB_USERNAME | cdmp | Database user |
| DB_PASSWORD | cdmp_secret | Database password |
| JWT_SECRET | — | JWT signing secret |
| PORT | 3000 | API server port |
