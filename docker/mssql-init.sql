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
