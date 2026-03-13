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
```

啟動完成後開啟瀏覽器：
- Frontend: http://localhost:5173
- API: http://localhost:3000/api/v1

| Service | Container | Port | Description |
|---------|-----------|------|-------------|
| postgres | cdmp-postgres | 5432 | PostgreSQL 16 (cdmp_dev) |
| api | cdmp-api | 3000 | NestJS backend (hot reload via volume mount) |
| web | cdmp-web | 5173 | React frontend (HMR via volume mount) |
| seed | cdmp-seed | — | 一次性 seed script（需手動觸發） |

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
