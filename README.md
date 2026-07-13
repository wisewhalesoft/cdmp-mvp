# CDMP MVP — 企業客戶資料治理平台

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript + Vite + Tailwind CSS |
| Backend | NestJS 10 + TypeScript + TypeORM |
| Database | Microsoft SQL Server 2022（Chinese_Taiwan_Stroke_BIN 定序）|
| Testing | Vitest + Supertest + Testing Library |
| Infrastructure | Docker Compose |

> **資料庫為外部 MSSQL**：本專案已由 PostgreSQL 全面遷移至 SQL Server，`docker-compose.yml`
> **不再內含 DB 容器**。api/worker/bootstrap 透過 `DB_HOST` 等環境變數連到外部企業 MSSQL
> （dev/test 目前共用 `172.20.202.212:1433` 的 `CDMP`）。單元測試走 in-memory SQLite。

## Project Structure

```
cdmp-mvp/
├── apps/
│   ├── api/                # NestJS backend (port 3000) + worker（月名單分派 T-SQL 佇列 consumer）
│   │   └── Dockerfile
│   └── web/                # React SPA frontend (port 5173)
│       └── Dockerfile
├── packages/
│   └── shared/             # Shared types (DTO, error codes)
├── docs/                   # Specs, test designs, diagrams
├── docker-compose.yml      # Development / deploy（連外部 MSSQL；不含 DB 容器）
└── docker-compose.test.yml # Test environment（SQLite in-memory）
```

## Prerequisites

- Docker & Docker Compose
- **可連線的外部 SQL Server 2022**（企業內網；本主機須網路可達 `DB_HOST:1433`）
- Node.js 22 LTS + npm 9+（僅本機 non-Docker 開發需要）

---

## Docker

### 連線設定（必要）— `.env` 或 `docker-compose.override.yml`

`docker-compose.yml` 的 DB 連線走環境變數，**預設 `DB_HOST` 為空、`NODE_ENV=development`**。直接 `up`
會①連不到 DB、②`synchronize:true` 動到外部 CDMP 的 schema。故啟動前**務必**提供連線設定，二選一：

- **`.env`（推薦，deploy）**：`cp .env.deploy.example .env` 後填 `DB_HOST` / 帳密等（docker compose 同目錄自動讀）。
- **`docker-compose.override.yml`（本機 dev，gitignored、不入版控）**：覆寫 api/worker 的 `NODE_ENV=production` + `DB_*`。

> 🔴 **一律設 `NODE_ENV=production`**（關 `synchronize`）——因 dev/test 共用同一個 CDMP，
> 開 synchronize 會改到共用 schema。schema 改由 migration baseline 提供（見「正式部署」）。

### Development — 啟動 (API + Worker + Frontend)

```bash
# 前置：已備妥 .env（或 docker-compose.override.yml）指向外部 MSSQL、NODE_ENV=production
docker compose up -d          # 起 api / worker / web（無 DB 容器；bootstrap 有 profile 不會被起）

docker compose logs -f api    # 查看即時 log
```

啟動完成後開啟瀏覽器：
- Frontend: http://localhost:5174
- API: http://localhost:3000/api/v1

| Service | Container | Port | Description |
|---------|-----------|------|-------------|
| api | cdmp-api | 3000 | NestJS backend（hot reload via volume mount）|
| worker | cdmp-worker | — | 月名單分派 T-SQL 佇列 consumer + orphan reaper（不對外 expose port）|
| web | cdmp-web | 5174 | React frontend（對外 5174，容器內 5173）|
| bootstrap | cdmp-bootstrap | — | 一次性一鍵建置（`--profile bootstrap`，僅**全新 MSSQL** 需要，見「正式部署」）|

```bash
docker compose down                 # 停止所有服務（不影響外部 MSSQL 資料）
docker compose up -d --build        # 依賴/程式碼變更後重新建置
docker compose restart api worker   # 改 code 後於容器內驗證（volume watch 不可靠時用）
```

> 資料在**外部 MSSQL**，`docker compose down` 不會動到它（無本地 DB volume）。

### 正式部署 — 全新 MSSQL 的一鍵 Bootstrap（Production）

> **注意**：若要連線的 MSSQL **已有 schema + 設定資料**（例如共用的 dev/test CDMP），
> **請跳過 bootstrap**，直接建 `.env` → `docker compose up -d` 即可（見下方「連既有 CDMP」）。
> 下面 bootstrap 流程是給**全新空白 MSSQL**（首次建置）用的。

`bootstrap` 冪等，一次建好：**全部資料表（MSSQL baseline migration）**＋帳號＋資料來源空殼＋擷取任務＋ETL Pipeline＋篩選欄位＋計分卡設定。（真實業務資料仍需之後接來源跑 ETL / 月名單分派才會有。）

```bash
# 取得 / 更新程式碼
git clone https://github.com/wisewhalesoft/cdmp-mvp.git && cd cdmp-mvp   # 首次
git pull                                                                # 更新到最新 main

# 0) 建 .env（docker compose 自動讀取）；DB 連線 + 金鑰
cp .env.deploy.example .env
#    編輯 .env：填 DB_HOST / DB_USERNAME / DB_PASSWORD / DB_NAME（外部 MSSQL）
#    AES_ENCRYPTION_KEY / JWT_SECRET 可用 openssl rand -hex 32 現產（全新庫時）
grep -qxF '.env' .gitignore || echo '.env' >> .gitignore

# 1) 一鍵 bootstrap（全新空白 MSSQL）：migration:run（建全表+篩選欄位）→ seed（帳號）
#    → seed-datasource（9 個空殼）→ data-seed（計分卡/pipeline/擷取任務）
docker compose --profile bootstrap up bootstrap --build --abort-on-container-exit

# 2) 起 api / worker / web（synchronize 已關，schema 來自 mssql baseline migration）
docker compose up -d

# 3) 主機層：Docker daemon 開機自啟（只需一次）
systemctl is-enabled docker || sudo systemctl enable docker

# 4) 確認常駐服務 restart 政策生效（每行應顯示 unless-stopped）
docker inspect -f '{{.Name}} {{.HostConfig.RestartPolicy.Name}}' cdmp-api cdmp-worker cdmp-web
```

> - `docker compose` 自動套用同目錄 `.env`，三服務共用同一把 `AES_ENCRYPTION_KEY`（datasource 密碼加解密）。
> - **顧好 `.env`**：UI 補的 datasource 密碼用這把 key 加密；刪除/更換/遺失 = 密碼全部作廢需重補。已在 `.gitignore`，另請自行備份金鑰。
> - schema 唯一來源 = MSSQL baseline migration（`migrations/mssql/1751884800000-MssqlBaselineSchema` +
>   `…MssqlBaselineReferenceData` + `…MssqlQueueJobSchema`）；計分卡 6 表由 `data-seed` 從 `seeds/data/*.json` 灌。

### 連既有 CDMP（例：test 主機連共用 dev/test 172.20.202.212）

DB 已有 schema + seed + 業務資料 → **不需 bootstrap、不需起 DB**：

```bash
git pull
cp .env.deploy.example .env      # 編輯：NODE_ENV=production、DB_HOST=172.20.202.212、DB 帳密、DB_NAME=CDMP
# ⚠️ AES_ENCRYPTION_KEY 沿用「當初加密 datasource 密碼那把」——連共用 dev CDMP 者，
#    直接刪掉 .env 的 AES_ENCRYPTION_KEY 行、吃 docker-compose.yml 內建預設（= dev 同一把），
#    否則既有 datasource 密碼解不開。切勿現產新的。
docker compose build
docker compose up -d             # 起 api / worker / web
```

> - ⚠️ **共用 DB**：test 與 dev 連同一個 CDMP → 操作同一份資料，非隔離。
> - ⚠️ **絕不可**在此環境跑 `*.mssql.spec.ts`（會 `DELETE` target 表清空業務資料）。
> - 若 main 有新 entity/schema 變更尚未套到該 CDMP：`docker exec cdmp-api npm run migration:run`。

### 服務常駐 / 重開機自動啟動

- `api` / `worker` / `web` 皆 `restart: unless-stopped`，主機或 Docker daemon 重啟後自動拉回（除非手動 `docker stop`）。`bootstrap` 是一次性任務，刻意不設 restart。
  - 政策要生效需重建一次容器：`docker compose up -d`。
  - 確認：`docker inspect -f '{{.Name}} {{.HostConfig.RestartPolicy.Name}}' cdmp-api cdmp-worker cdmp-web`。
- Docker daemon 開機自啟（Linux 主機層，只需一次）：`systemctl is-enabled docker || sudo systemctl enable docker`。
- **資料持久化**：業務資料存於**外部 MSSQL**（非本地 volume），容器重建/主機重開機都不影響。UI 補的 datasource 密碼、月名單分派結果都在該 MSSQL 裡。
- 平常維運：`docker compose restart <服務>` 重啟單一服務；`docker compose up -d` 套用 compose 變更；都不需重跑 bootstrap。

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

測試環境使用獨立的 `docker-compose.test.yml`（**SQLite in-memory，不需外部 DB**），透過 `--profile` 選範圍。

```bash
docker compose -f docker-compose.test.yml --profile all up test-all --build --abort-on-container-exit   # 後端 Unit + E2E
docker compose -f docker-compose.test.yml --profile e2e up api-e2e --build --abort-on-container-exit     # 只後端 E2E
docker compose -f docker-compose.test.yml --profile unit up api-test --build --abort-on-container-exit   # 只後端 Unit
docker compose -f docker-compose.test.yml --profile unit up web-test --build --abort-on-container-exit    # 只前端
```

| Profile | Service | Tests | DB |
|---------|---------|-------|-----|
| `all` | test-all | 後端 Unit + E2E | SQLite in-memory |
| `e2e` | api-e2e | 後端 E2E | SQLite in-memory |
| `unit` | api-test | 後端 Unit | SQLite in-memory |
| `unit` | web-test | 前端 | — |

> **真實 MSSQL 整合測試**（`*.mssql.spec.ts`）由 CI 的 mssql-specs job（SQL Server 2022 service container）跑，
> **不要**對共用 dev/test CDMP 執行（會清空 target 表）。

測試完成後容器會自動停止（`--abort-on-container-exit`）。

---

## Local Development (without Docker)

```bash
# 1. 安裝相依
npm install

# 2. 備妥外部 MSSQL 連線（apps/api/.env，或 export 環境變數）：
#    DB_TYPE=mssql DB_HOST=<host> DB_PORT=1433 DB_USERNAME=<user> DB_PASSWORD=<pw> DB_NAME=CDMP
#    DB_MSSQL_ENCRYPT=true DB_MSSQL_TRUST_CERT=true NODE_ENV=production

# 3. 啟動後端 API（port 3000）
npm run api:dev

# 4. 另開終端 — 啟動前端（port 5173）
npm run web:dev
```

### Running Tests Locally

```bash
npm test                                                        # 全部（SQLite in-memory）
npm run api:test                                                # 後端 unit
cd apps/api && npx vitest run --config vitest.e2e.config.ts     # 後端 E2E
npm run web:test                                                # 前端
```

> 跑測試預設 `DB_TYPE=sqlite`（`test/setup.ts` 強制）。**勿**對共用 CDMP 跑 `*.mssql.spec.ts`。

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

> bootstrap 另會建 5 個真實 hfcfinance 帳號（見 `seeds/data/users-real.json`）。

## Environment Variables

環境變數於 `.env`（deploy，docker compose 自動讀）或 `docker-compose.override.yml`（本機 dev）設定；範本見 `.env.deploy.example`。

| Variable | Default | Description |
|----------|---------|-------------|
| NODE_ENV | development | `production` 關 synchronize（連外部/共用 MSSQL 必設）|
| DB_TYPE | mssql | 資料庫類型（mssql；測試自動 sqlite）|
| DB_HOST | —（空）| 外部 MSSQL 主機（例 172.20.202.212）|
| DB_PORT | 1433 | MSSQL port |
| DB_NAME | CDMP | 資料庫名 |
| DB_USERNAME | —（空）| DB 帳號 |
| DB_PASSWORD | —（空）| DB 密碼 |
| DB_MSSQL_ENCRYPT | true | tedious TLS 加密 |
| DB_MSSQL_TRUST_CERT | true | 信任自簽憑證 |
| AES_ENCRYPTION_KEY | （compose 內建預設）| datasource 密碼加解密；連既有庫須沿用當初那把 |
| JWT_SECRET | （compose 內建預設）| JWT 簽章 |
| VITE_ALLOWED_HOSTS | —（允許全部）| 前端允許的 Host（edge 內網網址需列出）|
| DB_MSSQL_REQUEST_TIMEOUT | 3600000 | tedious requestTimeout（ms；長 ETL/月名單分派需放大）|
