---
type: implementation-log
feature_id: AD-E07-44-P6a
feature_name: MSSQL 全面遷移 P6a — MSSQL 部署 bootstrap（對齊現行 PG 一鍵部署）
status: complete
last_updated: 2026-07-08
---

# AD-E07-44 P6a：MSSQL 部署 Bootstrap — Implementation Log

> 定位：可逆部署準備（additive）。不移除任何 PG 碼／pg-boss／pg-copy-streams／deps（P6f 刪碼延後）；
> 不翻 docker-compose postgres 預設（P6b 才處理）。sqlite/postgres 路徑不破。

## 1. 摘要與核心發現

P6a 之目標＝「讓 MSSQL 能一鍵 bootstrap，對齊 PG 版 `npm run bootstrap`」。**查證後確認 bootstrap 邏輯層
早已完成且已被證明可跑於 MSSQL**：

- `npm run bootstrap`（= `migration:run && seed && seed-datasource && data-seed`）本身依 `DB_TYPE` 分派，
  MSSQL 與 PG **共用同一 script**，差異僅在傳入環境變數。
- 三支 seed 腳本（`seed.ts` / `seed-datasource.ts` / `prod-data-seed.ts`）於 **AD-E07-39 P1b3 已 driver-portable**
  （`seed-connection.ts` 之 `seedConnectionOptions()` 依 `DB_TYPE` 建連線；`bindSql()`/`pquery()`/`top1()`/
  `keyMatch()` 可攜化 `?`→`$n`/`@n`、`LIMIT`→`TOP(1)`、`IS NOT DISTINCT FROM`→NULL-safe、`NOW()`→JS Date）。
- MSSQL baseline migration 三支（`migrations/mssql/*`：schema 36 表 + reference-data + queue_job；
  另含 migration-only 之 `customer_core`）已存在並被 CLI `migration:run` 走 mssql 專屬 glob 載入。
- `mssql-p1b3.mssql.spec.ts`（50 案）**已對真實 MSSQL 跑完整 bootstrap**（ALIAS-006＝字面
  `npm run bootstrap` 一次到位）+ 逐表筆數 + 帳號 bcrypt round-trip + FK 完整 + 冪等。

因此 P6a **無需修改任何 bootstrap/seed TypeScript 邏輯**。實作聚焦於「部署路徑」層：於 `docker-compose.yml`
以 additive 方式補上 MSSQL 生產部署服務（對齊 PG 版 `bootstrap`/`api`/`worker`/`web`），並實測 fresh
MSSQL bootstrap → prod 開機 → 登入全鏈路。

## 2. Test Results Summary

| Scenario ID | Description | Status |
|-------------|-------------|--------|
| TS-P6A-DEPLOY-001 | bootstrap-mssql 服務存在、DB_TYPE=mssql、指向 mssql、沿用 `npm run bootstrap` | PASS |
| TS-P6A-DEPLOY-002 | api-mssql 服務存在、DB_TYPE=mssql、指向 mssql | PASS |
| TS-P6A-DEPLOY-003 | worker-mssql 服務存在、DB_TYPE=mssql、指向 mssql | PASS |
| TS-P6A-DEPLOY-004 | MSSQL 部署服務以 profile 隔離（bootstrap-mssql=mssql-bootstrap、api/worker-mssql=mssql-prod） | PASS |
| TS-P6A-DEPLOY-005 | api/worker/bootstrap-mssql 皆有 depends_on（mssql-init 就緒後才啟動） | PASS |
| TS-P6A-DEPLOY-006 | 🔴 預設 bootstrap 服務仍 DB_TYPE: postgres（PG 路徑不變） | PASS |
| TS-P6A-DEPLOY-007 | 🔴 預設 api/worker 仍 DB_TYPE: postgres（P6a 不翻預設） | PASS |
| TS-P6A-DEPLOY-008 | bootstrap npm script 未被更動（四步順序不變） | PASS |

- 新增守門 spec：`mssql-p6a-deploy.spec.ts` — **8/8 PASS**（零外部相依，讀 repo 根 `docker-compose.yml` 文字）。
- 回歸既有 MSSQL bootstrap spec：`mssql-p1b3.mssql.spec.ts` 對真實 MSSQL 容器 `--no-file-parallelism` — **50/50 PASS**
  （含 ALIAS-006 fresh `npm run bootstrap` 一次到位、BOOT-002 bcrypt 登入憑證 round-trip、IDEM 冪等）。
- `npx tsc --noEmit -p tsconfig.build.json` — **EXIT 0**。

## 3. Fresh MSSQL Bootstrap 實測（DoD，對齊 PG 版驗收方式）

於全新隔離庫 `CDMP_P6A`（BIN collation，經 sqlcmd 建立、不動任何既有庫）實跑 **新 docker `bootstrap-mssql`
服務**（`docker compose --profile mssql-bootstrap run --rm bootstrap-mssql`，DB_MSSQL_NAME=CDMP_P6A）：

- bootstrap 全流程 **exit 0**，無 `17750`/`DLL`/`QueryFailedError`。

### 3.1 設定資料齊（bootstrap 後 CDMP_P6A 實查）

| 表 | 筆數 | | 表 | 筆數 |
|---|---|---|---|---|
| users | 4 | | etl_pipelines | 6 |
| datasources | 9（空殼、status=unknown、密碼解密為空） | | extraction_tasks | 19 |
| ob_card_type | 6 | | roles | 2 |
| ob_levelcard_score | 449 | | pooldata_field_whitelist | 17 |
| ob_tier | 27 | | pooldata_field_option | 186 |
| typeorm_migrations | 3 | | dbo 表總數 | 39 |

### 3.2 業務表為空（結構完整）

`ob_pool_data` = 0、`ob_pool_data_list` = 0、`ob_monthly_run_result` = 0、`assignment_run` = 0、
`customer_core` = 0。

### 3.3 prod 開機 + 登入 OK

`docker compose --profile mssql-prod up -d --no-deps api-mssql`（NODE_ENV=production、DB_MSSQL_NAME=CDMP_P6A、
host port 3100）→ Nest 成功啟動：`Nest application successfully started` / `CDMP API running on port 3000`；
OrphanRecoveryService 對 MSSQL 佇列表回收（0 孤兒）— 全 app 確實接上 mssql。

HTTP 登入：`POST /api/v1/auth/login`（admin@cdmp.test / P@ssw0rd123）→ **HTTP 200**，回傳 JWT token
+ admin 使用者物件（role=admin）。

實測後清理：移除 `cdmp-api-mssql` 容器、DROP `CDMP_P6A`；dev postgres 堆疊（api/worker/web/postgres/mssql）
全程未受影響、postgres 仍 healthy。

## 4. Files Changed

| File Path | Change Type | Description |
|-----------|-------------|-------------|
| `docker-compose.yml` | modified | **additive**：mssql/mssql-init 服務補 healthcheck（bash /dev/tcp liveness）+ 擴充 profiles（+mssql-prod/+mssql-bootstrap）；新增 4 個 profile-gated 服務 `bootstrap-mssql`（profile mssql-bootstrap）、`api-mssql`/`worker-mssql`/`web-mssql`（profile mssql-prod），皆 DB_TYPE=mssql 指向 mssql 服務。**未改動任何 postgres/api/worker/web/bootstrap 預設服務定義** |
| `.env.mssql.example` | new | MSSQL 部署用 .env 範本（連線/AES/JWT/collation/useUTC 備註/host port 覆寫） |
| `apps/api/src/database/__tests__/mssql-p6a-deploy.spec.ts` | new | docker-compose MSSQL 部署路徑靜態守門（8 案，零外部相依，含 PG 路徑不變之反向守門） |
| `docs/deploy/mssql-cutover-runbook.md` | new | P6 正式部署/切換運行手冊（P6-0 版本閘 → P6a-e 步驟 → point-of-no-return → 附錄指令/env 對照） |
| `docs/specs/implementation-log/AD-E07-44-P6a-impl.md` | new | 本檔 |

## 5. docker-compose 改動細節

1. **mssql / mssql-init**：新增 `mssql-prod`、`mssql-bootstrap` 兩 profile（生產部署路徑共用同一 mssql 容器
   與 init）；`mssql` 補 healthcheck（server 映像無 sqlcmd，改 bash `</dev/tcp/localhost/1433` liveness）。
   真正「SQL 就緒 + CDMP 庫/login 已建」之強就緒信號由 `mssql-init` 完成（`service_completed_successfully`）
   保證 → 生產服務 `depends_on: mssql-init: {condition: service_completed_successfully}`。
2. **bootstrap-mssql**（profile `mssql-bootstrap`）：`command: npm run bootstrap`（與 PG 版同 script）；
   env DB_TYPE=mssql/DB_HOST=mssql/DB_PORT=1433 + AES/DB_MSSQL_*（可經 .env 覆寫）。比照 PG 版 `bootstrap`
   自成一 profile（部署時顯式跑一次、冪等可重跑）。
3. **api-mssql / worker-mssql / web-mssql**（profile `mssql-prod`）：對齊 PG 版 api/worker/web 之 env 與
   command，僅 DB 指向 mssql；worker-mssql 保留 `RUN_QUEUE_POLL_INTERVAL_MS`（mssql 自建佇列輪詢生效）。
   host port 以 `MSSQL_API_PORT`/`MSSQL_WEB_PORT` 可覆寫，便於與 dev postgres 堆疊並存測試。

### PG 一鍵部署路徑不受影響（additive 證據）

- `git diff docker-compose.yml`：所有變更皆為 `+`（新增區塊），**無任一 `-` 行觸及 postgres/api/worker/web/
  bootstrap 預設服務**。
- `docker compose config --services`（無 profile）＝ `api / postgres / web / worker`（與改動前一致）。
- `docker compose --profile mssql-prod --profile mssql-bootstrap config` 通過驗證，額外含 api-mssql/
  bootstrap-mssql/mssql/mssql-init/web-mssql/worker-mssql。
- PG 版 `bootstrap` 服務（DB_TYPE: postgres）與 `npm run bootstrap` script 文字未動（DEPLOY-006/008 守門）。

## 6. Seed Portability 查證結論

三支 seed 腳本 + `seed-connection.ts` 於 P1b3 已完成 driver-portable，**P6a 無需任何補分支**：
- `seedConnectionOptions()` 依 `DB_TYPE` 產出 mssql/postgres 連線（含 mssql `useUTC:true`）。
- 可攜輔助：`bindSql`（`?`→`$n`/`@n`）、`pquery`、`top1`（LIMIT/TOP）、`keyMatch`（NULL-safe 自然鍵，
  取代 PG-only `IS NOT DISTINCT FROM`）。
- `prod-data-seed.ts` 之 `main()` 使用 `seedConnectionOptions()`；`seed.ts` 於 mssql 走 `synchronize:false`
  （不對 baseline schema 產生非預期 ALTER）。
- 驗證：`mssql-p1b3.mssql.spec.ts` 50/50 綠（含 SITE 群組逐站點轉換行為）＋ 本次 fresh docker bootstrap
  於 CDMP_P6A 全綠。

## 7. 運行手冊位置

`docs/deploy/mssql-cutover-runbook.md`（P6-0 版本閘 → P6a bootstrap → P6b env 切換 → P6c 首次 ETL 灌入
→ P6d 正式月名單分派+F067 驗收 → P6e go-live checklist / point-of-no-return → P6f 觀察期後刪碼；附常用維運指令
與 env 對照表）。

## 8. 偏差與注意事項（Deviations / Notes）

1. **🔴 P6-0 版本確認閘（未由本切片處理，屬前置硬閘）**：AD-E07-44 §2 明訂 P6a 之後所有步驟須先通過
   P6-0（確認實機 SQL Server 版本 ≥2017，否則 `TRIM()` 全站點需改寫並重驗）。P6a 之 docker-compose/env/
   runbook 改動屬 **additive、可逆**、不觸發 point-of-no-return，故先行落地不受 P6-0 阻擋；但 runbook 已將
   P6-0 列為部署前第一道硬閘、明確標示「未通過前禁止 P6a 之後任何步驟」。本次 fresh 實測使用之本機容器為
   **SQL Server 2022**（與 P1-P5 驗證基準一致），**非**對實機版本之權威確認 → 版本閘仍待維運/DBA 回覆
   （不變式 I-MSSQL-VERSION-CONFIRMED-01 未解除，屬使用者裁示事項 §7-1）。
2. **未新增 api/worker 之 mssql 「翻預設」改動**：依 AD §4.4／§5.2，翻動 docker-compose 預設（api/worker/
   bootstrap 預設指向 mssql、postgres 降級為選用）屬 **P6b** 範圍。P6a 僅提供 profile-gated additive 路徑。
3. **未移除任何 PG 碼/deps**：pg/pg-boss/pg-copy-streams、PG 版 handler/builder、postgres 服務定義全數保留
   （P6f 刪碼延後、須觀察期後執行；I-MSSQL-CUTOVER-REVERSIBLE-01）。
4. **既有測試回歸**：本切片零 TypeScript 來源碼變更（僅新增 1 支自足守門 spec + docker-compose/docs/env），
   tsc EXIT 0；故 sqlite/postgres 既有套件無回歸機制。未逐一重跑全量 sqlite 套件（無變更面）。
5. **未 git commit、未動記憶檔**（依約束）。
