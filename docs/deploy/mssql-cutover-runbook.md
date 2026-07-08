# CDMP MSSQL 正式部署／切換運行手冊（AD-E07-44 P6）

> 對象：維運 / DevOps。範圍：以 MSSQL 為地基執行 CDMP 第一次正式生產上線（見 AD-E07-44 §0 定位）。
> 本手冊涵蓋 P6a（部署 bootstrap）→ P6b（env 切換）→ P6c（首次 ETL 灌入）→ P6d（正式月跑 + F067 驗收）
> → P6e（正式上線 / point-of-no-return）。P6f（程式碼消除）為觀察期後另行執行，不在本手冊部署範圍。

---

## 🔴 前置硬閘 P6-0：SQL Server 版本確認（未通過前，禁止 P6a 之後任何步驟）

依 AD-E07-44 §2：P1-P5 全部驗證基準為 **SQL Server 2022 容器**，但 project memory 記載實機**可能為
2016 SP3**。若實機 < 2017，已使用之 `TRIM()`（2017+ 簡化語法）會在生產環境報錯（`'TRIM' is not a
recognized built-in function name`），即使 P1-P5 全綠。

**動作**：向 DBA 取得實機 `SELECT @@VERSION` 之權威輸出。
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
   - `DB_MSSQL_USERNAME` / `DB_MSSQL_PASSWORD` / `DB_MSSQL_NAME`：填實機 SQL login 與目標庫（預設庫名 `CDMP`）。
   - `MSSQL_SA_PASSWORD`：改為強密碼（正式環境）。
2. **資料庫 collation**：目標庫必為 `Chinese_Taiwan_Stroke_BIN`（BIN 大小寫敏感，對齊來源系統硬性要求）。
   本機 compose 由 `docker/mssql-init.sql` 於建庫時指定；正式外部 MSSQL 請由 DBA 確認建庫 collation。
3. **時區**：api/worker/bootstrap 之 mssql 連線一律 `useUTC:true`（程式內建，見 `data-source.ts`）。

---

## P6a：MSSQL 部署 Bootstrap（一鍵，冪等）

對齊現行 postgres 版一鍵部署；bootstrap 之 `npm run bootstrap` 依 `DB_TYPE` 分派，MSSQL 與 PG 共用同一
script（seeds 已 driver-portable，AD-E07-39 P1b3），差異僅在傳入環境變數。

流程 = `migration:run`（37+ 表 baseline：schema / reference-data / queue_job）→ `seed`（4 帳號）→
`seed-datasource`（9 datasource 空殼，密碼留空）→ `data-seed`（計分卡 6 表 / etl_pipelines / extraction_tasks）。

```bash
# 1) 起 mssql + 建庫/login（mssql-init 冪等：IF NULL 才建 CDMP / cdmp login）
docker compose --profile mssql-bootstrap up -d mssql mssql-init --build
#    等 cdmp-mssql-init 顯示 "CDMP ready: collation=Chinese_Taiwan_Stroke_BIN" 且 Exited(0)

# 2) 一鍵 bootstrap（對全新空庫）；冪等，可安全重跑
docker compose --profile mssql-bootstrap run --rm bootstrap-mssql
#    期望：三支 migration "has been executed successfully"、四步 exit 0、無 17750 / DLL / QueryFailedError
```

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

P6a 之部署路徑為 **additive、profile-gated**，預設 `docker compose up`（postgres）不受影響。正式上線時：

```bash
# 起長駐 MSSQL 生產堆疊（api-mssql / worker-mssql / web-mssql，皆 DB_TYPE=mssql 指向 mssql 服務）
docker compose --profile mssql-prod up -d
```

- api-mssql / worker-mssql 於 `mssql-init` 完成後才啟動（`service_completed_successfully`）。
- 與 dev postgres 堆疊並存測試時，以 `MSSQL_API_PORT` / `MSSQL_WEB_PORT` 覆寫 host port 避免衝突。
- **回退**：改回不帶 profile 的 `docker compose up -d`（postgres 服務與程式碼皆保留，數分鐘內還原）。

> 註：將 postgres 服務降級為選用預設（翻預設）之 compose 檔正式改動，由 AD-E07-44 P6b 正式處理；
> P6a 僅提供 additive 路徑，不翻預設。

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
- [ ] P6b `docker compose --profile mssql-prod up -d` 全服務 healthy、登入 OK。
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

```bash
# 只重建帳號 / 只補 datasource 空殼 / 只 reconcile 計分卡・pipeline・擷取任務（皆冪等）
docker compose --profile mssql-bootstrap run --rm -e RUN_ONLY=seed bootstrap-mssql   # 見下方註
docker exec cdmp-api-mssql npm run seed
docker exec cdmp-api-mssql npm run seed-datasource
docker exec cdmp-api-mssql npm run data-seed

# 修回計分卡漂移（把 UI 誤改回 seed 值）
docker exec -e SEED_REPAIR_DRIFT=true cdmp-api-mssql npm run data-seed

# 逆轉 baseline（回退 schema；由新到舊三次）
docker exec cdmp-api-mssql npm run migration:revert   # 重複三次
```

> 註：`bootstrap-mssql` 服務 command 固定為 `npm run bootstrap`（四步）。若要單獨重跑某步，請在已啟動的
> `cdmp-api-mssql` 容器內 `docker exec` 對應 npm script（如上），或用 `docker compose --profile mssql-bootstrap
> run --rm bootstrap-mssql`（冪等，安全重跑全流程）。

## 附錄 B：環境變數對照（.env.mssql.example）

| 變數 | 用途 | 預設 |
|---|---|---|
| `NODE_ENV` | production 關 synchronize（schema 靠 migration） | production |
| `AES_ENCRYPTION_KEY` | datasource 密碼加解密（三服務共用同一把） | dev 預設，正式須換 |
| `JWT_SECRET` | 登入 JWT 簽章 | dev 預設，正式須換 |
| `DB_MSSQL_USERNAME` / `DB_MSSQL_PASSWORD` | MSSQL app login | cdmp / Cdmp_Dev_2026! |
| `DB_MSSQL_NAME` | 目標資料庫 | CDMP |
| `DB_MSSQL_ENCRYPT` / `DB_MSSQL_TRUST_CERT` | 傳輸加密 / 憑證信任 | true / true |
| `MSSQL_SA_PASSWORD` | mssql / mssql-init 容器 SA | Cdmp_Sa_2026!（正式須換） |
| `RUN_QUEUE_POLL_INTERVAL_MS` | worker 自建佇列輪詢間隔（mssql 生效） | 2000 |
| `MSSQL_API_PORT` / `MSSQL_WEB_PORT` | 與 dev 並存時的 host port 覆寫 | 3000 / 5174 |
