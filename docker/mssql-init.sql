-- P0（MSSQL 遷移）：本機 dev 容器初始化
-- 由 docker-compose 的 mssql-init 服務執行（等 mssql 起來後 sqlcmd -i）。
-- 目的：建立 CDMP 資料庫（collation 對齊 prod/來源系統的硬性要求 Chinese_Taiwan_Stroke_BIN）
--       + app 專用 SQL login（dev-only 密碼，比照 docker-compose 既有 cdmp_secret 慣例）。
-- 注意：這是本機 dev 容器，非 prod；勿把此檔的密碼用於任何正式環境。

IF DB_ID('CDMP') IS NULL
  CREATE DATABASE CDMP COLLATE Chinese_Taiwan_Stroke_BIN;
GO

IF SUSER_ID('cdmp') IS NULL
  CREATE LOGIN cdmp WITH PASSWORD = 'Cdmp_Dev_2026!', CHECK_POLICY = OFF;
GO

USE CDMP;
GO

IF USER_ID('cdmp') IS NULL
  CREATE USER cdmp FOR LOGIN cdmp;
GO

ALTER ROLE db_owner ADD MEMBER cdmp;
GO

PRINT 'CDMP ready: collation=' + CONVERT(varchar(128), DATABASEPROPERTYEX('CDMP','Collation'));
GO

-- AD-E07-38 P1a（R-MSSQL-P1A-01）：獨立 CDMP_TEST 資料庫，供 *.mssql.spec.ts 使用，
-- 與 dev 用 CDMP 隔離（避免測試 synchronize 污染開發者手動資料）。collation 比照 CDMP。
IF DB_ID('CDMP_TEST') IS NULL
  CREATE DATABASE CDMP_TEST COLLATE Chinese_Taiwan_Stroke_BIN;
GO

USE CDMP_TEST;
GO

IF USER_ID('cdmp') IS NULL
  CREATE USER cdmp FOR LOGIN cdmp;
GO

ALTER ROLE db_owner ADD MEMBER cdmp;
GO

PRINT 'CDMP_TEST ready: collation=' + CONVERT(varchar(128), DATABASEPROPERTYEX('CDMP_TEST','Collation'));
GO

-- AD-E07-43 P5a（I-MSSQL-CI-BOOTSTRAP-01）：P1b2 / P1b3 baseline-migration 測試專用之隔離資料庫。
-- 這兩支 spec 會對其連線的資料庫執行真實 CLI `migration:run`（P1b3 再加全套 seed），並於 beforeAll/afterAll
-- 反覆清空 dbo（P1b2 更斷言「起始 dbo 為空」）。若它們沿用 CDMP_TEST，會把 CI bootstrap 建於
-- CDMP_TEST.dbo 的 baseline（P3a/P5b 依賴之 36 業務表 + queue_job + customer_core）清掉，導致下游 spec skip。
-- 故各自隔離一庫（fresh、empty），與共用之 CDMP_TEST.dbo 完全解耦；collation 比照 CDMP_TEST。
IF DB_ID('CDMP_P1B2') IS NULL
  CREATE DATABASE CDMP_P1B2 COLLATE Chinese_Taiwan_Stroke_BIN;
GO

USE CDMP_P1B2;
GO

IF USER_ID('cdmp') IS NULL
  CREATE USER cdmp FOR LOGIN cdmp;
GO

ALTER ROLE db_owner ADD MEMBER cdmp;
GO

PRINT 'CDMP_P1B2 ready: collation=' + CONVERT(varchar(128), DATABASEPROPERTYEX('CDMP_P1B2','Collation'));
GO

IF DB_ID('CDMP_P1B3') IS NULL
  CREATE DATABASE CDMP_P1B3 COLLATE Chinese_Taiwan_Stroke_BIN;
GO

USE CDMP_P1B3;
GO

IF USER_ID('cdmp') IS NULL
  CREATE USER cdmp FOR LOGIN cdmp;
GO

ALTER ROLE db_owner ADD MEMBER cdmp;
GO

PRINT 'CDMP_P1B3 ready: collation=' + CONVERT(varchar(128), DATABASEPROPERTYEX('CDMP_P1B3','Collation'));
GO

-- AD-E07-43 P5a：pattern-b（P1c PARAM）同屬「假設 dbo 為空、於 dbo 建/丟 baseline 名稱之表」的測試——
-- 其 PARAM-003 斷言 customer_core 缺表錯誤，PARAM-007/016 建立並於 afterAll DROP 簡化版
-- ob_arreturndf_min_cap / ob_monthly_run_result / ob_pool_data / ob_emphire / ob_list_definition。
-- 若沿用 CDMP_TEST，bootstrap 後 customer_core 已存在（PARAM-003 失敗）、且其 DROP 會殃及 baseline。
-- 故亦隔離一個 fresh、empty 之庫（永不 bootstrap），保其「dbo 空」設計前提。
IF DB_ID('CDMP_PATTERNB') IS NULL
  CREATE DATABASE CDMP_PATTERNB COLLATE Chinese_Taiwan_Stroke_BIN;
GO

USE CDMP_PATTERNB;
GO

IF USER_ID('cdmp') IS NULL
  CREATE USER cdmp FOR LOGIN cdmp;
GO

ALTER ROLE db_owner ADD MEMBER cdmp;
GO

PRINT 'CDMP_PATTERNB ready: collation=' + CONVERT(varchar(128), DATABASEPROPERTYEX('CDMP_PATTERNB','Collation'));
GO

-- AD-E07-43 P5b（REG-006 / I-MSSQL-CI-BOOTSTRAP-01）：其餘 5 條生產 ETL pipeline 端對端驗證專用之隔離資料庫。
-- P5b 的 4 條 fullMode pipeline（ob_arreturndf_min_cap / ob_calendar / ob_emphire / ob_pool_data）之
-- target_load 走 TRUNCATE + INSERT 全量替換，1 條 partition_replace（ob_pool_data_list）走 DELETE + INSERT。
-- 這 4 張 fullMode 目標表（ob_pool_data / ob_pool_data_list / ob_emphire / ob_calendar）恰與 P3a/P3c/P3d
-- CI 依賴之 CDMP_TEST.dbo 共用 baseline 表高度重疊；若 P5b 於 CDMP_TEST.dbo 執行 TRUNCATE，會在
-- --no-file-parallelism 序列中清空後續 P3 系列所需之共用 baseline 表列（乃至整表狀態），造成跨 spec 干擾。
-- 故 P5b 亦比照 P1b2/P1b3/pattern-b 隔離一個 fresh 庫，target/raw fixture 皆由 p5b harness 自建（idempotent，
-- 不依賴 migration:run），與共用 CDMP_TEST.dbo 完全解耦；collation 比照 CDMP_TEST。
IF DB_ID('CDMP_P5B') IS NULL
  CREATE DATABASE CDMP_P5B COLLATE Chinese_Taiwan_Stroke_BIN;
GO

USE CDMP_P5B;
GO

IF USER_ID('cdmp') IS NULL
  CREATE USER cdmp FOR LOGIN cdmp;
GO

ALTER ROLE db_owner ADD MEMBER cdmp;
GO

PRINT 'CDMP_P5B ready: collation=' + CONVERT(varchar(128), DATABASEPROPERTYEX('CDMP_P5B','Collation'));
GO
