# CDMP MSSQL 正式部署／切換運行手冊（AD-E07-44 P6）

> 對象：維運 / DevOps。範圍：以 MSSQL 為地基執行 CDMP 第一次正式生產上線（見 AD-E07-44 §0 定位）。
> 本手冊涵蓋 P6a（部署 bootstrap）→ P6b（env 切換）→ P6c（首次 ETL 灌入）→ P6d（正式月跑 + F067 驗收）
> → P6e（正式上線 / point-of-no-return）。P6f（程式碼消除）為觀察期後另行執行，不在本手冊部署範圍。

---

## 🔴 前置硬閘 P6-0：SQL Server 版本確認（未通過前，禁止 P6a 之後任何步驟）

依 AD-E07-44 §2：P1-P5 驗證基準為 **SQL Server 2022**；已使用 `TRIM()`（2017+ 簡化語法）於 6+ 核心檔，
若實機 < 2017 會在生產報錯（`'TRIM' is not a recognized built-in function name`），即使 P1-P5 全綠。

**✅ 2026-07-08 dev 實機已確認**：dev `172.20.202.212` = **SQL Server 2022（major 16, 16.0.4235.2）
Standard Edition / Chinese_Taiwan_Stroke_BIN** → P6-0 於 dev 通過。

**動作（正式 prod 庫仍須逐一確認）**：向 DBA 取得**正式 prod 實機** `SELECT @@VERSION` 權威輸出。
- **≥ 2017（含 2019/2022）**：記錄版本來源 → P6-0 關閉 → 進 P6a。
- **= 2016（含 SP3）**：**停止部署**，回 AD-E07-44 §2.4 執行 TRIM 全站點改寫 + 針對真實 2016 環境重驗
  P1-P5 全套件（估 5-10 人天），完成後才可解除本閘。

> 不變式 I-MSSQL-VERSION-CONFIRMED-01：任何 P6a 之後動作不得在版本未經權威確認前執行。

---

## 部署前準備

1. **金鑰檔**：於 repo 根 `cp .env.mssql.example .env`，填入
   - `AES_ENCRYPTION_KEY`（`openssl rand -hex 32`；**產一次、永久保存、勿更換** —— 換掉會使已補的
     datasource 密碼全部作廢）。
   - `JWT_SECRET`（`openssl rand -hex 32`）。
   - `DB_HOST` / `DB_PORT` / `DB_USERNAME` / `DB_PASSWORD` / `DB_NAME`：外部 MSSQL 實機位址、app SQL login 與目標庫（預設庫名 `CDMP`）。
2. **資料庫 collation**：目標庫必為 `Chinese_Taiwan_Stroke_BIN`（BIN 大小寫敏感，對齊來源系統硬性要求）。
   由 DBA 於建庫時指定此 collation；bootstrap 前確認。
3. **時區**：api/worker/bootstrap 之 mssql 連線一律 `useUTC:true`（程式內建，見 `data-source.ts`）。

---

## P6a：MSSQL 部署 Bootstrap（一鍵，冪等）

對齊現行 postgres 版一鍵部署；bootstrap 之 `npm run bootstrap` 依 `DB_TYPE` 分派，MSSQL 與 PG 共用同一
script（seeds 已 driver-portable，AD-E07-39 P1b3），差異僅在傳入環境變數。

流程 = `migration:run`（37+ 表 baseline：schema / reference-data / queue_job）→ `seed`（4 帳號）→
`seed-datasource`（9 datasource 空殼，密碼留空）→ `data-seed`（計分卡 6 表 / etl_pipelines / extraction_tasks）。

> **部署模型 = 外部 SQL Server（非本機 docker 容器）。** dev/prod 為獨立 SQL Server 實例（如
> `172.20.202.212:1433`）；目標庫（collation `Chinese_Taiwan_Stroke_BIN`）與 app login 由 DBA 事前建好。
> 本機 docker mssql 容器（曾為「等不到 2022 的臨時替代」）已於 2026-07-08 移除；bootstrap 直接對外部庫執行。
> `docker/mssql-init.sql` 僅供 CI 用（自建隔離測試庫），與正式部署無關。

```bash
# 對「外部 MSSQL 目標庫」跑一鍵 bootstrap（冪等、可安全重跑）。連線由環境變數提供（勿把密碼寫進 repo）。
cd apps/api
export DB_TYPE=mssql \
       DB_HOST=<外部 MSSQL host> DB_PORT=1433 \
       DB_USERNAME=<app login> DB_PASSWORD=<app password> DB_NAME=CDMP \
       DB_MSSQL_ENCRYPT=true DB_MSSQL_TRUST_CERT=true \
       NODE_ENV=production \
       AES_ENCRYPTION_KEY=<openssl rand -hex 32；產一次永久保存> \
       JWT_SECRET=<openssl rand -hex 32>
npm run bootstrap   # migration:run → seed → seed-datasource → data-seed（四步、依 DB_TYPE 分派）
#    期望：三支 migration "has been executed successfully"、四步 exit 0、"Prod data seed complete."
```

> ✅ **2026-07-08 dev 實機驗證**：上述流程對 dev `172.20.202.212`（2022 Standard / BIN）空庫 CDMP 跑通 →
> 39 表 + 設定資料齊（users 4 / datasources 9 / 計分卡 449 / tier 27 / pipeline 6 / extraction 19 / migrations 3）
> + 業務表全空，與本機驗收完全一致。

**DoD（驗收，比照 postgres 版 6 項設定資料齊）**：對全新空庫執行後
- `users` = 4（admin/disabled/user/manager 可登入）
- `datasources` = 9（空殼、`status='unknown'`、`encrypted_password` 解密為空字串）
- `ob_card_type` / `ob_levelcard_*` / `ob_tier` = seed JSON 筆數（計分卡齊）
- `etl_pipelines` = 5、`extraction_tasks` = seed 筆數（FK 完整、無懸空）
- `roles` = 2、`pooldata_field_whitelist` = 17、`pooldata_field_option` = 186
- 業務表（`ob_pool_data` / `ob_pool_data_list` / `ob_monthly_run_result` / `assignment_run` …）**結構完整但為空**
- `typeorm_migrations` = 3

> 自動化佐證：`src/database/__tests__/mssql-p1b3.mssql.spec.ts`（50 案）以真實 MSSQL 跑完整 bootstrap
> （ALIAS-006 = 字面 `npm run bootstrap` 一次到位）+ 逐表筆數 + 帳號 bcrypt round-trip + FK + 冪等。

---

## P6b：docker-compose / 環境變數切換至 MSSQL

bootstrap 完成後，讓 **api / worker 以 `DB_TYPE=mssql` 指向外部 MSSQL 目標庫**啟動（與 bootstrap 相同的
DB 連線環境變數 + `AES_ENCRYPTION_KEY`/`JWT_SECRET`；worker 額外 `RUN_QUEUE_POLL_INTERVAL_MS`）。部署載體
（PM2 / systemd / container orchestrator / 內部 docker）由維運既有慣例決定 —— 關鍵是傳入正確的 mssql 連線
env，程式已 driver 分派、`useUTC:true` 內建。

- **佇列**：`DB_TYPE=mssql` 時 worker 走自建 T-SQL 輪詢佇列（`RunQueueConsumer.startMssqlPolling`），不需 pg-boss。
- **回退**：P6e 之前生產庫尚未對外服務，可清庫重跑 bootstrap + ETL（皆冪等）；程式 PG 分支仍在（P6f 前）。

> 註：本機 dev docker-compose 仍為 postgres 預設堆疊（`api/postgres/web/worker`），供本地開發用；MSSQL 部署
> 走上述外部連線模型，不再有 docker-compose mssql profile（2026-07-08 移除臨時本機容器設定）。

---

## P6c：從 legacy 來源系統首次 ETL 灌入（生產 MSSQL）

CDMP 至今無正式生產資料（AD-E07-44 §0）；生產資料來源 = 從 legacy OB 資料庫**重新 ETL**，非搬 PG 資料。

1. 於 UI「資料來源」逐一補 datasource 密碼並「測試連線」（bootstrap 建的是空殼，密碼不落地）。
   - 重點來源：`APYHFC16.OB`（extraction-task 依名查找，缺則 fail-fast）。
2. 觸發既有 ETL pipeline，對 legacy 來源系統擷取並灌入生產 MSSQL：
   - `E07-OBEMPHIRE-Load` / `E07-OBCALENDAR-Load` / `E07-OBARRETURNDF_MIN_CAP-Load` /
     `E07-OBPOOLDATA-Load` / `ETL for Customer Core`。
3. 驗收：各目標表列數合理、`_cdmp_extracted_at` 有值。
- **回退**：生產庫尚未對外服務，可清空重跑 `bootstrap` + ETL（皆冪等）。

---

## P6d：正式月跑一次 + F067 式對真實 legacy 比對驗收

1. 以 P6c 灌入之真實資料，於 UI 觸發一次正式月跑（Stage 1~4 全鏈）。
2. 比照 F067 既有方法論，將 MSSQL 版月跑結果與 legacy SP 之真實輸出做業務級比對（部門/員編維度分佈、
   CR、tier、匯出 23 欄）。
3. 產出簽核文件 → **業務簽核**。
- **回退**：簽核不通過 → 回 P6c 修正後重跑；生產庫尚未對外服務，無外部依賴需保護。

---

## 🔴 P6e：正式上線（Point-of-No-Return）

**定義（AD-E07-44 §5.4）**：業務開始依 MSSQL 版正式月跑結果**實際對外/對下游派案**，且不再有並行 legacy
備援退路的那一刻，即為本次遷移唯一真正的 point-of-no-return。此後若發現問題，處理方式為「在 MSSQL 上
修復」，而非「切回 PG 撤銷已發生的業務行為」。

**Go-Live checklist（全數勾選才上線）**：
- [ ] P6-0 版本確認通過（≥2017，或 2016 修復+重驗完成）。
- [ ] P6a bootstrap DoD 6 項設定資料齊、業務表空、`typeorm_migrations`=3。
- [ ] P6b api / worker 以 `DB_TYPE=mssql`（外部庫）啟動、全服務 healthy、登入 OK。
- [ ] P6c 9 個 datasource 皆「測試連線」成功、ETL 首次灌入完成且列數合理。
- [ ] P6d 正式月跑完成、F067 式比對業務簽核通過。
- [ ] AES_ENCRYPTION_KEY / JWT_SECRET 已安全保存（異地備援）。
- [ ] 監控/備份：MSSQL 定期備份與還原演練就緒。
- [ ] 回退窗口確認：P6e 之前每一步皆可回退（見各節）；跨過本閘後不可簡單回退。

---

## P6f：程式碼消除（觀察期後，非本手冊部署範圍）

AD-E07-44 §3.2 建議 P6e 上線後保留 **1-2 個完整月跑週期觀察期**，期間無需回退至 PG 對照後，才執行
P6f（移除 `pg-boss`/`pg-copy-streams` 內部使用與 PG 版 handler/builder；`pg` 依賴因外部 datasource
來源功能而保留，見 §4.2 / I-MSSQL-SOURCE-EXECUTOR-SCOPE-01）。P6f 為刪除性、可 git revert 但有合併成本。

---

## 附錄 A：常用維運指令

於 `apps/api`、export 好上述 mssql 連線 env（含 `AES_ENCRYPTION_KEY`）後執行（皆冪等）：

```bash
cd apps/api   # 先 export DB_TYPE=mssql / DB_HOST=<外部> / ... / AES_ENCRYPTION_KEY（同 bootstrap）

npm run bootstrap          # 一鍵四步（migration:run + seed + seed-datasource + data-seed）
# 或單獨重跑某步：
npm run seed               # 只重建帳號
npm run seed-datasource    # 只補 datasource 空殼
npm run data-seed          # 只 reconcile 計分卡 / pipeline / 擷取任務

SEED_REPAIR_DRIFT=true npm run data-seed   # 修回計分卡漂移（把 UI 誤改回 seed 值）
npm run migration:revert   # 逆轉 baseline（回退 schema；由新到舊，重複三次）
```

## 附錄 B：環境變數對照（.env.mssql.example）

| 變數 | 用途 | 預設 |
|---|---|---|
| `NODE_ENV` | production 關 synchronize（schema 靠 migration） | production |
| `AES_ENCRYPTION_KEY` | datasource 密碼加解密（三服務共用同一把） | dev 預設，正式須換 |
| `JWT_SECRET` | 登入 JWT 簽章 | dev 預設，正式須換 |
| `DB_HOST` / `DB_PORT` | 外部 MSSQL 位址 | —（實機）/ 1433 |
| `DB_USERNAME` / `DB_PASSWORD` | MSSQL app login | cdmp / —（實機） |
| `DB_NAME` | 目標資料庫 | CDMP |
| `DB_MSSQL_ENCRYPT` / `DB_MSSQL_TRUST_CERT` | 傳輸加密 / 憑證信任 | true / true |
| `RUN_QUEUE_POLL_INTERVAL_MS` | worker 自建佇列輪詢間隔（mssql 生效） | 2000 |
