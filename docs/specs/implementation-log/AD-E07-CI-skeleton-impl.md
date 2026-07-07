# AD-E07 CI Skeleton — GitHub Actions（MSSQL 遷移 P0 安全網）

狀態：已建置（`.github/workflows/ci.yml`），尚未 push；GHA 端首跑待驗。
情境：專案原本完全無 CI（`.github/` 不存在）。此為 MSSQL 全面遷移的 P0 安全網，在後續高風險 phase（自建佇列、引擎移植）之前就位。

## Lane 結構（4 個互相獨立的 job；無 `needs` → 等效 fail-fast: false）

| Job | Runner | Service | 跑什麼 |
|---|---|---|---|
| `lint-typecheck-unit` | ubuntu-latest | 無 | `tsc --noEmit -p tsconfig.build.json`（apps/api）＋ `npm test`（SQLite in-memory 單元） |
| `pg-specs` | ubuntu-latest | `postgres:16`（cdmp_test/cdmp/cdmp_secret，host 5433→5432） | `npx vitest run --no-file-parallelism "pg.spec" "f098-pg-integration"` |
| `mssql-specs` | ubuntu-latest | `mcr.microsoft.com/mssql/server:2022-latest`（BIN collation）＋ init step | `npx vitest run --no-file-parallelism "mssql.spec"` |
| `web-unit` | ubuntu-latest | 無 | `npm test`（apps/web，vitest + jsdom） |

## 關鍵設計決策

- **Node pin 22 LTS**：對齊 `@types/node ^22`。B2 揭露 Node 24 + workspace hoisting 下 typeorm CLI 有問題（已由 `apps/api/scripts/typeorm.cjs` launcher 繞過）；CI 用 LTS 更保險。本機（Node 24）實測 tsc / sqlite 單元 / pg 過濾 / mssql 過濾皆過，但仍以 22 為 CI 基準。
- **安裝**：root `npm ci`（npm workspaces，root 有 `package-lock.json`）一次裝好並 hoist 到 root `node_modules`；各 lane 於 `apps/api` / `apps/web` 以 `npx` 解析 hoisted bin。npm cache 以 root lockfile 為 key。
- **序列化**：pg / mssql lane 均用 `--no-file-parallelism`。依 memory 教訓 `feedback_pg_spec_parallel_timeout`（PG spec「單跑過、合跑 fail」多為 CPU 競爭下 testTimeout 超時；spec 內已 `vi.setConfig({testTimeout})` + 唯一 schema 隔離）。
- **skip = 通過**：vitest skip（describe.skip / ctx.skip）本來就不算 fail。DB 不可達、或 Linux mssql 容器 `sp_getapplock`/`sp_executesql` 取鎖路徑拋 **17750 DLL 缺失** 導致的並發鎖測試 skip（附 reason），一律視為通過。本機實測 `personnel-ratio-sp-getapplock.mssql.spec.ts` 8 tests → 6 skipped、lane 仍 exit 0。

## 連線契約（來源查證）

- **PG specs**：一律讀 `PG_BOSS_TEST_HOST/PORT/USER/PASSWORD/DB`，預設 `127.0.0.1:5433 / cdmp / cdmp_secret / cdmp_test`（對齊 `docker-compose.test.yml` 的 `postgres-test`）。CI 於 step env 顯式設定。過濾器 `"pg.spec"` + `"f098-pg-integration"` 命中全部 14 個需真 PG 的檔（13 × `*.pg.spec.ts` + `f098-pg-integration.spec.ts`）。
- **MSSQL specs**：`mssql-env-preload.ts` 讀 `MSSQL_TEST_*` → `DB_*` → 預設 `localhost:1433 / cdmp / Cdmp_Dev_2026! / CDMP_TEST`（encrypt+trustCert）。CI 以 `DB_*` 對應 `.env.test.mssql`。過濾器 `"mssql.spec"` 命中 6 檔。
- **MSSQL init**：鏡像 `docker-compose.yml` 的 `mssql-init` 服務——等 mssql 就緒（retry loop）後用 `mssql-tools` 容器（`--network host` 連 host 已發佈的 1433）跑 `docker/mssql-init.sql`，建 `CDMP_TEST`（BIN collation）+ `cdmp` login/user。新版 mssql server 映像不再內建 sqlcmd，故沿用 compose 的 `mssql-tools` 工具路徑。

## 本機已驗 / 待 GHA 驗

- 已驗（本機）：`tsc --noEmit` PASS；sqlite 單元代表子集 PASS；pg 過濾器命中 14 檔、無 DB → 206 skipped、exit 0；mssql 過濾器命中 6 檔（本機有 mssql → 156 passed / 6 skipped、exit 0）；`ci.yml` YAML 解析合法。
- 待 GHA 首跑驗：GHA `services` 埠映射到 runner localhost、`--network host` 的 mssql-tools 容器連通性、npm cache 命中、Node 22 上 typeorm.cjs bootstrap/migration（mssql-p1b* 會實跑 `npm run bootstrap` / `migration:run`）。
