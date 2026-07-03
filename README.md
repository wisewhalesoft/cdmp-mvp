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
# 啟動所有服務 (PostgreSQL + API + Frontend)；dev 預設 NODE_ENV=development，synchronize 自動建表
docker compose up -d

# 首次啟動：建測試帳號（synchronize 已建 schema，故不需 migration）
docker exec cdmp-api npm run seed

# 需要 E07 計分卡 / pipeline / 擷取任務時（需先有 datasource；冪等 reconcile）
docker exec cdmp-api npm run seed-datasource   # datasource 空殼（可選，供擷取任務 FK）
docker exec cdmp-api npm run data-seed         # 計分卡 6 表 + pipeline + 擷取任務
```

> 正式/新環境部署請改用下方「一鍵 Bootstrap」（一次建好全部，含 migration）。

啟動完成後開啟瀏覽器：
- Frontend: http://localhost:5174
- API: http://localhost:3000/api/v1

| Service | Container | Port | Description |
|---------|-----------|------|-------------|
| postgres | cdmp-postgres | 5432 | PostgreSQL 16 (cdmp_dev) |
| api | cdmp-api | 3000 | NestJS backend (hot reload via volume mount) |
| web | cdmp-web | 5174 | React frontend（對外 5174，容器內 5173）|
| bootstrap | cdmp-bootstrap | — | 一次性一鍵建置（`--profile bootstrap`，見「正式部署」）|

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

**取得 / 更新程式碼：**

```bash
# 首次部署：clone（需 GitHub 存取權；HTTPS 會提示帳號/PAT，或改用 SSH URL）
git clone https://github.com/wisewhalesoft/cdmp-mvp.git
cd cdmp-mvp

# 已部署過：更新到最新 main
#   .env 已 gitignore、web 5174 已進 repo → pull 應乾淨
#   若被本機改動擋住：git stash && git pull && git stash pop
git pull
```

**建置與啟動（首次或重建 DB 時）：**

```bash
# 0) 建 .env（docker compose 會自動讀取，故之後指令不必再帶環境變數）
#    可改 cp .env.deploy.example .env 後填值；或用下面 openssl 現產（產一次、存好、別更換）
cat > .env <<EOF
NODE_ENV=production
AES_ENCRYPTION_KEY=$(openssl rand -hex 32)
JWT_SECRET=$(openssl rand -hex 32)
# 內網網址：前門 edge 代理轉發的 Host，Vite 需允許（見「內網網址 / SSL / 多站前門」段）
VITE_ALLOWED_HOSTS=testcdmp.hfcfinance.com.tw
EOF
grep -qxF '.env' .gitignore || echo '.env' >> .gitignore   # 確保金鑰不進 git
cat .env                                                     # 看一眼產出的值

# 1) 先只起 DB（fresh 部署可先 docker compose down -v 清空 volume），等 healthy
docker compose up -d postgres

# 2) 一鍵 bootstrap：migration(建全表+篩選欄位) → seed(帳號) → seed-datasource(9個空殼) → data-seed(計分卡/pipeline/擷取任務)
#    datasource 一律建空殼（密碼留空），部署後於 UI「資料來源」逐一補密碼並測試連線
docker compose --profile bootstrap up bootstrap --build --abort-on-container-exit

# 3) 起 api / worker / web（synchronize 已關，schema 來自 migration baseline）
docker compose up -d

# 4) 主機層：確認 Docker daemon 開機自啟（只需做一次；否則重開機後容器不會被拉起）
systemctl is-enabled docker || sudo systemctl enable docker

# 5) 驗證常駐服務 restart 政策生效（每行應顯示 unless-stopped）
docker inspect -f '{{.Name}} {{.HostConfig.RestartPolicy.Name}}' cdmp-api cdmp-postgres cdmp-worker cdmp-web
```

> - 步驟 2、3 不必再帶 `NODE_ENV` / `AES_ENCRYPTION_KEY` / `JWT_SECRET` —— `docker compose` 會自動套用同目錄的 `.env`，三個服務共用同一把 `AES_ENCRYPTION_KEY`（datasource 密碼加解密），自然一致。
> - **顧好 `.env`**：UI 補的 datasource 密碼用這把 key 加密；刪除 / 更換 / 遺失 = 密碼全部作廢需重補。已在 `.gitignore`，另請自行備份金鑰。
> - migration baseline（`1711360000000-BaselineSchema` + `1711360000001-BaselineReferenceData`）為 schema 與篩選欄位/角色的唯一來源；計分卡 6 表由 `data-seed` 從 `seeds/data/*.json` 灌。
> - 重跑 `bootstrap` 安全（冪等）。本機開發不需此流程：不建 `.env`，`NODE_ENV` 預設 `development`，`docker compose up -d` 仍以 `synchronize` 建表。

### 服務常駐 / 重開機自動啟動

- **重開機自動起來**：`postgres` / `api` / `worker` / `web` 皆設 `restart: unless-stopped`，主機或 Docker daemon 重啟後會自動拉回（除非你手動 `docker stop`）。`bootstrap` 是一次性任務，**刻意不設** restart。
  - 政策要生效需**重建一次容器**：`docker compose up -d`（既有容器不會自動套用新政策）。
  - 確認：`docker inspect -f '{{.Name}} {{.HostConfig.RestartPolicy.Name}}' cdmp-api cdmp-postgres cdmp-worker cdmp-web`（應為 `unless-stopped`）。
- **Docker daemon 開機自啟**（Linux 主機層，只需做一次）：
  ```bash
  systemctl is-enabled docker || sudo systemctl enable docker
  ```
- **資料持久化**：DB 存於具名 volume `pgdata`，重啟 / 重建容器 / 主機重開機都**不會掉**。只有 `docker compose down -v`（帶 `-v`）才會清空。UI 補的 datasource 密碼、跑出來的業務資料都在 `pgdata` 裡。
- 平常維運：`docker compose restart <服務>` 重啟單一服務；`docker compose up -d` 套用 compose 變更；**都不需重跑 bootstrap**（除非清庫）。

### 內網網址 / SSL / 多站前門（edge 反向代理）

前端為同源設計：瀏覽器只連「網站本身」，`/api/*` proxy 到 api → **不需 CORS、不需改 API 位址**。對外由**專職 edge 代理**（`edge/`）獨佔 80/443、終結 SSL（wildcard 憑證）、依 Host 分流到各站後端。CDMP 為其中一站；未來加站不用改本 compose。

**部署（以 `testcdmp.hfcfinance.com.tw` 為例）：**

1. 憑證放 `certs/2026/`（fullchain `.pem` + 私鑰 `.key.pem`；`certs/` 已 gitignore，私鑰不入版控）。站台設定見 `edge/conf.d/<站台>.conf`。
2. `.env` 設 `VITE_ALLOWED_HOSTS=testcdmp.hfcfinance.com.tw`（edge 轉發時 Vite 6 仍檢查 Host）。
3. 起 CDMP（web/api 在 `cdmp-mvp_default` 網路供 edge 連入）：`docker compose up -d --build`
4. 起 edge 前門（獨立 compose，吃 `certs/` + `edge/conf.d/`）：
   ```bash
   docker compose -f edge/docker-compose.yml up -d
   ```
5. 瀏覽器開 **https://testcdmp.hfcfinance.com.tw/**（http 自動 301 轉 https）。

**加第二站（例 `othersite.hfcfinance.com.tw`）：**
- 複製 `edge/conf.d/testcdmp.hfcfinance.com.tw.conf` → 改 `server_name` + 後端容器名（如 `/` → 該站 web、`/api` → 該站 api）。
- 在 `edge/docker-compose.yml` 的 `networks` 加該站的 `<專案>_default`（讓 edge 連得到它的容器）。
- `docker compose -f edge/docker-compose.yml up -d` 重載。同一張 wildcard 憑證即涵蓋所有 `*.hfcfinance.com.tw`。

> - **Vite 6 會擋未列的 Host** → `VITE_ALLOWED_HOSTS` 要列出網址（不設則允許全部 host）。
> - edge 獨佔 80/443：主機這兩個 port 需淨空（`ss -tlnp | grep -E ':80 |:443 '`）。
> - **換憑證**：新檔放 `certs/`、（如路徑變）改 `edge/conf.d`，`docker compose -f edge/docker-compose.yml restart`。
> - web 目前由 Vite dev server 提供；要更正式可改 `vite build` 靜態產物由 edge 直接服務，屬後續強化。

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

`data-seed`（`docker exec cdmp-api npm run data-seed`，或由 bootstrap 自動執行）將 `reference/DumpData/` 中 dump 匯入 E07 計分卡相關 6 表，作為新環境部署的初始資料：

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
